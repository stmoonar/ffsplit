"use client";

import { useState, useCallback } from "react";
import { SSEEvent, ContributionTrace, ShapleyResult, AgentId } from "@/lib/types";
import TaskInput from "@/components/TaskInput";
import AgentFlow from "@/components/AgentFlow";
import SplitResult from "@/components/SplitResult";

type AppPhase = "input" | "running" | "result";

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("input");
  const [agentOutputs, setAgentOutputs] = useState<Record<AgentId, string>>({
    planner: "",
    flight: "",
    hotel: "",
  });
  const [activeAgents, setActiveAgents] = useState<Set<AgentId>>(new Set());
  const [completedAgents, setCompletedAgents] = useState<Set<AgentId>>(new Set());
  const [traces, setTraces] = useState<ContributionTrace[]>([]);
  const [shapleyResult, setShapleyResult] = useState<ShapleyResult | null>(null);
  const [paymentUsdc, setPaymentUsdc] = useState(10);

  const handleSubmit = useCallback(async (query: string, payment: number) => {
    setPaymentUsdc(payment);
    setPhase("running");
    setAgentOutputs({ planner: "", flight: "", hotel: "" });
    setActiveAgents(new Set());
    setCompletedAgents(new Set());
    setTraces([]);
    setShapleyResult(null);

    try {
      const response = await fetch("/api/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, payment_usdc: payment }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          try {
            const event: SSEEvent = JSON.parse(data);
            switch (event.type) {
              case "agent_start":
                setActiveAgents((prev) => new Set([...prev, event.agent]));
                break;
              case "agent_chunk":
                setAgentOutputs((prev) => ({
                  ...prev,
                  [event.agent]: prev[event.agent] + event.content,
                }));
                break;
              case "agent_done":
                setActiveAgents((prev) => {
                  const next = new Set(prev);
                  next.delete(event.agent);
                  return next;
                });
                setCompletedAgents((prev) => new Set([...prev, event.agent]));
                setTraces((prev) => [...prev, event.trace]);
                break;
              case "shapley_result":
                setShapleyResult(event.result);
                setPhase("result");
                break;
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (error) {
      console.error("Task failed:", error);
      setPhase("input");
    }
  }, []);

  const handleReset = useCallback(() => {
    setPhase("input");
    setAgentOutputs({ planner: "", flight: "", hotel: "" });
    setActiveAgents(new Set());
    setCompletedAgents(new Set());
    setTraces([]);
    setShapleyResult(null);
  }, []);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <div>
            <h1 className="font-serif text-2xl tracking-tight">FairSplit</h1>
            <p className="small-caps mt-1 text-muted-foreground">
              AI Agent Fair Revenue Protocol
            </p>
          </div>
          {phase !== "input" && (
            <button
              onClick={handleReset}
              className="text-xs font-semibold tracking-wide uppercase text-muted-foreground transition-colors duration-200 hover:text-accent"
            >
              New Task
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-8 py-12">
        {/* Phase 1: Task Input */}
        {phase === "input" && (
          <div className="animate-fade-in">
            {/* Hero section */}
            <div className="mb-16 text-center">
              <div className="mb-6 flex items-center justify-center gap-4">
                <span className="h-px flex-1 max-w-[120px] bg-border" />
                <span className="small-caps text-accent">
                  Shapley Value Protocol
                </span>
                <span className="h-px flex-1 max-w-[120px] bg-border" />
              </div>
              <h2 className="font-serif text-5xl leading-tight tracking-tight md:text-7xl">
                Fair Revenue
                <br />
                <span className="italic text-accent">Splitting</span>
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
                When multiple AI Agents collaborate on a task, how should the
                revenue be split? FairSplit uses Nobel Prize-winning game theory
                to calculate each agent&apos;s fair share.
              </p>
            </div>

            <TaskInput onSubmit={handleSubmit} />
          </div>
        )}

        {/* Phase 2: Agent Collaboration */}
        {(phase === "running" || phase === "result") && (
          <div className="animate-fade-in">
            <AgentFlow
              agentOutputs={agentOutputs}
              activeAgents={activeAgents}
              completedAgents={completedAgents}
              traces={traces}
            />
          </div>
        )}

        {/* Phase 3: Split Result */}
        {phase === "result" && shapleyResult && (
          <div className="mt-16 animate-slide-up">
            <SplitResult
              result={shapleyResult}
              paymentUsdc={paymentUsdc}
              traces={traces}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center">
        <p className="small-caps text-muted-foreground">
          Built with Shapley Value &middot; Base Sepolia &middot; Hackathon Demo
        </p>
      </footer>
    </main>
  );
}
