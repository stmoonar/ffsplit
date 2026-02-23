import { LLMConfig, LLMProvider } from "./types";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatOptions {
  temperature?: number;
  stream?: boolean;
}

// Default models and base URLs for each provider
const PROVIDER_DEFAULTS: Record<
  LLMProvider,
  { baseUrl: string; model: string }
> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  kimi: { baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  claude: {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-3-5-sonnet-20241022",
  },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
  qwen: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-max" },
  grok: { baseUrl: "https://api.x.ai/v1", model: "grok-2-latest" },
  ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3.2" },
};

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  kimi: "Kimi",
  claude: "Anthropic",
  gemini: "Google",
  qwen: "Alibaba",
  grok: "xAI",
  ollama: "Ollama",
};

/** Fallback model lists — used when the provider's /models API is unavailable
 *  (e.g. Anthropic has no such endpoint) or when no API key is configured yet. */
export const FALLBACK_MODELS: Record<LLMProvider, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  kimi: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  claude: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-pro-exp"],
  qwen: ["qwen-plus", "qwen-max", "qwen-long", "qwen-turbo", "qwen2.5-coder-32b-instruct"],
  grok: ["grok-2-latest", "grok-2-vision-latest"],
  ollama: ["llama3.2", "qwen2.5", "deepseek-r1"],
};

function getBaseUrl(config: LLMConfig): string {
  return config.baseUrl || PROVIDER_DEFAULTS[config.provider].baseUrl;
}

function getModel(config: LLMConfig): string {
  return config.model || PROVIDER_DEFAULTS[config.provider].model;
}

export function getDefaultModel(provider: LLMProvider): string {
  return PROVIDER_DEFAULTS[provider].model;
}

export function getDefaultBaseUrl(provider: LLMProvider): string {
  return PROVIDER_DEFAULTS[provider].baseUrl;
}

// --- Non-streaming chat completion ---

export async function chatCompletion(
  config: LLMConfig | undefined,
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<{ content: string; inputTokens: number; outputTokens: number } | null> {
  if (!config?.apiKey) return null;

  if (config.provider === "claude") {
    return claudeChat(config, messages, options);
  }
  return openaiCompatibleChat(config, messages, options);
}

// --- Streaming chat completion ---

export async function* chatCompletionStream(
  config: LLMConfig | undefined,
  messages: ChatMessage[],
  options?: ChatOptions
): AsyncGenerator<string, { inputTokens: number; outputTokens: number }> {
  if (!config?.apiKey) {
    return { inputTokens: 0, outputTokens: 0 };
  }

  if (config.provider === "claude") {
    return yield* claudeChatStream(config, messages, options);
  }
  return yield* openaiCompatibleChatStream(config, messages, options);
}

// ========================
// OpenAI-compatible path (OpenAI, Deepseek, Kimi)
// ========================

async function openaiCompatibleChat(
  config: LLMConfig,
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const baseUrl = getBaseUrl(config);
  const model = getModel(config);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`${config.provider} API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}

async function* openaiCompatibleChatStream(
  config: LLMConfig,
  messages: ChatMessage[],
  options?: ChatOptions
): AsyncGenerator<string, { inputTokens: number; outputTokens: number }> {
  const baseUrl = getBaseUrl(config);
  const model = getModel(config);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`${config.provider} API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let inputTokens = 0;
  let outputTokens = 0;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
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

  return { inputTokens, outputTokens };
}

// ========================
// Claude (Anthropic) path
// ========================

async function claudeChat(
  config: LLMConfig,
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const baseUrl = getBaseUrl(config);
  const model = getModel(config);

  // Extract system message
  const systemMsg = messages.find((m) => m.role === "system")?.content;
  const nonSystemMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model,
    max_tokens: 2048,
    messages: nonSystemMessages,
    temperature: options?.temperature ?? 0.7,
  };
  if (systemMsg) body.system = systemMsg;

  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const content =
    data.content
      ?.filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("") || "";

  return {
    content,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

async function* claudeChatStream(
  config: LLMConfig,
  messages: ChatMessage[],
  options?: ChatOptions
): AsyncGenerator<string, { inputTokens: number; outputTokens: number }> {
  const baseUrl = getBaseUrl(config);
  const model = getModel(config);

  const systemMsg = messages.find((m) => m.role === "system")?.content;
  const nonSystemMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model,
    max_tokens: 2048,
    messages: nonSystemMessages,
    stream: true,
    temperature: options?.temperature ?? 0.7,
  };
  if (systemMsg) body.system = systemMsg;

  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let inputTokens = 0;
  let outputTokens = 0;

  if (reader) {
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);

        try {
          const parsed = JSON.parse(data);
          if (
            parsed.type === "content_block_delta" &&
            parsed.delta?.type === "text_delta"
          ) {
            yield parsed.delta.text;
          }
          if (parsed.type === "message_delta" && parsed.usage) {
            outputTokens = parsed.usage.output_tokens || 0;
          }
          if (parsed.type === "message_start" && parsed.message?.usage) {
            inputTokens = parsed.message.usage.input_tokens || 0;
          }
        } catch {
          // Skip malformed lines
        }
      }
    }
  }

  return { inputTokens, outputTokens };
}
