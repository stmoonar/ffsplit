import {
  AgentId,
  AgentShapleyValue,
  PermutationDetail,
  ShapleyResult,
  SubsetKey,
  ValueTable,
} from "./types";

// Value table for generic 3-agent collaboration
// V(S) represents the value a subset S of agents can produce
const VALUE_TABLE: ValueTable = {
  researcher_a: 10,
  researcher_b: 10,
  synthesizer: 15,
  "researcher_a,synthesizer": 55,
  "researcher_b,synthesizer": 50,
  "researcher_a,researcher_b": 25,
  "researcher_a,researcher_b,synthesizer": 100,
};

const ALL_AGENTS: AgentId[] = ["researcher_a", "researcher_b", "synthesizer"];

// Agent wallet addresses (test addresses)
export const AGENT_ADDRESSES: Record<AgentId, string> = {
  researcher_a: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  researcher_b: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  synthesizer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
};

function subsetKey(agents: AgentId[]): SubsetKey {
  return [...agents].sort().join(",");
}

function V(agents: AgentId[]): number {
  if (agents.length === 0) return 0;
  const key = subsetKey(agents);
  return VALUE_TABLE[key] ?? 0;
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

// Calculate Shapley Values by exhaustive enumeration
export function calculateShapley(
  taskId: string,
  paymentUsdc: number
): ShapleyResult {
  const allPerms = permutations(ALL_AGENTS);
  const marginalSums: Record<AgentId, number> = {
    researcher_a: 0,
    researcher_b: 0,
    synthesizer: 0,
  };
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
      marginals: marginals as Record<AgentId, number>,
    });
  }

  const n = allPerms.length;
  const totalValue = V(ALL_AGENTS);

  const agents: AgentShapleyValue[] = ALL_AGENTS.map((agent) => {
    const shapleyValue = marginalSums[agent] / n;
    const sharePercent = (shapleyValue / totalValue) * 100;
    return {
      agent,
      agent_address: AGENT_ADDRESSES[agent],
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
  };
}
