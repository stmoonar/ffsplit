import { ContributionTrace, LLMConfig } from "../types";
import { createTrace } from "../trace";
import { chatCompletionStream } from "../llm";

interface SynthesizerResult {
  content: string;
  trace: ContributionTrace;
}

function hasUsableLlm(config?: LLMConfig): boolean {
  return !!config && (config.provider === "ollama" || !!config.apiKey?.trim());
}

export async function* streamSynthesizer(
  taskId: string,
  query: string,
  synthesisPrompt: string,
  workerOutputs: Record<string, string>,
  llmConfig?: LLMConfig
): AsyncGenerator<string, SynthesizerResult> {
  const startTime = Date.now();
  let fullContent = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let usedMock = false;
  const useRealLlm = hasUsableLlm(llmConfig);

  const workerSection = Object.entries(workerOutputs)
    .map(([id, content]) => `--- ${id.replace("_", " ")} findings ---\n${content}`)
    .join("\n\n");

  try {
    const stream = chatCompletionStream(
      llmConfig,
      [
        {
          role: "system",
          content: `You are a synthesis agent. Your job is to combine research from ${Object.keys(workerOutputs).length} agents into a coherent, actionable final report. Use the same language as the user's query. Format with markdown headers and bullet points. Keep under 500 words.`,
        },
        {
          role: "user",
          content: `Original task: ${query}

Synthesis instruction: ${synthesisPrompt}

${workerSection}

Please synthesize these into a comprehensive final report.`,
        },
      ],
      { temperature: 0.7 }
    );

    let hasContent = false;
    while (true) {
      const { done, value } = await stream.next();
      if (done) {
        if (value) {
          inputTokens = value.inputTokens;
          outputTokens = value.outputTokens;
        }
        break;
      }
      hasContent = true;
      fullContent += value;
      yield value;
    }

    if (!hasContent) {
      usedMock = true;
    }
  } catch (error) {
    if (useRealLlm) {
      throw new Error(
        `Synthesizer failed with configured model: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
    console.warn("Synthesizer API failed, falling back to mock:", error);
    usedMock = true;
  }

  if (usedMock) {
    if (useRealLlm) {
      throw new Error("Synthesizer returned an empty response");
    }

    fullContent = "";
    const mockResponse = generateMockSynthesis(query, Object.keys(workerOutputs).length);
    const chars = mockResponse.split("");
    for (let i = 0; i < chars.length; i++) {
      fullContent += chars[i];
      if (i % 3 === 0) {
        yield chars.slice(Math.max(0, i - 2), i + 1).join("");
        await new Promise((r) => setTimeout(r, 15));
      }
    }
    const remainder = chars.length % 3;
    if (remainder > 0) {
      yield chars.slice(-remainder).join("");
    }
    inputTokens = 200;
    outputTokens = 400;
  }

  const latency = Date.now() - startTime;

  const trace = await createTrace(taskId, "synthesizer", "synthesize", {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: latency,
    entities_returned: 12,
    entities_adopted: 12,
    constraints_met: true,
  });

  return { content: fullContent, trace };
}

function generateMockSynthesis(query: string, workerCount: number): string {
  const topic = query.length > 30 ? query.slice(0, 30) + "..." : query;

  return `## Final Synthesis Report

### Task
${topic}

### Integrated Findings

- ${workerCount} worker outputs were merged into a single recommendation
- Common signals were identified and conflicting points were reconciled
- The final plan balances execution speed, cost, and quality

### Suggested Plan

1. Start with a narrow pilot to validate assumptions quickly
2. Measure outcome quality and resource usage with clear metrics
3. Expand in stages only after early targets are met

### Risk Controls

- Define milestone-based go/no-go checkpoints
- Keep contingency budget for uncertainty
- Re-prioritize based on observed ROI
`;
}
