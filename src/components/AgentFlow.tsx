"use client";

import { useRef, useEffect, useMemo } from "react";
import { AgentId, ContributionTrace, TaskDecomposition } from "@/lib/types";

interface AgentFlowProps {
  agentOutputs: Record<string, string>;
  activeAgents: Set<string>;
  completedAgents: Set<string>;
  traces: ContributionTrace[];
  decomposition: TaskDecomposition | null;
}

function getAgentMeta(agentId: string): { label: string; role: string; icon: string } {
  if (agentId === "synthesizer") {
    return { label: "Synthesizer", role: "Coordinator", icon: "S" };
  }
  // Extract number from "worker_1", "worker_2", etc.
  const num = parseInt(agentId.replace("worker_", ""), 10);
  if (!isNaN(num)) {
    return { label: `Worker ${num}`, role: "Researcher", icon: `${num}` };
  }
  // Fallback
  return { label: agentId, role: "Agent", icon: agentId[0]?.toUpperCase() || "?" };
}

function StatusBadge({
  active,
  completed,
}: {
  active: boolean;
  completed: boolean;
}) {
  if (completed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        Complete
      </span>
    );
  }
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 animate-pulse-gold rounded-full bg-accent" />
        Running
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/50">
      Waiting
    </span>
  );
}

function AgentPanel({
  agent,
  output,
  active,
  completed,
  trace,
  subtask,
}: {
  agent: string;
  output: string;
  active: boolean;
  completed: boolean;
  trace?: ContributionTrace;
  subtask?: string;
}) {
  const meta = getAgentMeta(agent);
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div
      className={`rounded-lg border bg-card transition-all duration-300 ${
        active
          ? "border-accent/40 shadow-md"
          : completed
            ? "border-accent/20"
            : "border-border"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-md font-serif text-sm ${
              completed
                ? "bg-accent/10 text-accent"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {meta.icon}
          </div>
          <div>
            <p className="font-serif text-base">{meta.label}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {meta.role}
            </p>
          </div>
        </div>
        <StatusBadge active={active} completed={completed} />
      </div>

      {/* Subtask description */}
      {subtask && (
        <div className="border-b border-border/50 bg-muted/20 px-5 py-2">
          <p className="text-xs text-muted-foreground">
            <span className="text-accent">TASK</span> {subtask}
          </p>
        </div>
      )}

      {/* Output area */}
      <pre
        ref={outputRef}
        className={`max-h-48 min-h-[80px] overflow-y-auto whitespace-pre-wrap px-5 py-3 font-mono text-xs leading-relaxed text-foreground/80 ${
          active ? "cursor-blink" : ""
        }`}
      >
        {output || (
          <span className="text-muted-foreground/40">
            Awaiting execution...
          </span>
        )}
      </pre>

      {/* Trace info */}
      {trace && (
        <div className="border-t border-border bg-muted/30 px-5 py-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span className="text-[11px] text-muted-foreground">
              <span className="text-accent">ENTITIES</span>{" "}
              {trace.entities_adopted}/{trace.entities_returned} adopted
            </span>
            <span className="text-[11px] text-muted-foreground">
              <span className="text-accent">LATENCY</span> {trace.latency_ms}ms
            </span>
            <span className="text-[11px] text-muted-foreground">
              <span className="text-accent">TOKENS</span>{" "}
              {trace.input_tokens}in/{trace.output_tokens}out
            </span>
            <span className="text-[11px] text-muted-foreground">
              <span className="text-accent">CONSTRAINTS</span>{" "}
              {trace.constraints_met ? "MET" : "FAILED"}
            </span>
          </div>
          <div className="mt-2 truncate text-[11px] text-muted-foreground/60">
            <span className="text-accent/60">SIG</span>{" "}
            {trace.signature.slice(0, 42)}...
          </div>
          <div className="truncate text-[11px] text-muted-foreground/60">
            <span className="text-accent/60">ADDR</span> {trace.agent_address}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentFlow({
  agentOutputs,
  activeAgents,
  completedAgents,
  traces,
  decomposition,
}: AgentFlowProps) {
  // Derive worker IDs from decomposition or agent outputs
  const workerIds = useMemo(() => {
    if (decomposition) {
      return decomposition.subtasks.map((s) => s.id);
    }
    // Fallback: derive from agentOutputs keys
    return Object.keys(agentOutputs).filter((id) => id !== "synthesizer");
  }, [decomposition, agentOutputs]);

  // Build subtask map for quick lookup
  const subtaskMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (decomposition) {
      for (const s of decomposition.subtasks) {
        map[s.id] = s.description;
      }
    }
    return map;
  }, [decomposition]);

  return (
    <div>
      {/* Section label */}
      <div className="mb-8 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="small-caps text-accent">Agent Collaboration</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Task decomposition display */}
      {decomposition && (
        <div className="mb-6 rounded-lg border border-accent/20 bg-card p-4">
          <p className="small-caps mb-2 text-accent">
            Task Decomposition ({decomposition.subtasks.length} subtasks)
          </p>
          <div className="space-y-1 text-sm text-foreground/80">
            {decomposition.subtasks.map((subtask, i) => (
              <p key={subtask.id}>
                <span className="font-semibold text-accent">{i + 1}:</span>{" "}
                {subtask.description}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Worker agent panels in grid */}
      <div className={`grid gap-6 ${workerIds.length <= 2 ? "md:grid-cols-2" : workerIds.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {workerIds.map((agentId) => (
          <AgentPanel
            key={agentId}
            agent={agentId}
            output={agentOutputs[agentId] || ""}
            active={activeAgents.has(agentId)}
            completed={completedAgents.has(agentId)}
            trace={traces.find((t) => t.agent === agentId)}
            subtask={subtaskMap[agentId]}
          />
        ))}
      </div>

      {/* Synthesizer full width below */}
      <div className="mt-6">
        <AgentPanel
          agent="synthesizer"
          output={agentOutputs["synthesizer"] || ""}
          active={activeAgents.has("synthesizer")}
          completed={completedAgents.has("synthesizer")}
          trace={traces.find((t) => t.agent === "synthesizer")}
          subtask={decomposition?.synthesis_prompt}
        />
      </div>
    </div>
  );
}
