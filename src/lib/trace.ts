import { ethers } from "ethers";
import { AgentId, ContributionTrace } from "./types";
import { AGENT_ADDRESSES } from "./shapley";

// Test private keys for demo (DO NOT use in production)
// These should ONLY be used as fallback in development mode
const AGENT_PRIVATE_KEYS: Record<AgentId, string> = {
  researcher_a:
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  researcher_b:
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  synthesizer:
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
};

/**
 * Get the private key for an agent from environment variables.
 * In development mode, falls back to hardcoded test keys.
 * In production, requires explicit environment variable configuration.
 * @throws {Error} If private key is not configured in production
 */
function getPrivateKey(agent: AgentId): string {
  const envKey = process.env[`PRIVATE_KEY_${agent.toUpperCase()}`];
  if (envKey) {
    return envKey;
  }
  if (process.env.NODE_ENV === 'development') {
    return AGENT_PRIVATE_KEYS[agent]; // fallback only in dev
  }
  throw new Error(`Private key not configured for ${agent}. Set PRIVATE_KEY_${agent.toUpperCase()} environment variable.`);
}

/**
 * Validate that all agent private keys derive the expected addresses.
 * Call at startup to fail-fast if there's a key/address mismatch.
 */
export function validateAgentKeys(): void {
  for (const agent of Object.keys(AGENT_ADDRESSES) as AgentId[]) {
    let privateKey: string;
    try {
      privateKey = getPrivateKey(agent);
    } catch {
      // Key not configured — skip validation (will fail later at signing time)
      continue;
    }
    const wallet = new ethers.Wallet(privateKey);
    const expected = AGENT_ADDRESSES[agent];
    if (wallet.address.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(
        `Agent key mismatch for ${agent}: private key derives ${wallet.address} but AGENT_ADDRESSES expects ${expected}`
      );
    }
  }
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
  const privateKey = getPrivateKey(agent);
  const wallet = new ethers.Wallet(privateKey);

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
    agent_address: AGENT_ADDRESSES[agent],
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
 * Ensures that:
 * 1. The signature is cryptographically valid for the message
 * 2. The recovered address matches the expected address for that agent role
 *
 * This prevents self-signing attacks where an agent could use an arbitrary
 * address not assigned to their role.
 *
 * @param trace The contribution trace to verify
 * @returns true if the signature is valid AND from the authorized agent address
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
    // Critical: Verify the recovered address matches the expected address for this agent role
    // This prevents self-signing with arbitrary addresses
    const expectedAddress = AGENT_ADDRESSES[trace.agent];
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}
