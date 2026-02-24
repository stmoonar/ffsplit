import { LLMConfig, LLMProvider } from "./types";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatOptions {
  temperature?: number;
  stream?: boolean;
}

function isKimiK25Model(config: LLMConfig, model: string): boolean {
  if (config.provider !== "kimi") return false;
  return model.toLowerCase().startsWith("kimi-k2.5");
}

function buildOpenAICompatibleBody(
  config: LLMConfig,
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
  forceStream?: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
  };

  if (forceStream) {
    body.stream = true;
  }

  const shouldSendTemperature = !isKimiK25Model(config, model);
  if (shouldSendTemperature) {
    body.temperature = options?.temperature ?? 0.7;
  }

  return body;
}

async function parseProviderError(response: Response): Promise<string> {
  const fallback = `API error: ${response.status}`;

  try {
    const data = await response.json();
    const detail =
      data?.error?.message || data?.error || data?.message || JSON.stringify(data);
    return `${fallback} - ${detail}`;
  } catch {
    try {
      const text = await response.text();
      if (text) return `${fallback} - ${text}`;
    } catch {
      // ignore
    }
    return fallback;
  }
}

function canCallProvider(config: LLMConfig | undefined): config is LLMConfig {
  if (!config) return false;
  if (config.provider === "ollama") return true;
  return !!config.apiKey?.trim();
}

// Default models and base URLs for each provider
const PROVIDER_DEFAULTS: Record<
  LLMProvider,
  { baseUrl: string; model: string }
> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  kimi: { baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2.5" },
  claude: {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-6",
  },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
  qwen: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  grok: { baseUrl: "https://api.x.ai/v1", model: "grok-3-mini" },
  ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3.3" },
  glm: { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-plus" },
  siliconflow: { baseUrl: "https://api.siliconflow.cn/v1", model: "deepseek-ai/DeepSeek-V3" },
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
  glm: "GLM",
  siliconflow: "SiliconFlow",
};

/** Fallback model lists — used when the provider's /models API is unavailable
 *  (e.g. Anthropic has no such endpoint) or when no API key is configured yet. */
export const FALLBACK_MODELS: Record<LLMProvider, string[]> = {
  openai: ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano", "o3"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  kimi: ["kimi-k2.5", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  claude: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
  gemini: ["gemini-3.1-pro", "gemini-3-pro", "gemini-2.5-flash", "gemini-2.5-pro"],
  qwen: ["qwen3.5-plus", "qwen3-max", "qwen-plus", "qwen-flash", "qwen3-vl-plus"],
  grok: ["grok-4", "grok-3", "grok-3-mini"],
  ollama: ["llama3.3", "deepseek-r1:7b", "qwen2.5:7b", "phi4:14b"],
  glm: ["glm-4-plus", "glm-4-flash", "glm-4-long", "glm-4v-plus"],
  siliconflow: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct", "THUDM/GLM-4-9B-Chat"],
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
  if (!canCallProvider(config)) return null;

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
  if (!canCallProvider(config)) {
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey?.trim()) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(buildOpenAICompatibleBody(config, model, messages, options)),
  });

  if (!response.ok) {
    const detail = await parseProviderError(response);
    throw new Error(`${config.provider} ${detail}`);
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey?.trim()) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(
      buildOpenAICompatibleBody(config, model, messages, options, true)
    ),
  });

  if (!response.ok) {
    const detail = await parseProviderError(response);
    throw new Error(`${config.provider} ${detail}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let inputTokens = 0;
  let outputTokens = 0;

  if (reader) {
    // Buffer needed because SSE lines can span multiple chunks
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
