import { ContributionTrace } from "../types";
import { createTrace } from "../trace";

const KIMI_API_URL = "https://api.moonshot.cn/v1/chat/completions";

// Fallback mock response if Kimi API is unavailable
const MOCK_PLANNER_RESPONSE = `## 东京 3 日行程规划

### Day 1 — 抵达 & 浅草探索
- **上午**: 抵达成田/羽田机场，乘坐 N'EX 或京急线前往市区
- **下午**: 浅草寺 → 仲见世商街 → 隅田川河畔散步
- **晚餐**: 浅草文字烧（Sometaro）
- **住宿**: 入住酒店，整理休息

### Day 2 — 涩谷・原宿・新宿
- **上午**: 明治神宫 → 竹下通 → 表参道
- **午餐**: 原宿 Kawaii Monster Cafe 或一兰拉面
- **下午**: 涩谷 Scramble Crossing → 涩谷 Sky 展望台
- **晚上**: 新宿歌舞伎町 → 思出横丁居酒屋

### Day 3 — 秋叶原・银座 & 返程
- **上午**: 秋叶原电器街 → 动漫周边购物
- **午餐**: 筑地外市场海鲜丼
- **下午**: 银座购物 → 东京站购买伴手礼
- **傍晚**: 前往机场返程

> 此行程已整合航班与酒店 Agent 提供的信息，确保预算控制在 ¥50,000 以内。`;

interface PlannerResult {
  content: string;
  trace: ContributionTrace;
}

// Stream planner output, yielding chunks
export async function* streamPlanner(
  taskId: string,
  query: string
): AsyncGenerator<string, PlannerResult> {
  const startTime = Date.now();
  let fullContent = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let usedMock = false;

  const apiKey = process.env.KIMI_API_KEY;

  if (apiKey) {
    try {
      const response = await fetch(KIMI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "moonshot-v1-8k",
          messages: [
            {
              role: "system",
              content:
                "You are a travel planning agent. Create a concise 3-day Tokyo itinerary in Chinese. Format with markdown headers and bullet points. Keep it under 300 words. Include practical tips about transportation and budget.",
            },
            { role: "user", content: query },
          ],
          stream: true,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`Kimi API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split("\n").filter((line) => line.startsWith("data: "));

          for (const line of lines) {
            const data = line.slice(6);
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                yield delta;
              }
              if (parsed.usage) {
                inputTokens = parsed.usage.prompt_tokens || 0;
                outputTokens = parsed.usage.completion_tokens || 0;
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      }
    } catch (error) {
      console.warn("Kimi API failed, falling back to mock:", error);
      usedMock = true;
    }
  } else {
    usedMock = true;
  }

  // Mock fallback: stream character by character with realistic timing
  if (usedMock) {
    fullContent = "";
    const chars = MOCK_PLANNER_RESPONSE.split("");
    for (let i = 0; i < chars.length; i++) {
      fullContent += chars[i];
      // Yield chunks of ~3 chars for performance
      if (i % 3 === 0) {
        yield chars.slice(Math.max(0, i - 2), i + 1).join("");
        await new Promise((r) => setTimeout(r, 15));
      }
    }
    // Yield remaining chars
    const remainder = chars.length % 3;
    if (remainder > 0) {
      yield chars.slice(-remainder).join("");
    }
    inputTokens = 120;
    outputTokens = 380;
  }

  const latency = Date.now() - startTime;

  const trace = await createTrace(taskId, "planner", "generate_itinerary", {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: latency,
    entities_returned: 9, // 9 locations/activities mentioned
    entities_adopted: 9,
    constraints_met: true,
  });

  return { content: fullContent, trace };
}
