import { NextRequest } from "next/server";
import { decomposeTask } from "@/lib/agents/decompose";
import { runWorkerAgent } from "@/lib/agents/worker";
import { streamSynthesizer } from "@/lib/agents/synthesizer";
import { calculateShapley } from "@/lib/shapley";
import { verifyTrace, getAgentAddress } from "@/lib/trace";
import { SSEEvent, ContributionTrace, LLMConfig, ModelProfile } from "@/lib/types";
import { isContractConfigured, submitSplitAndSettle } from "@/lib/contracts/vault";

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  const {
    query,
    payment_usdc,
    model_profiles,
    default_profile_id,
    agent_assignments,
    llm_config,
    agent_llm_configs,
  } = await request.json();

  const taskId = `task-${Date.now().toString(36)}`;

  const profileMap = new Map<string, ModelProfile>();
  if (Array.isArray(model_profiles)) {
    for (const p of model_profiles) {
      profileMap.set(p.id, p);
    }
  }

  const isUsableConfig = (cfg?: LLMConfig): cfg is LLMConfig => {
    if (!cfg) return false;
    if (cfg.provider === "ollama") return true;
    return !!cfg.apiKey?.trim();
  };

  const profileToConfig = (profile: ModelProfile): LLMConfig => ({
    provider: profile.provider,
    apiKey: profile.apiKey,
    model: profile.model,
    baseUrl: profile.baseUrl,
  });

  const resolveConfig = (agentId: string): LLMConfig | undefined => {
    if (agent_assignments?.[agentId]) {
      const profile = profileMap.get(agent_assignments[agentId]);
      if (profile) {
        const cfg = profileToConfig(profile);
        if (isUsableConfig(cfg)) return cfg;
      }
    }

    if (agent_llm_configs?.[agentId] && isUsableConfig(agent_llm_configs[agentId])) {
      return agent_llm_configs[agentId];
    }

    if (default_profile_id) {
      const profile = profileMap.get(default_profile_id);
      if (profile) {
        const cfg = profileToConfig(profile);
        if (isUsableConfig(cfg)) return cfg;
      }
    }

    if (isUsableConfig(llm_config)) return llm_config;

    if (process.env.KIMI_API_KEY) {
      return { provider: "kimi" as const, apiKey: process.env.KIMI_API_KEY };
    }

    return undefined;
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(sseEncode(event)));
      };

      try {
        const traces: ContributionTrace[] = [];

        const decomposition = await decomposeTask(query, resolveConfig("decomposer"));
        send({ type: "task_decomposed", decomposition });

        const workerIds = decomposition.subtasks.map((s) => s.id);

        for (const wId of workerIds) {
          send({ type: "agent_start", agent: wId, action: "research" });
        }

        const workerResults = await Promise.all(
          decomposition.subtasks.map((subtask) =>
            runWorkerAgent(
              taskId,
              subtask.id,
              subtask.description,
              query,
              resolveConfig(subtask.id)
            )
          )
        );

        for (let i = 0; i < workerResults.length; i++) {
          const result = workerResults[i];
          const wId = workerIds[i];
          const lines = result.content.split("\n");
          for (const line of lines) {
            send({ type: "agent_chunk", agent: wId, content: line + "\n" });
            await new Promise((r) => setTimeout(r, 80));
          }
          send({ type: "agent_done", agent: wId, trace: result.trace });
          traces.push(result.trace);
        }

        send({ type: "agent_start", agent: "synthesizer", action: "synthesize" });

        const workerOutputs: Record<string, string> = {};
        for (let i = 0; i < workerResults.length; i++) {
          workerOutputs[workerIds[i]] = workerResults[i].content;
        }

        const synthGen = streamSynthesizer(
          taskId,
          query,
          decomposition.synthesis_prompt,
          workerOutputs,
          resolveConfig("synthesizer")
        );
        let synthResult: { content: string; trace: ContributionTrace } | undefined;

        while (true) {
          const { done, value } = await synthGen.next();
          if (done) {
            synthResult = value;
            break;
          }
          send({ type: "agent_chunk", agent: "synthesizer", content: value });
        }

        if (synthResult) {
          send({ type: "agent_done", agent: "synthesizer", trace: synthResult.trace });
          traces.push(synthResult.trace);
        }

        for (const trace of traces) {
          const valid = verifyTrace(trace);
          if (!valid) {
            send({ type: "error", message: `Invalid signature for agent ${trace.agent}` });
            controller.close();
            return;
          }
        }

        const shapleyResult = calculateShapley(taskId, payment_usdc || 10, traces);
        send({ type: "shapley_result", result: shapleyResult });

        if (isContractConfigured()) {
          send({ type: "settlement_start" });
          try {
            const agents = shapleyResult.agents.map((a) => getAgentAddress(a.agent));
            const sharesBasisPoints = shapleyResult.agents.map((a) =>
              Math.round(a.share_percent * 100)
            );

            const bpSum = sharesBasisPoints.reduce((s, v) => s + v, 0);
            if (bpSum !== 10000) {
              sharesBasisPoints[0] += 10000 - bpSum;
            }

            const paymentWei = BigInt(Math.floor((payment_usdc || 10) * 1e15));

            const settlement = await submitSplitAndSettle(
              taskId,
              agents,
              sharesBasisPoints,
              paymentWei
            );

            const explorerBaseUrl =
              process.env.BASE_SEPOLIA_RPC?.includes("127.0.0.1") ||
              process.env.NODE_ENV === "development"
                ? ""
                : "https://sepolia.basescan.org";

            send({
              type: "settlement_result",
              result: {
                splitTxHash: settlement.splitTxHash,
                settleTxHash: settlement.settleTxHash,
                createTxHash: settlement.createTxHash,
                explorerBaseUrl,
              },
            });
          } catch (error) {
            console.error("Settlement failed:", error);
            send({
              type: "error",
              message: `On-chain settlement failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
          }
        }

        send({ type: "task_complete", task_id: taskId });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
