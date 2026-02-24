import {
  AgentId,
  AgentShapleyValue,
  ContributionTrace,
  PermutationDetail,
  ShapleyResult,
  SubsetKey,
  ValueTable,
} from "./types";
import { getAgentAddress } from "./trace";

function subsetKey(agents: AgentId[]): SubsetKey {
  return [...agents].sort().join(",");
}

// Compute a raw score for an individual agent from their trace metrics
function agentScore(trace: ContributionTrace): number {
  return (
    trace.entities_returned * 3 +
    (trace.constraints_met ? 5 : 0) +
    trace.output_tokens * 0.01
  );
}

// Build a dynamic V(S) value table from actual contribution traces (N agents)
function buildValueTable(traces: ContributionTrace[]): ValueTable {
  const traceMap = new Map<string, ContributionTrace>();
  for (const t of traces) {
    traceMap.set(t.agent, t);
  }

  const allAgents = traces.map((t) => t.agent);
  const scores = new Map<string, number>();
  for (const agent of allAgents) {
    const trace = traceMap.get(agent)!;
    scores.set(agent, agentScore(trace));
  }

  // Identify synthesizer (last agent, conventionally "synthesizer")
  const synthId = allAgents.find((a) => a === "synthesizer") || allAgents[allAgents.length - 1];
  const synthTrace = traceMap.get(synthId);
  const synthAdopted = synthTrace?.entities_adopted ?? 0;
  const isSynth = (a: string) => a === synthId;

  // Generate all subsets
  const raw: ValueTable = {};
  const subsets = getAllSubsets(allAgents);

  for (const subset of subsets) {
    if (subset.length === 0) continue;

    const sumScores = subset.reduce((s, a) => s + (scores.get(a) || 0), 0);
    const hasSynth = subset.some(isSynth);
    const workerCount = subset.filter((a) => !isSynth(a)).length;

    let value: number;
    if (subset.length === 1) {
      // Singleton: raw score
      value = sumScores;
    } else if (!hasSynth) {
      // Workers only: mild collaboration bonus (1.2x)
      value = sumScores * 1.2;
    } else {
      // With synthesizer: strong synergy (2.0x + adoption bonus scaled by worker count)
      value = sumScores * 2.0 + synthAdopted * 2 * (workerCount / Math.max(allAgents.length - 1, 1));
    }

    raw[subsetKey(subset)] = value;
  }

  // Normalize so V(all) = 100
  const fullKey = subsetKey(allAgents);
  const rawFull = raw[fullKey] || 1;
  const scale = 100 / rawFull;

  const table: ValueTable = {};
  for (const key of Object.keys(raw)) {
    table[key] = Math.round(raw[key] * scale * 100) / 100;
  }

  return table;
}

// Generate all non-empty subsets of an array
function getAllSubsets<T>(arr: T[]): T[][] {
  const result: T[][] = [];
  const n = arr.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    const subset: T[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(arr[i]);
    }
    result.push(subset);
  }
  return result;
}

// Generate all permutations of an array
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}

// Calculate Shapley Values by exhaustive enumeration (works for any N agents)
export function calculateShapley(
  taskId: string,
  paymentUsdc: number,
  traces: ContributionTrace[]
): ShapleyResult {
  const allAgents = traces.map((t) => t.agent);
  const valueTable = buildValueTable(traces);

  function V(agents: AgentId[]): number {
    if (agents.length === 0) return 0;
    const key = subsetKey(agents);
    return valueTable[key] ?? 0;
  }

  const allPerms = permutations(allAgents);
  const marginalSums: Record<string, number> = {};
  for (const agent of allAgents) {
    marginalSums[agent] = 0;
  }
  const permDetails: PermutationDetail[] = [];

  for (const perm of allPerms) {
    const marginals: Record<string, number> = {};
    const current: AgentId[] = [];

    for (const agent of perm) {
      const valueBefore = V(current);
      current.push(agent);
      const valueAfter = V(current);
      const marginal = valueAfter - valueBefore;

      marginals[agent] = marginal;
      marginalSums[agent] += marginal;
    }

    permDetails.push({
      order: perm,
      marginals,
    });
  }

  const n = allPerms.length;
  const totalValue = V(allAgents);

  const agents: AgentShapleyValue[] = allAgents.map((agent) => {
    const shapleyValue = marginalSums[agent] / n;
    const sharePercent = totalValue > 0 ? (shapleyValue / totalValue) * 100 : 0;
    return {
      agent,
      agent_address: getAgentAddress(agent),
      shapley_value: Math.round(shapleyValue * 100) / 100,
      share_percent: Math.round(sharePercent * 100) / 100,
      payout_usdc:
        Math.round(((sharePercent / 100) * paymentUsdc) * 100) / 100,
    };
  });

  return {
    task_id: taskId,
    total_value: totalValue,
    agents,
    permutations: permDetails,
    value_table: valueTable,
  };
}
