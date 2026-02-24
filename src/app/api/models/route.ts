import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy endpoint to fetch the list of available models from an LLM provider.
 * Most providers expose an OpenAI-compatible GET /models endpoint.
 * Anthropic (Claude) does NOT have such an endpoint, so the client
 * should fall back to a hardcoded list for that provider.
 *
 * POST body:
 *   provider  – one of the supported LLMProvider values
 *   apiKey    – the user's API key (sent via body, NOT via URL)
 *   baseUrl   – (optional) custom base URL override (validated against whitelist)
 *
 * Security:
 * - Uses POST instead of GET to prevent API key exposure in logs/URLs
 * - Validates baseUrl against a whitelist to prevent SSRF attacks
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

// SSRF Protection: Only allow known provider domains or localhost for ollama
function validateBaseUrl(baseUrl: string, provider: string): boolean {
    if (!baseUrl) return false;

    try {
        const url = new URL(baseUrl);
        const hostname = url.hostname.toLowerCase();

        // Allowed domains for each provider
        const allowedDomains: Record<string, string[]> = {
            openai: ["api.openai.com"],
            deepseek: ["api.deepseek.com"],
            kimi: ["api.moonshot.cn"],
            gemini: ["generativelanguage.googleapis.com"],
            qwen: ["dashscope.aliyuncs.com"],
            grok: ["api.x.ai"],
            ollama: ["localhost", "127.0.0.1", "::1"], // Localhost only for ollama
        };

        const allowedForProvider = allowedDomains[provider];
        if (!allowedForProvider) {
            return false;
        }

        return allowedForProvider.includes(hostname);
    } catch {
        // Invalid URL
        return false;
    }
}

export async function POST(req: NextRequest) {
    // Parse request body
    let body: { provider?: string; apiKey?: string; baseUrl?: string };
    try {
        body = await req.json();
    } catch (err) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const provider = body.provider || "";
    const apiKey = body.apiKey || "";
    const customBaseUrl = body.baseUrl || "";

    // Anthropic has no /models endpoint
    if (provider === "claude") {
        return NextResponse.json({
            error: "Anthropic does not provide a models listing API. Use the preset list.",
        }, { status: 501 });
    }

    // SSRF Protection: Validate custom baseUrl against whitelist
    let baseUrl = BASE_URLS[provider];
    if (customBaseUrl) {
        if (!validateBaseUrl(customBaseUrl, provider)) {
            return NextResponse.json({
                error: "Invalid baseUrl. Only known provider domains and localhost (for ollama) are allowed."
            }, { status: 400 });
        }
        baseUrl = customBaseUrl;
    }

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
