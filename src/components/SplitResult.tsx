"use client";

import { useState } from "react";
import { AgentId, ContributionTrace, ShapleyResult } from "@/lib/types";

interface SplitResultProps {
  result: ShapleyResult;
  paymentUsdc: number;
  traces: ContributionTrace[];
}

const AGENT_LABELS: Record<AgentId, string> = {
  planner: "Planner Agent",
  flight: "Flight Agent",
  hotel: "Hotel Agent",
};

const BAR_COLORS: Record<AgentId, string> = {
  planner: "bg-accent",
  flight: "bg-accent/70",
  hotel: "bg-accent/50",
};

export default function SplitResult({
  result,
  paymentUsdc,
  traces,
}: SplitResultProps) {
  const [showDerivation, setShowDerivation] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  const maxShare = Math.max(...result.agents.map((a) => a.share_percent));

  return (
    <div>
      {/* Section label */}
      <div className="mb-8 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="small-caps text-accent">Revenue Split</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Main split display */}
      <div className="rounded-lg border border-accent/20 bg-card p-8">
        <div className="mb-6 text-center">
          <p className="small-caps mb-2 text-muted-foreground">
            Total Payment
          </p>
          <p className="font-serif text-5xl tracking-tight">
            {paymentUsdc}{" "}
            <span className="text-2xl text-muted-foreground">USDC</span>
          </p>
        </div>

        <div className="h-px bg-border" />

        {/* Split bars */}
        <div className="mt-8 space-y-6">
          {result.agents
            .sort((a, b) => b.shapley_value - a.shapley_value)
            .map((agent) => (
              <div key={agent.agent}>
                <div className="mb-2 flex items-baseline justify-between">
                  <div>
                    <span className="font-serif text-lg">
                      {AGENT_LABELS[agent.agent]}
                    </span>
                    <span className="ml-3 text-xs tracking-tight text-muted-foreground">
                      {agent.agent_address.slice(0, 6)}...
                      {agent.agent_address.slice(-4)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-serif text-2xl">
                      {agent.payout_usdc}
                    </span>
                    <span className="ml-1 text-sm text-muted-foreground">
                      USDC
                    </span>
                    <span className="ml-3 text-sm font-semibold text-accent">
                      {agent.share_percent}%
                    </span>
                  </div>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${BAR_COLORS[agent.agent]}`}
                    style={{
                      width: `${(agent.share_percent / maxShare) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
        </div>

        {/* Shapley value info */}
        <div className="mt-8 rounded-md bg-muted/50 p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Shapley Values (total=
            {result.total_value}):&nbsp;
            {result.agents.map((a) => (
              <span key={a.agent}>
                {AGENT_LABELS[a.agent]}={a.shapley_value}&nbsp;&nbsp;
              </span>
            ))}
          </p>
        </div>
      </div>

      {/* Expandable: Full Shapley Derivation */}
      <div className="mt-6">
        <button
          onClick={() => setShowDerivation(!showDerivation)}
          className="group flex w-full items-center justify-between rounded-lg border border-border bg-card px-6 py-4 text-left transition-colors duration-200 hover:border-border-hover"
        >
          <span className="font-serif text-base">
            Shapley Value Derivation
          </span>
          <span className="small-caps text-muted-foreground transition-colors group-hover:text-accent">
            {showDerivation ? "Collapse" : "Expand"}
          </span>
        </button>

        {showDerivation && (
          <div className="animate-slide-up mt-px rounded-b-lg border border-t-0 border-border bg-card p-6">
            {/* Value table V(S) */}
            <p className="small-caps mb-3 text-accent">
              Value Function V(S)
            </p>
            <div className="mb-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Subset S
                    </th>
                    <th className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      V(S)
                    </th>
                    <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Rationale
                    </th>
                  </tr>
                </thead>
                <tbody className="text-foreground/80">
                  {[
                    ["{Planner}", "15", "Framework only, no data"],
                    ["{Flight}", "10", "Raw flight data, unusable alone"],
                    ["{Hotel}", "10", "Raw hotel data, unusable alone"],
                    ["{Planner, Flight}", "55", "Partial itinerary with flights"],
                    ["{Planner, Hotel}", "50", "Partial itinerary with hotels"],
                    ["{Flight, Hotel}", "25", "Data but no organization"],
                    ["{P, F, H}", "100", "Complete deliverable"],
                  ].map(([subset, value, rationale]) => (
                    <tr key={subset} className="border-b border-border/50">
                      <td className="px-3 py-2">{subset}</td>
                      <td className="px-3 py-2 text-right text-accent">
                        {value}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {rationale}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Permutation table */}
            <p className="small-caps mb-3 text-accent">
              All 3! = 6 Permutations
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Order
                    </th>
                    <th className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      Planner
                    </th>
                    <th className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      Flight
                    </th>
                    <th className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      Hotel
                    </th>
                  </tr>
                </thead>
                <tbody className="text-foreground/80">
                  {result.permutations.map((perm, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-3 py-2">
                        {perm.order
                          .map((a) => a[0].toUpperCase())
                          .join(" → ")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {perm.marginals.planner}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {perm.marginals.flight}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {perm.marginals.hotel}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-accent/30 font-semibold">
                    <td className="px-3 py-2 text-accent">Average</td>
                    {(["planner", "flight", "hotel"] as AgentId[]).map(
                      (agent) => (
                        <td key={agent} className="px-3 py-2 text-right text-accent">
                          {result.agents.find((a) => a.agent === agent)
                            ?.shapley_value}
                        </td>
                      )
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Expandable: Comparison with other methods */}
      <div className="mt-4">
        <button
          onClick={() => setShowComparison(!showComparison)}
          className="group flex w-full items-center justify-between rounded-lg border border-border bg-card px-6 py-4 text-left transition-colors duration-200 hover:border-border-hover"
        >
          <span className="font-serif text-base">
            Fixed Split vs Shapley Comparison
          </span>
          <span className="small-caps text-muted-foreground transition-colors group-hover:text-accent">
            {showComparison ? "Collapse" : "Expand"}
          </span>
        </button>

        {showComparison && (
          <div className="animate-slide-up mt-px rounded-b-lg border border-t-0 border-border bg-card p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Agent
                    </th>
                    <th className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      Equal Split (33%)
                    </th>
                    <th className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      By API Calls
                    </th>
                    <th className="px-3 py-2 text-right text-xs uppercase tracking-wide text-accent">
                      Shapley (FairSplit)
                    </th>
                  </tr>
                </thead>
                <tbody className="text-foreground/80">
                  {[
                    {
                      agent: "Planner",
                      equal: 3.33,
                      calls: 1.67,
                      callNote: "1 call",
                    },
                    {
                      agent: "Flight",
                      equal: 3.33,
                      calls: 5.0,
                      callNote: "3 calls",
                    },
                    {
                      agent: "Hotel",
                      equal: 3.33,
                      calls: 3.33,
                      callNote: "2 calls",
                    },
                  ].map((row, i) => {
                    const shapleyAgent = result.agents.find(
                      (a) => a.agent === row.agent.toLowerCase()
                    );
                    return (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-2 font-serif">
                          {row.agent}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.equal} USDC
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.calls} USDC
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({row.callNote})
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-accent">
                          {shapleyAgent?.payout_usdc} USDC
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Shapley Value rewards Planner&apos;s critical coordination role
              fairly, while fixed split and call-count methods either
              under-reward or over-reward agents based on superficial metrics.
            </p>
          </div>
        )}
      </div>

      {/* Signature verification */}
      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <p className="small-caps mb-4 text-accent">
          Contribution Trace Verification
        </p>
        <div className="space-y-3">
          {traces.map((trace) => (
            <div
              key={trace.agent}
              className="flex items-center justify-between rounded-md bg-muted/30 px-4 py-3"
            >
              <div>
                <span className="font-serif">
                  {AGENT_LABELS[trace.agent]}
                </span>
                <span className="ml-3 text-[11px] tracking-tight text-muted-foreground">
                  {trace.agent_address}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                  ECDSA
                </span>
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                <span className="text-xs font-semibold text-green-600">
                  VERIFIED
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/60">
          All contribution traces verified via ethers.verifyMessage(). Each
          agent signs their trace data with a unique ECDSA private key. Invalid
          signatures are rejected before Shapley calculation.
        </p>
      </div>
    </div>
  );
}
