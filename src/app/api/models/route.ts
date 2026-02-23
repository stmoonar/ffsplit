import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy endpoint to fetch the list of available models from an LLM provider.
 * Most providers expose an OpenAI-compatible GET /models endpoint.
 * Anthropic (Claude) does NOT have such an endpoint, so the client
 * should fall back to a hardcoded list for that provider.
 *
 * Query params:
 *   provider  – one of the supported LLMProvider values
 *   apiKey    – the user's API key (sent via header, NOT logged)
 *   baseUrl   – (optional) custom base URL override
 */

// Default base URLs — mirrors what lives in lib/llm.ts but we keep a
// server-side copy so the route is self-contained.
const BASE_URLS: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    deepseek: "https://api.deepseek.com/v1",
    kimi: "https://api.moonshot.cn/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
    qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    grok: "https://api.x.ai/v1",
    ollama: "http://localhost:11434/v1",
};

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const provider = searchParams.get("provider") || "";
    const apiKey = searchParams.get("apiKey") || "";
    const customBaseUrl = searchParams.get("baseUrl") || "";

    // Anthropic has no /models endpoint
    if (provider === "claude") {
        return NextResponse.json({
            error: "Anthropic does not provide a models listing API. Use the preset list.",
        }, { status: 501 });
    }

    const baseUrl = customBaseUrl || BASE_URLS[provider];
    if (!baseUrl) {
        return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }

    // For Ollama running locally, API key is not required
    if (!apiKey && provider !== "ollama") {
        return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const url = `${baseUrl}/models`;
        const response = await fetch(url, {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(10_000), // 10s timeout
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            return NextResponse.json(
                { error: `Provider returned ${response.status}`, detail: text },
                { status: response.status }
            );
        }

        const data = await response.json();

        // OpenAI-compatible format: { data: [{ id: "model-name", ... }, ...] }
        const models: string[] = (data.data || [])
            .map((m: { id?: string }) => m.id)
            .filter(Boolean)
            .sort();

        return NextResponse.json({ models });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
