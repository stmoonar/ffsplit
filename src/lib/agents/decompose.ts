import { TaskDecomposition, LLMConfig } from "../types";
import { chatCompletion } from "../llm";

const SYSTEM_PROMPT = `You are a task decomposition agent. Given a user's task, break it into independent research subtasks. Decide the optimal number of subtasks (2 to 5) based on task complexity.

Respond in valid JSON only, no markdown, no explanation:
{
  "subtasks": [
    { "id": "worker_1", "description": "First research subtask (specific, actionable)" },
    { "id": "worker_2", "description": "Second research subtask (specific, actionable)" }
  ],
  "synthesis_prompt": "Instruction for combining all research results into a final answer"
}

Rules:
- Use 2 subtasks for simple questions, 3-4 for moderate complexity, 5 for very complex multi-faceted tasks
- Each subtask id must be "worker_1", "worker_2", "worker_3", etc.
- Each subtask should cover a different aspect and be independently executable
- The synthesis_prompt should explain how to combine all results
- Use the same language as the user's input`;

export async function decomposeTask(
  query: string,
  llmConfig?: LLMConfig
): Promise<TaskDecomposition> {
  const hasUsableLlm =
    !!llmConfig &&
    (llmConfig.provider === "ollama" || !!llmConfig.apiKey?.trim());

  try {
    const result = await chatCompletion(
      llmConfig,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query },
      ],
      { temperature: 0.3 }
    );

    if (result) {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (
          Array.isArray(parsed.subtasks) &&
          parsed.subtasks.length >= 2 &&
          parsed.synthesis_prompt
        ) {
          return parsed as TaskDecomposition;
        }
      }
    }
  } catch (error) {
    if (hasUsableLlm) {
      throw new Error(
        `Decompose failed with configured model: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
    console.warn("Decompose API failed, using mock:", error);
  }

  if (hasUsableLlm) {
    throw new Error("Decompose returned invalid or empty structured output");
  }

  return mockDecompose(query);
}

function mockDecompose(query: string): TaskDecomposition {
  const topic = query.length > 20 ? query.slice(0, 20) + "..." : query;

  return {
    subtasks: [
      {
        id: "worker_1",
        description: `Research the background, terminology, and current landscape for "${topic}".`,
      },
      {
        id: "worker_2",
        description: `Collect concrete data points, examples, and practical options for "${topic}".`,
      },
    ],
    synthesis_prompt:
      "Combine all worker findings into a structured final report with key insights, options, and clear recommendations.",
  };
}
