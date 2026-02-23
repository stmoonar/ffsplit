import { TaskDecomposition, LLMConfig } from "../types";
import { chatCompletion } from "../llm";

const SYSTEM_PROMPT = `You are a task decomposition agent. Given a user's task, break it into exactly 2 independent research subtasks and a synthesis instruction.

Respond in valid JSON only, no markdown, no explanation:
{
  "subtask_a": "First research subtask description (specific, actionable)",
  "subtask_b": "Second research subtask description (specific, actionable)",
  "synthesis_prompt": "Instruction for combining both research results into a final answer"
}

Rules:
- subtask_a and subtask_b should cover different aspects of the task
- Each subtask should be independently executable
- The synthesis_prompt should explain how to combine both results
- Use the same language as the user's input`;

export async function decomposeTask(
  query: string,
  llmConfig?: LLMConfig
): Promise<TaskDecomposition> {
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
        return JSON.parse(jsonMatch[0]) as TaskDecomposition;
      }
    }
  } catch (error) {
    console.warn("Decompose API failed, using mock:", error);
  }

  return mockDecompose(query);
}

function mockDecompose(query: string): TaskDecomposition {
  const topic = query.length > 20 ? query.slice(0, 20) + "..." : query;

  return {
    subtask_a: `针对「${topic}」进行背景调研，收集相关的基础信息、关键概念和行业现状`,
    subtask_b: `针对「${topic}」收集具体的数据、案例和实际方案，提供可操作的建议`,
    synthesis_prompt: `将两个研究员的调研结果整合为一份结构化的完整报告，涵盖背景分析和具体方案`,
  };
}
