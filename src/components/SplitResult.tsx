"use client";

import { useState, useMemo } from "react";
import {
  ContributionTrace,
  SettlementResult,
  ShapleyResult,
} from "@/lib/types";

interface SplitResultProps {
  result: ShapleyResult;
  paymentUsdc: number;
  traces: ContributionTrace[];
  settlement?: SettlementResult | null;
  settlementPending?: boolean;
}

// Dynamic color palette for agent bars
const BAR_COLOR_PALETTE = [
  "bg-accent",
  "bg-accent/70",
  "bg-accent/50",
  "bg-accent/35",
  "bg-accent/25",
];

function getAgentLabel(agentId: string): string {
  if (agentId === "synthesizer") return "Synthesizer";
  const num = parseInt(agentId.replace("worker_", ""), 10);
  if (!isNaN(num)) return `Worker ${num}`;
  return agentId;
}

function getAgentShortLabel(agentId: string): string {
  if (agentId === "synthesizer") return "S";
  const num = parseInt(agentId.replace("worker_", ""), 10);
  if (!isNaN(num)) return `W${num}`;
  return agentId[0]?.toUpperCase() || "?";
}

function TxHashRow({ label, hash, explorerBaseUrl }: { label: string; hash: string; explorerBaseUrl: string }) {
  const short = `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/30 px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {explorerBaseUrl ? (
          <a
            href={`${explorerBaseUrl}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-accent transition-colors hover:underline"
          >
            {short}
          </a>
        ) : (
          <span className="font-mono text-xs text-accent">{short}</span>
        )}
        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
      </div>
    </div>
  );
}

export default function SplitResult({
  result,
  paymentUsdc,
  traces,
  settlement,
  settlementPending,
}: SplitResultProps) {
  const [showDerivation, setShowDerivation] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  const maxShare = Math.max(...result.agents.map((a) => a.share_percent));
  const allAgentIds = useMemo(() => result.agents.map((a) => a.agent), [result]);
  const agentCount = allAgentIds.length;

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
            .map((agent, i) => (
              <div key={agent.agent}>
                <div className="mb-2 flex items-baseline justify-between">
                  <div>
                    <span className="font-serif text-lg">
                      {getAgentLabel(agent.agent)}
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
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${BAR_COLOR_PALETTE[i % BAR_COLOR_PALETTE.length]}`}
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
                {getAgentLabel(a.agent)}={a.shapley_value}&nbsp;&nbsp;
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
                  </tr>
                </thead>
                <tbody className="text-foreground/80">
                  {Object.entries(result.value_table)
                    .sort((a, b) => a[0].split(",").length - b[0].split(",").length)
                    .map(([subset, value]) => (
                      <tr key={subset} className="border-b border-border/50">
                        <td className="px-3 py-2">
                          {"{" + subset.split(",").map(getAgentShortLabel).join(", ") + "}"}
                        </td>
                        <td className="px-3 py-2 text-right text-accent">
                          {value}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Permutation table */}
            <p className="small-caps mb-3 text-accent">
              All {agentCount}! = {result.permutations.length} Permutations
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Order
                    </th>
                    {allAgentIds.map((id) => (
                      <th key={id} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                        {getAgentShortLabel(id)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-foreground/80">
                  {result.permutations.map((perm, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-3 py-2">
                        {perm.order.map(getAgentShortLabel).join(" → ")}
                      </td>
                      {allAgentIds.map((id) => (
                        <td key={id} className="px-3 py-2 text-right">
                          {perm.marginals[id] !== undefined
                            ? Math.round(perm.marginals[id] * 100) / 100
                            : "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-accent/30 font-semibold">
                    <td className="px-3 py-2 text-accent">Average</td>
                    {allAgentIds.map((id) => (
                      <td key={id} className="px-3 py-2 text-right text-accent">
                        {result.agents.find((a) => a.agent === id)?.shapley_value}
                      </td>
                    ))}
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
                      Equal Split
                    </th>
                    <th className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      By Token Count
                    </th>
                    <th className="px-3 py-2 text-right text-xs uppercase tracking-wide text-accent">
                      Shapley (FairSplit)
                    </th>
                  </tr>
                </thead>
                <tbody className="text-foreground/80">
                  {result.agents.map((agent) => {
                    const equalShare = Math.round((paymentUsdc / agentCount) * 100) / 100;
                    const trace = traces.find((t) => t.agent === agent.agent);
                    const totalTokens = traces.reduce((s, t) => s + t.output_tokens, 0);
                    const tokenShare = trace && totalTokens > 0
                      ? Math.round((trace.output_tokens / totalTokens) * paymentUsdc * 100) / 100
                      : equalShare;
                    return (
                      <tr key={agent.agent} className="border-b border-border/50">
                        <td className="px-3 py-2 font-serif">
                          {getAgentLabel(agent.agent)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {equalShare} USDC
                        </td>
                        <td className="px-3 py-2 text-right">
                          {tokenShare} USDC
                          {trace && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              (~{trace.output_tokens} tokens)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-accent">
                          {agent.payout_usdc} USDC
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Shapley Value rewards the Synthesizer&apos;s critical coordination
              role fairly — it&apos;s the key node for task closure. Fixed split
              and token-count methods either under-reward or over-reward agents
              based on superficial metrics.
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
                  {getAgentLabel(trace.agent)}
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

      {/* On-chain settlement */}
      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <p className="small-caps mb-4 text-accent">On-Chain Settlement</p>
        {settlementPending && (
          <div className="flex items-center gap-3 py-4">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <span className="text-sm text-muted-foreground">
              Submitting split and settling on-chain&hellip;
            </span>
          </div>
        )}
        {settlement && (
          <div className="space-y-3">
            {settlement.createTxHash && (
              <TxHashRow
                label="Create Task"
                hash={settlement.createTxHash}
                explorerBaseUrl={settlement.explorerBaseUrl}
              />
            )}
            <TxHashRow
              label="Submit Split"
              hash={settlement.splitTxHash}
              explorerBaseUrl={settlement.explorerBaseUrl}
            />
            <TxHashRow
              label="Settle"
              hash={settlement.settleTxHash}
              explorerBaseUrl={settlement.explorerBaseUrl}
            />
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/60">
              Shapley split ratios submitted by Oracle and funds distributed
              via SplitVault smart contract.
              {settlement.explorerBaseUrl
                ? " View transactions on Base Sepolia explorer."
                : " Running on local Hardhat node."}
            </p>
          </div>
        )}
        {!settlementPending && !settlement && (
          <p className="text-sm text-muted-foreground/60">
            Off-chain only &mdash; no smart contract configured. Start a local
            Hardhat node and deploy to enable on-chain settlement.
          </p>
        )}
      </div>
    </div>
  );
}
