"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { LLMConfig, LLMProvider } from "@/lib/types";
import {
  PROVIDER_LABELS,
  FALLBACK_MODELS,
  getDefaultModel,
  getDefaultBaseUrl,
} from "@/lib/llm";
import { ProviderIcon } from "./ProviderIcons";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  llmConfig: LLMConfig | null;
  onSave: (config: LLMConfig | null) => void;
}

const PROVIDERS: LLMProvider[] = [
  "openai",
  "claude",
  "gemini",
  "deepseek",
  "kimi",
  "qwen",
  "grok",
  "ollama"
];

// ---------- Dynamic model fetching ----------

type ModelListState = "idle" | "loading" | "done" | "error";

async function fetchModelsFromProvider(
  provider: LLMProvider,
  apiKey: string,
  baseUrl?: string
): Promise<string[]> {
  const res = await fetch("/api/models", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ provider, apiKey, baseUrl }),
  });
  if (!res.ok) return [];

  const json = await res.json();
  return json.models ?? [];
}

// ------------------------------------------------

export default function Settings({
  isOpen,
  onClose,
  llmConfig,
  onSave,
}: SettingsProps) {
  const [provider, setProvider] = useState<LLMProvider>(
    llmConfig?.provider || "openai"
  );
  const [apiKey, setApiKey] = useState(llmConfig?.apiKey || "");
  const [model, setModel] = useState(
    llmConfig?.model || getDefaultModel("openai")
  );
  const [baseUrl, setBaseUrl] = useState(
    llmConfig?.baseUrl || ""
  );
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [closing, setClosing] = useState(false);

  // Dynamic model list state
  const [modelList, setModelList] = useState<string[]>([]);
  const [modelListState, setModelListState] = useState<ModelListState>("idle");
  const fetchIdRef = useRef(0); // prevent stale fetches

  // Sync form when llmConfig prop changes
  useEffect(() => {
    if (isOpen) {
      setProvider(llmConfig?.provider || "openai");
      setApiKey(llmConfig?.apiKey || "");
      setModel(llmConfig?.model || getDefaultModel(llmConfig?.provider || "openai"));
      setBaseUrl(llmConfig?.baseUrl || "");
      setShowKey(false);
      setClosing(false);
    }
  }, [isOpen, llmConfig]);

  // Fetch models when provider/apiKey/baseUrl changes (with debounce on apiKey)
  useEffect(() => {
    // Need an API key for most providers (except ollama)
    const needsKey = provider !== "ollama";
    if (needsKey && !apiKey.trim()) {
      setModelList([]);
      setModelListState("idle");
      return;
    }

    const id = ++fetchIdRef.current;

    // Small delay so we don't fire on every keystroke while typing the key
    const timer = setTimeout(async () => {
      setModelListState("loading");
      try {
        const models = await fetchModelsFromProvider(provider, apiKey.trim(), baseUrl.trim() || undefined);
        // Only update if this is still the latest request
        if (fetchIdRef.current !== id) return;
        if (models.length > 0) {
          setModelList(models);
          setModelListState("done");
        } else {
          setModelList([]);
          setModelListState("error");
        }
      } catch {
        if (fetchIdRef.current !== id) return;
        setModelList([]);
        setModelListState("error");
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [provider, apiKey, baseUrl]);

  // The list we actually display: dynamic if available, fallback otherwise
  const displayModels =
    modelListState === "done" && modelList.length > 0
      ? modelList
      : FALLBACK_MODELS[provider] ?? [];

  // Update model default when provider changes
  const handleProviderChange = useCallback((p: LLMProvider) => {
    setProvider(p);
    setModel(getDefaultModel(p));
    setBaseUrl("");
  }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  const handleSave = useCallback(() => {
    if (!apiKey.trim() && provider !== "ollama") {
      onSave(null);
    } else {
      onSave({
        provider,
        apiKey: apiKey.trim() || 'ollama',
        model: model.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
      });
    }
    handleClose();
  }, [provider, apiKey, model, baseUrl, onSave, handleClose]);

  const handleClear = useCallback(() => {
    setApiKey("");
    setModel(getDefaultModel(provider));
    setBaseUrl("");
    onSave(null);
    handleClose();
  }, [provider, onSave, handleClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm transition-opacity duration-200 ${closing ? "opacity-0" : "opacity-100"}`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none`}
      >
        <div
          className={`pointer-events-auto w-full max-w-lg rounded-xl border border-border bg-background shadow-lg transition-all duration-200 ${closing ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="font-serif text-xl tracking-tight">
                LLM Settings
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Configure the AI model for agent collaboration
              </p>
            </div>
            <button
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l10 10M12 2L2 12"/></svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Provider Selection */}
            <div>
              <label className="small-caps mb-3 block text-muted-foreground">
                Provider
              </label>
              <div className="grid grid-cols-4 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleProviderChange(p)}
                    className={`group relative rounded-lg border px-3 py-3 text-center transition-all duration-200 ${provider === p
                      ? "border-accent bg-accent/5 shadow-sm"
                      : "border-border hover:border-border-hover"
                      }`}
                  >
                    <span
                      className={`mx-auto flex h-6 w-6 items-center justify-center transition-colors ${provider === p
                        ? "text-accent"
                        : "text-muted-foreground/60 group-hover:text-muted-foreground"
                        }`}
                    >
                      <ProviderIcon provider={p} size={20} />
                    </span>
                    <span
                      className={`mt-1.5 block text-[11px] font-semibold tracking-wide ${provider === p
                        ? "text-accent"
                        : "text-muted-foreground"
                        }`}
                    >
                      {PROVIDER_LABELS[p].split(" ")[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="small-caps mb-2 block text-muted-foreground">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    provider === "ollama"
                      ? "Not needed for local Ollama..."
                      : `Enter your ${PROVIDER_LABELS[provider]} API key...`
                  }
                  className="h-11 w-full rounded-lg border border-border bg-transparent px-4 pr-16 font-mono text-sm text-foreground transition-colors duration-200 placeholder:text-muted-foreground/40 hover:border-border-hover focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-accent"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground/60">
                Your key is stored locally and sent directly to the provider.
                Never stored on our servers.
              </p>
            </div>

            {/* Model */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="small-caps text-muted-foreground">
                  Model
                </label>
                {/* Status indicator */}
                {modelListState === "loading" && (
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                    <span className="inline-block h-2 w-2 animate-spin rounded-full border border-accent border-t-transparent" />
                    Fetching models&hellip;
                  </span>
                )}
                {modelListState === "done" && modelList.length > 0 && (
                  <span className="flex items-center gap-1.5 text-[10px] text-green-600">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                    {modelList.length} models from API
                  </span>
                )}
                {modelListState === "error" && (
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                    Using preset list
                  </span>
                )}
              </div>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={getDefaultModel(provider)}
                className="h-11 w-full rounded-lg border border-border bg-transparent px-4 text-sm text-foreground transition-colors duration-200 placeholder:text-muted-foreground/40 hover:border-border-hover focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {displayModels.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModel(m)}
                    className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${model === m
                        ? "border-accent bg-accent/10 text-accent font-medium"
                        : "border-border text-muted-foreground hover:border-border-hover hover:text-foreground"
                      }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced: Base URL */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-accent"
              >
                <span
                  className={`inline-block transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`}
                >
                  &#9656;
                </span>
                <span className="font-semibold uppercase tracking-wide">
                  Advanced
                </span>
              </button>

              {showAdvanced && (
                <div className="mt-3 animate-slide-up">
                  <label className="small-caps mb-2 block text-muted-foreground">
                    Custom Base URL
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={getDefaultBaseUrl(provider)}
                    className="h-11 w-full rounded-lg border border-border bg-transparent px-4 font-mono text-sm text-foreground transition-colors duration-200 placeholder:text-muted-foreground/40 hover:border-border-hover focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground/60">
                    Override the default API endpoint. Useful for proxies or
                    self-hosted models.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-red-500"
            >
              Clear & Use Mock
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="h-9 rounded-md border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-border-hover hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="h-9 rounded-md bg-accent px-5 text-sm font-medium tracking-wide text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-secondary hover:shadow-md active:translate-y-0"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
