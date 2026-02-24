"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { LLMProvider, ModelProfile } from "@/lib/types";
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
  profiles: ModelProfile[];
  defaultProfileId: string | null;
  agentAssignments: Record<string, string>;
  onSave: (
    profiles: ModelProfile[],
    defaultProfileId: string | null,
    agentAssignments: Record<string, string>
  ) => void;
}

const PROVIDERS: LLMProvider[] = [
  "openai",
  "claude",
  "gemini",
  "deepseek",
  "kimi",
  "qwen",
  "grok",
  "glm",
  "siliconflow",
  "ollama",
];

type ModelListState = "idle" | "loading" | "done" | "error";

async function fetchModelsFromProvider(
  provider: LLMProvider,
  apiKey: string,
  baseUrl?: string
): Promise<string[]> {
  const res = await fetch("/api/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey, baseUrl }),
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.models ?? [];
}

function generateProfileId(): string {
  return `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ---------- Profile Editor Component ----------

function ProfileEditor({
  profile,
  onChange,
  onRemove,
  isDefault,
  onSetDefault,
}: {
  profile: ModelProfile;
  onChange: (updated: ModelProfile) => void;
  onRemove: () => void;
  isDefault: boolean;
  onSetDefault: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [modelList, setModelList] = useState<string[]>([]);
  const [modelListState, setModelListState] = useState<ModelListState>("idle");
  const fetchIdRef = useRef(0);
  const [editingName, setEditingName] = useState(false);

  // Fetch models when provider/apiKey/baseUrl changes
  useEffect(() => {
    const needsKey = profile.provider !== "ollama";
    if (needsKey && !profile.apiKey.trim()) {
      setModelList([]);
      setModelListState("idle");
      return;
    }
    const id = ++fetchIdRef.current;
    const timer = setTimeout(async () => {
      setModelListState("loading");
      try {
        const models = await fetchModelsFromProvider(
          profile.provider,
          profile.apiKey.trim(),
          profile.baseUrl?.trim() || undefined
        );
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
  }, [profile.provider, profile.apiKey, profile.baseUrl]);

  const displayModels =
    modelListState === "done" && modelList.length > 0
      ? modelList
      : FALLBACK_MODELS[profile.provider] ?? [];

  const handleProviderChange = (p: LLMProvider) => {
    onChange({
      ...profile,
      provider: p,
      model: getDefaultModel(p),
      baseUrl: undefined,
    });
  };

  return (
    <div className={`rounded-lg border transition-all duration-200 ${isDefault ? "border-accent/40 bg-accent/[0.02]" : "border-border"}`}>
      {/* Collapsed header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${isDefault ? "text-accent" : "text-muted-foreground/60"}`}>
            <ProviderIcon provider={profile.provider} size={16} />
          </span>
          <div className="min-w-0">
            {editingName ? (
              <input
                autoFocus
                type="text"
                value={profile.name}
                onChange={(e) => onChange({ ...profile, name: e.target.value })}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => { if (e.key === "Enter") setEditingName(false); }}
                onClick={(e) => e.stopPropagation()}
                className="h-6 w-40 rounded border border-accent/40 bg-transparent px-1.5 text-sm font-medium text-foreground focus:outline-none"
              />
            ) : (
              <p className="truncate text-sm font-medium text-foreground">
                {profile.name}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditingName(true); }}
                  className="ml-1.5 text-muted-foreground/40 hover:text-accent transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" />
                  </svg>
                </button>
              </p>
            )}
            <p className="text-[10px] text-muted-foreground truncate">
              {PROVIDER_LABELS[profile.provider]} · {profile.model || "default"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDefault && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
              DEFAULT
            </span>
          )}
          <span className={`inline-block transition-transform duration-200 text-muted-foreground/40 ${expanded ? "rotate-90" : ""}`}>
            &#9656;
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border/50 px-4 py-4 space-y-4 animate-slide-up">
          {/* Provider */}
          <div>
            <label className="small-caps mb-2 block text-muted-foreground">Provider</label>
            <div className="grid grid-cols-4 gap-1.5">
              {PROVIDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleProviderChange(p)}
                  className={`group relative rounded-lg border px-2 py-2 text-center transition-all duration-200 ${profile.provider === p
                    ? "border-accent bg-accent/5 shadow-sm"
                    : "border-border hover:border-border-hover"
                    }`}
                >
                  <span className={`mx-auto flex h-5 w-5 items-center justify-center transition-colors ${profile.provider === p ? "text-accent" : "text-muted-foreground/60 group-hover:text-muted-foreground"
                    }`}>
                    <ProviderIcon provider={p} size={14} />
                  </span>
                  <span className={`mt-0.5 block text-[9px] font-semibold tracking-wide ${profile.provider === p ? "text-accent" : "text-muted-foreground"
                    }`}>
                    {PROVIDER_LABELS[p].split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="small-caps mb-2 block text-muted-foreground">API Key</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={profile.apiKey}
                onChange={(e) => onChange({ ...profile, apiKey: e.target.value })}
                placeholder={profile.provider === "ollama" ? "Not needed..." : `Enter ${PROVIDER_LABELS[profile.provider]} key...`}
                className="h-9 w-full rounded-lg border border-border bg-transparent px-3 pr-14 font-mono text-xs text-foreground transition-colors placeholder:text-muted-foreground/40 hover:border-border-hover focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-accent"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Model */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="small-caps text-muted-foreground">Model</label>
              {modelListState === "loading" && (
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                  <span className="inline-block h-2 w-2 animate-spin rounded-full border border-accent border-t-transparent" />
                  Fetching&hellip;
                </span>
              )}
              {modelListState === "done" && modelList.length > 0 && (
                <span className="flex items-center gap-1.5 text-[10px] text-green-600">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                  {modelList.length} models
                </span>
              )}
            </div>
            <input
              type="text"
              value={profile.model || ""}
              onChange={(e) => onChange({ ...profile, model: e.target.value || undefined })}
              placeholder={getDefaultModel(profile.provider)}
              className="h-9 w-full rounded-lg border border-border bg-transparent px-3 text-xs text-foreground transition-colors placeholder:text-muted-foreground/40 hover:border-border-hover focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {(() => {
                const query = (profile.model || "").trim().toLowerCase();
                const filtered = query
                  ? displayModels.filter((m) => m.toLowerCase().includes(query))
                  : displayModels;
                const shown = query ? filtered.slice(0, 12) : filtered.slice(0, 6);
                const remaining = filtered.length - shown.length;
                return (
                  <>
                    {shown.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onChange({ ...profile, model: m })}
                        className={`rounded-md border px-2 py-0.5 text-[10px] transition-colors ${profile.model === m
                          ? "border-accent bg-accent/10 text-accent font-medium"
                          : "border-border text-muted-foreground hover:border-border-hover hover:text-foreground"
                          }`}
                      >
                        {m}
                      </button>
                    ))}
                    {query && shown.length === 0 && (
                      <span className="text-[10px] text-muted-foreground/50 py-0.5">No matching models</span>
                    )}
                    {remaining > 0 && (
                      <span className="text-[10px] text-muted-foreground/40 py-0.5">+{remaining} more</span>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Advanced */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-accent"
            >
              <span className={`inline-block transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`}>&#9656;</span>
              <span className="font-semibold uppercase tracking-wide">Advanced</span>
            </button>
            {showAdvanced && (
              <div className="mt-2 animate-slide-up">
                <label className="small-caps mb-1 block text-muted-foreground">Custom Base URL</label>
                <input
                  type="text"
                  value={profile.baseUrl || ""}
                  onChange={(e) => onChange({ ...profile, baseUrl: e.target.value || undefined })}
                  placeholder={getDefaultBaseUrl(profile.provider)}
                  className="h-9 w-full rounded-lg border border-border bg-transparent px-3 font-mono text-xs text-foreground transition-colors placeholder:text-muted-foreground/40 hover:border-border-hover focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            {!isDefault ? (
              <button
                type="button"
                onClick={onSetDefault}
                className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-accent"
              >
                Set as Default
              </button>
            ) : (
              <span className="text-[11px] text-accent font-semibold uppercase tracking-wide">Default Model</span>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-red-500"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Main Settings Component ----------

export default function Settings({
  isOpen,
  onClose,
  profiles: savedProfiles,
  defaultProfileId: savedDefaultId,
  agentAssignments: savedAssignments,
  onSave,
}: SettingsProps) {
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [defaultProfileId, setDefaultProfileId] = useState<string | null>(null);
  const [agentAssignments, setAgentAssignments] = useState<Record<string, string>>({});
  const [closing, setClosing] = useState(false);
  const [activeSection, setActiveSection] = useState<"profiles" | "assignments">("profiles");

  // Sync form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setProfiles(savedProfiles.length > 0 ? [...savedProfiles] : []);
      setDefaultProfileId(savedDefaultId);
      setAgentAssignments({ ...savedAssignments });
      setClosing(false);
      setActiveSection("profiles");
    }
  }, [isOpen, savedProfiles, savedDefaultId, savedAssignments]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  const handleSave = useCallback(() => {
    // Clean up agent assignments referencing removed profiles
    const profileIds = new Set(profiles.map((p) => p.id));
    const cleanAssignments: Record<string, string> = {};
    for (const [agent, profileId] of Object.entries(agentAssignments)) {
      if (profileIds.has(profileId)) {
        cleanAssignments[agent] = profileId;
      }
    }

    // Ensure defaultProfileId is valid
    const validDefault = defaultProfileId && profileIds.has(defaultProfileId) ? defaultProfileId : (profiles[0]?.id || null);

    onSave(profiles, validDefault, cleanAssignments);
    handleClose();
  }, [profiles, defaultProfileId, agentAssignments, onSave, handleClose]);

  const handleAddProfile = useCallback(() => {
    const newProfile: ModelProfile = {
      id: generateProfileId(),
      name: `Model ${profiles.length + 1}`,
      provider: "openai",
      apiKey: "",
      model: getDefaultModel("openai"),
    };
    setProfiles((prev) => [...prev, newProfile]);
    if (profiles.length === 0) {
      setDefaultProfileId(newProfile.id);
    }
  }, [profiles.length]);

  const handleUpdateProfile = useCallback((index: number, updated: ModelProfile) => {
    setProfiles((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }, []);

  const handleRemoveProfile = useCallback((index: number) => {
    setProfiles((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      // If removed was default, set first remaining as default
      if (defaultProfileId === removed.id) {
        setDefaultProfileId(next[0]?.id || null);
      }
      return next;
    });
  }, [defaultProfileId]);

  const handleClear = useCallback(() => {
    onSave([], null, {});
    handleClose();
  }, [onSave, handleClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm transition-opacity duration-200 ${closing ? "opacity-0" : "opacity-100"}`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className={`pointer-events-auto w-full max-w-lg rounded-xl border border-border bg-background shadow-lg transition-all duration-200 ${closing ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="font-serif text-xl tracking-tight">LLM Settings</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Configure multiple models for agent collaboration
              </p>
            </div>
            <button
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l10 10M12 2L2 12" /></svg>
            </button>
          </div>

          {/* Section Tabs */}
          <div className="border-b border-border px-6">
            <div className="flex gap-1 -mb-px">
              <button
                type="button"
                onClick={() => setActiveSection("profiles")}
                className={`px-3 py-2.5 text-xs font-semibold tracking-wide transition-colors duration-200 border-b-2 ${activeSection === "profiles"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border-hover"
                  }`}
              >
                Model Profiles
                {profiles.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 py-px text-[10px] text-accent">{profiles.length}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("assignments")}
                className={`px-3 py-2.5 text-xs font-semibold tracking-wide transition-colors duration-200 border-b-2 ${activeSection === "assignments"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border-hover"
                  }`}
              >
                Agent Assignments
                {Object.keys(agentAssignments).length > 0 && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                )}
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
            {activeSection === "profiles" && (
              <div className="space-y-3">
                {profiles.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center">
                    <p className="text-sm text-muted-foreground">No model profiles configured</p>
                    <p className="mt-1 text-xs text-muted-foreground/60">Add a model profile to get started, or use Mock Mode</p>
                  </div>
                )}

                {profiles.map((profile, index) => (
                  <ProfileEditor
                    key={profile.id}
                    profile={profile}
                    onChange={(updated) => handleUpdateProfile(index, updated)}
                    onRemove={() => handleRemoveProfile(index)}
                    isDefault={profile.id === defaultProfileId}
                    onSetDefault={() => setDefaultProfileId(profile.id)}
                  />
                ))}

                <button
                  type="button"
                  onClick={handleAddProfile}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M7 2v10M2 7h10" />
                  </svg>
                  Add Model Profile
                </button>
              </div>
            )}

            {activeSection === "assignments" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Assign specific model profiles to agent roles. Unassigned agents will use the default profile.
                </p>

                {profiles.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      Add model profiles first to configure assignments
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Default profile selector */}
                    <div className="rounded-lg border border-border bg-card p-4">
                      <label className="small-caps mb-2 block text-accent">Default Profile</label>
                      <select
                        value={defaultProfileId || ""}
                        onChange={(e) => setDefaultProfileId(e.target.value || null)}
                        className="h-9 w-full rounded-lg border border-border bg-transparent px-3 text-xs text-foreground transition-colors hover:border-border-hover focus:border-accent focus:outline-none"
                      >
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({PROVIDER_LABELS[p.provider]} · {p.model || "default"})
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-[11px] text-muted-foreground/60">
                        Used for all agents without a specific assignment
                      </p>
                    </div>

                    {/* Per-agent assignments */}
                    <div className="rounded-lg border border-border bg-card p-4">
                      <label className="small-caps mb-3 block text-accent">Per-Agent Overrides</label>
                      <p className="mb-3 text-[11px] text-muted-foreground/60">
                        Agent IDs are determined dynamically when a task runs. You can pre-configure common roles:
                      </p>
                      <div className="space-y-2">
                        {["worker_1", "worker_2", "worker_3", "synthesizer"].map((agentId) => (
                          <div key={agentId} className="flex items-center gap-3">
                            <span className="w-20 text-xs font-medium text-foreground truncate">
                              {agentId.replace("_", " ")}
                            </span>
                            <select
                              value={agentAssignments[agentId] || ""}
                              onChange={(e) => {
                                setAgentAssignments((prev) => {
                                  const next = { ...prev };
                                  if (e.target.value) {
                                    next[agentId] = e.target.value;
                                  } else {
                                    delete next[agentId];
                                  }
                                  return next;
                                });
                              }}
                              className="h-8 flex-1 rounded-lg border border-border bg-transparent px-2 text-[11px] text-foreground transition-colors hover:border-border-hover focus:border-accent focus:outline-none"
                            >
                              <option value="">Use default</option>
                              {profiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.model || "default"})
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-red-500"
            >
              Clear All & Mock
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
