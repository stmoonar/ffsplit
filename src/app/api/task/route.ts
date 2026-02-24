import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { decomposeTask } from "@/lib/agents/decompose";
import { runWorkerAgent } from "@/lib/agents/worker";
import { streamSynthesizer } from "@/lib/agents/synthesizer";
import { calculateShapley } from "@/lib/shapley";
import { verifyTrace, getAgentAddress } from "@/lib/trace";
import { SSEEvent, ContributionTrace, LLMConfig, ModelProfile } from "@/lib/types";
import {
  isContractConfigured,
  signSplitData,
  verifyCreateTaskTx,
  getTaskAgentAddresses,
  getVaultAddress,
  getUsdcAddress,
  getChainId,
} from "@/lib/contracts/vault";

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// Parse x402 Authorization header: x402 tx="0x...", sig="0x..."
function parseX402Auth(header: string | null): { tx: string; sig: string } | null {
  if (!header || !header.startsWith("x402 ")) return null;
  const params = header.slice(5);
  const txMatch = params.match(/tx="(0x[a-fA-F0-9]+)"/);
  const sigMatch = params.match(/sig="(0x[a-fA-F0-9]+)"/);
  if (!txMatch || !sigMatch) return null;
  return { tx: txMatch[1], sig: sigMatch[1] };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    query,
    payment_usdc,
    model_profiles,
    default_profile_id,
    agent_assignments,
    llm_config,
    agent_llm_configs,
    task_id: clientTaskId,
    sender_address: senderAddress,
    decompose_only,
    max_workers,
  } = body;

  const maxWorkers = typeof max_workers === "number" && max_workers >= 2 && max_workers <= 8 ? max_workers : 5;

  // --- Build LLM config resolver (shared by decompose-only and full flow) ---
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

  // --- Phase 0a: Decompose-only mode (returns agent list for on-chain registration) ---
  if (decompose_only) {
    try {
      const decomposition = await decomposeTask(query, resolveConfig("decomposer"), maxWorkers);
      const agentIds = [...decomposition.subtasks.map((s) => s.id), "synthesizer"];
      const agentAddresses = agentIds.map((id) => getAgentAddress(id));
      return NextResponse.json({
        decomposition,
        agent_ids: agentIds,
        agent_addresses: agentAddresses,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Decomposition failed" },
        { status: 500 }
      );
    }
  }

  // --- x402 Payment Protocol ---
  const authHeader = request.headers.get("authorization");
  const x402Auth = parseX402Auth(authHeader);

  // Phase 0: If no payment credential and contract is configured, return 402
  if (!x402Auth && isContractConfigured()) {
    const chainId = await getChainId();
    const amountUsdc = payment_usdc || 10;
    // USDC has 6 decimals
    const amountRaw = Math.floor(amountUsdc * 1_000_000).toString();

    return NextResponse.json(
      {
        payment_required: true,
        vault_address: getVaultAddress(),
        usdc_address: getUsdcAddress(),
        amount_usdc: amountUsdc,
        amount_raw: amountRaw,
        chain_id: chainId,
      },
      {
        status: 402,
        headers: {
          "WWW-Authenticate": `x402 vault="${getVaultAddress()}", usdc="${getUsdcAddress()}", amount="${amountRaw}", chainId="${chainId}"`,
        },
      }
    );
  }

  // Phase 0.5: Verify payment credential if provided
  if (x402Auth && isContractConfigured()) {
    // Recover signer from the ownership proof signature
    const messageToSign = `x402-payment:${x402Auth.tx}`;
    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.verifyMessage(messageToSign, x402Auth.sig);
    } catch {
      return NextResponse.json(
        { error: "Invalid payment signature" },
        { status: 401 }
      );
    }

    // Verify the on-chain transaction
    if (!clientTaskId || !senderAddress) {
      return NextResponse.json(
        { error: "Missing task_id or sender_address in request body" },
        { status: 400 }
      );
    }

    // Verify the signature matches the claimed sender
    if (recoveredAddress.toLowerCase() !== senderAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "Payment signature does not match sender_address" },
        { status: 401 }
      );
    }

    const amountRaw = BigInt(Math.floor((payment_usdc || 10) * 1_000_000));
    const verification = await verifyCreateTaskTx(
      x402Auth.tx,
      clientTaskId,
      amountRaw,
      recoveredAddress
    );

    if (!verification.valid) {
      return NextResponse.json(
        { error: `Payment verification failed: ${verification.error}` },
        { status: 402 }
      );
    }
  }

  // Use client-provided taskId (bound to payment) or generate one
  const taskId = clientTaskId || `task-${Date.now().toString(36)}`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(sseEncode(event)));
      };

      try {
        const traces: ContributionTrace[] = [];

        // Send payment verified event
        if (x402Auth) {
          send({ type: "payment_verified", tx_hash: x402Auth.tx });
        }

        const decomposition = await decomposeTask(query, resolveConfig("decomposer"), maxWorkers);
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

        // Phase 6: Generate EIP-712 settlement signature (permissionless)
        if (isContractConfigured()) {
          send({ type: "settlement_start" });
          try {
            const taskIdBytes32 = /^0x[a-fA-F0-9]{64}$/.test(taskId)
              ? taskId
              : ethers.id(taskId);

            // Build address → raw share mapping (unrounded values)
            const shapleyRawMap = new Map<string, number>();
            for (const agent of shapleyResult.agents) {
              const address = getAgentAddress(agent.agent).toLowerCase();
              shapleyRawMap.set(address, agent.share_raw);
            }

            const agents = await getTaskAgentAddresses(taskIdBytes32);
            if (agents.length === 0) {
              throw new Error("On-chain task has no agents");
            }

            const matchedShares = agents.map(
              (address) => shapleyRawMap.get(address.toLowerCase()) ?? 0
            );
            const totalMatchedShare = matchedShares.reduce((sum, share) => sum + share, 0);
            if (totalMatchedShare <= 0) {
              throw new Error("No matching Shapley shares for on-chain agents");
            }
            const rawBasisPoints = matchedShares.map(
              (share) => (share / totalMatchedShare) * 10000
            );
            const floored = rawBasisPoints.map((s) => Math.floor(s));
            let remainder = 10000 - floored.reduce((s, v) => s + v, 0);
            const remainders = rawBasisPoints.map((s, i) => ({
              index: i,
              remainder: s - floored[i],
            }));
            remainders.sort((a, b) => b.remainder - a.remainder);
            const sharesBasisPoints = [...floored];
            for (let i = 0; i < remainder; i++) {
              sharesBasisPoints[remainders[i % remainders.length].index] += 1;
            }

            // Sign the split data instead of submitting directly
            const signedData = await signSplitData(
              taskIdBytes32,
              agents,
              sharesBasisPoints
            );

            const explorerBaseUrl =
              process.env.BASE_SEPOLIA_RPC?.includes("127.0.0.1") ||
              process.env.NODE_ENV === "development"
                ? ""
                : "https://sepolia.basescan.org";

            // Send settlement signature for frontend/relayer to submit
            send({
              type: "settlement_signature",
              data: {
                taskId: signedData.taskId,
                agents: signedData.agents,
                shares: signedData.shares.map((s) => s.toString()),
                signature: signedData.signature,
                vault_address: getVaultAddress(),
                explorerBaseUrl,
              },
            });
          } catch (error) {
            console.error("Settlement signing failed:", error);
            send({
              type: "error",
              message: `Settlement signing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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
