import { NextRequest } from "next/server";
import { decomposeTask } from "@/lib/agents/decompose";
import { runWorkerAgent } from "@/lib/agents/worker";
import { streamSynthesizer } from "@/lib/agents/synthesizer";
import { calculateShapley } from "@/lib/shapley";
import { verifyTrace } from "@/lib/trace";
import { SSEEvent, ContributionTrace, LLMConfig } from "@/lib/types";

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  const { query, payment_usdc, llm_config } = await request.json();
  const taskId = `task-${Date.now().toString(36)}`;

  // Resolve LLM config: prefer user-provided, fallback to env var
  let resolvedConfig: LLMConfig | undefined = llm_config;
  if (!resolvedConfig?.apiKey && process.env.KIMI_API_KEY) {
    resolvedConfig = {
      provider: "kimi",
      apiKey: process.env.KIMI_API_KEY,
    };
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(sseEncode(event)));
      };

      try {
        const traces: ContributionTrace[] = [];

        // --- Phase 0: Decompose task ---
        const decomposition = await decomposeTask(query, resolvedConfig);
        send({ type: "task_decomposed", decomposition });

        // --- Phase 1: Run Researcher A and B in parallel ---
        send({
          type: "agent_start",
          agent: "researcher_a",
          action: "research",
        });
        send({
          type: "agent_start",
          agent: "researcher_b",
          action: "research",
        });

        const [resultA, resultB] = await Promise.all([
          runWorkerAgent(
            taskId,
            "researcher_a",
            decomposition.subtask_a,
            query,
            resolvedConfig
          ),
          runWorkerAgent(
            taskId,
            "researcher_b",
            decomposition.subtask_b,
            query,
            resolvedConfig
          ),
        ]);

        // Stream researcher A results
        const linesA = resultA.content.split("\n");
        for (const line of linesA) {
          send({
            type: "agent_chunk",
            agent: "researcher_a",
            content: line + "\n",
          });
          await new Promise((r) => setTimeout(r, 100));
        }
        send({
          type: "agent_done",
          agent: "researcher_a",
          trace: resultA.trace,
        });
        traces.push(resultA.trace);

        // Stream researcher B results
        const linesB = resultB.content.split("\n");
        for (const line of linesB) {
          send({
            type: "agent_chunk",
            agent: "researcher_b",
            content: line + "\n",
          });
          await new Promise((r) => setTimeout(r, 100));
        }
        send({
          type: "agent_done",
          agent: "researcher_b",
          trace: resultB.trace,
        });
        traces.push(resultB.trace);

        // --- Phase 2: Run Synthesizer (streams) ---
        send({
          type: "agent_start",
          agent: "synthesizer",
          action: "synthesize",
        });

        const synthGen = streamSynthesizer(
          taskId,
          query,
          decomposition.synthesis_prompt,
          {
            researcher_a: resultA.content,
            researcher_b: resultB.content,
          },
          resolvedConfig
        );
        let synthResult:
          | { content: string; trace: ContributionTrace }
          | undefined;

        while (true) {
          const { done, value } = await synthGen.next();
          if (done) {
            synthResult = value;
            break;
          }
          send({ type: "agent_chunk", agent: "synthesizer", content: value });
        }

        if (synthResult) {
          send({
            type: "agent_done",
            agent: "synthesizer",
            trace: synthResult.trace,
          });
          traces.push(synthResult.trace);
        }

        // --- Phase 3: Verify traces and calculate Shapley ---
        for (const trace of traces) {
          const valid = verifyTrace(trace);
          if (!valid) {
            send({
              type: "error",
              message: `Invalid signature for agent ${trace.agent}`,
            });
            controller.close();
            return;
          }
        }

        const shapleyResult = calculateShapley(taskId, payment_usdc || 10);
        send({ type: "shapley_result", result: shapleyResult });

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
