import { AgentId, ContributionTrace, LLMConfig } from "../types";
import { createTrace } from "../trace";
import { chatCompletion } from "../llm";

export interface WorkerResult {
  content: string;
  trace: ContributionTrace;
}

function hasUsableLlm(config?: LLMConfig): boolean {
  return !!config && (config.provider === "ollama" || !!config.apiKey?.trim());
}

export async function runWorkerAgent(
  taskId: string,
  agentId: AgentId,
  subtask: string,
  originalQuery: string,
  llmConfig?: LLMConfig
): Promise<WorkerResult> {
  const startTime = Date.now();
  let content = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const useRealLlm = hasUsableLlm(llmConfig);

  try {
    const result = await chatCompletion(
      llmConfig,
      [
        {
          role: "system",
          content:
            "You are a research agent. Complete the assigned subtask thoroughly and concisely. Use the same language as the user's original query. Format with markdown. Keep under 400 words.",
        },
        {
          role: "user",
          content: `Original task: ${originalQuery}\n\nYour assigned subtask: ${subtask}`,
        },
      ],
      { temperature: 0.7 }
    );

    if (result) {
      content = result.content;
      inputTokens = result.inputTokens || 80;
      outputTokens = result.outputTokens || 350;
    }
  } catch (error) {
    if (useRealLlm) {
      throw new Error(
        `Worker ${agentId} failed with configured model: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
    console.warn(`Worker ${agentId} API failed, using mock:`, error);
  }

  if (!content) {
    if (useRealLlm) {
      throw new Error(`Worker ${agentId} returned an empty response`);
    }

    await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
    content = generateMockResponse(agentId, subtask, originalQuery);
    inputTokens = 80;
    outputTokens = 350;
  }

  const latency = Date.now() - startTime;
  const entityCount = countEntities(content);

  const trace = await createTrace(taskId, agentId, "research", {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: latency,
    entities_returned: entityCount,
    entities_adopted: Math.ceil(entityCount * 0.7),
    constraints_met: true,
  });

  return { content, trace };
}

function countEntities(content: string): number {
  const bullets = (content.match(/^[-*]\s/gm) || []).length;
  const headers = (content.match(/^#{1,4}\s/gm) || []).length;
  return Math.max(bullets + headers, 3);
}

function generateMockResponse(
  agentId: AgentId,
  subtask: string,
  originalQuery: string
): string {
  const topic =
    originalQuery.length > 30 ? originalQuery.slice(0, 30) + "..." : originalQuery;
  const workerNum = parseInt(agentId.replace("worker_", ""), 10) || 1;

  if (workerNum % 2 === 1) {
    return `## Research Notes - ${agentId}

### Topic Background: ${topic}

Task: ${subtask}

- Key concepts and domain terms were identified
- Current ecosystem and recent trends were summarized
- Main constraints and opportunities were mapped

### Preliminary Insights

1. The space is evolving quickly and requires staged decisions
2. Trade-offs depend on budget, speed, and risk tolerance
3. Practical rollout should start with a narrow pilot
`;
  }

  return `## Data and Options - ${agentId}

### Practical Findings for: ${topic}

Task: ${subtask}

| Option | Cost | Timeline | Expected Outcome |
|---|---:|---:|---|
| Baseline | Low | 1-2 weeks | Fast validation |
| Balanced | Medium | 2-4 weeks | Better quality |
| Advanced | High | 4-8 weeks | Best long-term result |

### Recommendation

- Start from baseline to validate assumptions quickly
- Move to balanced option if early signals are positive
- Reserve advanced path for proven high-ROI cases
`;
}
