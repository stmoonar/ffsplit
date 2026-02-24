import { ethers } from "ethers";
import { AgentId, ContributionTrace } from "./types";

// Deterministic seed for deriving agent wallets (demo only)
const AGENT_WALLET_SEED =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Cache derived wallets to avoid re-computation
const walletCache = new Map<string, ethers.Wallet>();

/**
 * Derive a deterministic wallet for any agent ID.
 * Uses keccak256(seed + agentId) as the private key.
 */
function getAgentWallet(agentId: AgentId): ethers.Wallet {
  const cached = walletCache.get(agentId);
  if (cached) return cached;

  // Check env var first
  const envKey = process.env[`PRIVATE_KEY_${agentId.toUpperCase()}`];
  if (envKey) {
    const wallet = new ethers.Wallet(envKey);
    walletCache.set(agentId, wallet);
    return wallet;
  }

  // Derive deterministically from seed + agentId
  const derivedKey = ethers.keccak256(
    ethers.solidityPacked(["bytes32", "string"], [AGENT_WALLET_SEED, agentId])
  );
  const wallet = new ethers.Wallet(derivedKey);
  walletCache.set(agentId, wallet);
  return wallet;
}

/**
 * Get the address for a given agent ID.
 */
export function getAgentAddress(agentId: AgentId): string {
  return getAgentWallet(agentId).address;
}

/**
 * Get addresses for a list of agent IDs.
 */
export function getAgentAddresses(agentIds: AgentId[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const id of agentIds) {
    result[id] = getAgentAddress(id);
  }
  return result;
}

// Create a signed contribution trace for an agent
export async function createTrace(
  taskId: string,
  agent: AgentId,
  action: string,
  metrics: {
    input_tokens: number;
    output_tokens: number;
    latency_ms: number;
    entities_returned: number;
    entities_adopted: number;
    constraints_met: boolean;
  }
): Promise<ContributionTrace> {
  const wallet = getAgentWallet(agent);

  // Create the message to sign (deterministic)
  const message = JSON.stringify({
    task_id: taskId,
    agent,
    action,
    entities_returned: metrics.entities_returned,
    entities_adopted: metrics.entities_adopted,
    constraints_met: metrics.constraints_met,
  });

  const signature = await wallet.signMessage(message);

  return {
    task_id: taskId,
    agent,
    agent_address: wallet.address,
    action,
    input_tokens: metrics.input_tokens,
    output_tokens: metrics.output_tokens,
    latency_ms: metrics.latency_ms,
    result_used: true,
    entities_returned: metrics.entities_returned,
    entities_adopted: metrics.entities_adopted,
    constraints_met: metrics.constraints_met,
    signature,
    timestamp: Date.now(),
  };
}

/**
 * Verify a contribution trace signature.
 */
export function verifyTrace(trace: ContributionTrace): boolean {
  const message = JSON.stringify({
    task_id: trace.task_id,
    agent: trace.agent,
    action: trace.action,
    entities_returned: trace.entities_returned,
    entities_adopted: trace.entities_adopted,
    constraints_met: trace.constraints_met,
  });

  try {
    const recovered = ethers.verifyMessage(message, trace.signature);
    return recovered.toLowerCase() === trace.agent_address.toLowerCase();
  } catch {
    return false;
  }
}
