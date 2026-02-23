"use client";

import { useRef, useEffect } from "react";
import { AgentId, ContributionTrace } from "@/lib/types";

interface AgentFlowProps {
  agentOutputs: Record<AgentId, string>;
  activeAgents: Set<AgentId>;
  completedAgents: Set<AgentId>;
  traces: ContributionTrace[];
}

const AGENT_META: Record<
  AgentId,
  { label: string; role: string; icon: string }
> = {
  planner: { label: "Planner Agent", role: "Coordinator", icon: "P" },
  flight: { label: "Flight Agent", role: "Data Provider", icon: "F" },
  hotel: { label: "Hotel Agent", role: "Data Provider", icon: "H" },
};


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
}: {
  agent: AgentId;
  output: string;
  active: boolean;
  completed: boolean;
  trace?: ContributionTrace;
}) {
  const meta = AGENT_META[agent];
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

      {/* Output area */}
      <pre
        ref={outputRef}
        className={`max-h-48 min-h-[80px] overflow-y-auto px-5 py-3 font-mono text-xs leading-relaxed text-foreground/80 ${
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
}: AgentFlowProps) {
  return (
    <div>
      {/* Section label */}
      <div className="mb-8 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="small-caps text-accent">Agent Collaboration</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Agent panels */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Data agents side by side */}
        {(["flight", "hotel"] as AgentId[]).map((agent) => (
          <AgentPanel
            key={agent}
            agent={agent}
            output={agentOutputs[agent]}
            active={activeAgents.has(agent)}
            completed={completedAgents.has(agent)}
            trace={traces.find((t) => t.agent === agent)}
          />
        ))}
      </div>

      {/* Planner agent full width below */}
      <div className="mt-6">
        <AgentPanel
          agent="planner"
          output={agentOutputs.planner}
          active={activeAgents.has("planner")}
          completed={completedAgents.has("planner")}
          trace={traces.find((t) => t.agent === "planner")}
        />
      </div>
    </div>
  );
}
