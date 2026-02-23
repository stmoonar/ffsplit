import {
  AgentId,
  AgentShapleyValue,
  PermutationDetail,
  ShapleyResult,
  SubsetKey,
  ValueTable,
} from "./types";

// Hardcoded value table for "Tokyo 3-day trip" demo
// V(S) represents the value a subset S of agents can produce
const VALUE_TABLE: ValueTable = {
  planner: 15,
  flight: 10,
  hotel: 10,
  "flight,planner": 55,
  "hotel,planner": 50,
  "flight,hotel": 25,
  "flight,hotel,planner": 100,
};

const ALL_AGENTS: AgentId[] = ["planner", "flight", "hotel"];

// Agent wallet addresses (test addresses)
export const AGENT_ADDRESSES: Record<AgentId, string> = {
  planner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  flight: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  hotel: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
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
    planner: 0,
    flight: 0,
    hotel: 0,
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
