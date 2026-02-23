import { ethers } from "ethers";
import { AgentId, ContributionTrace } from "./types";
import { AGENT_ADDRESSES } from "./shapley";

// Test private keys for demo (DO NOT use in production)
const AGENT_PRIVATE_KEYS: Record<AgentId, string> = {
  researcher_a:
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  researcher_b:
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  synthesizer:
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
};

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
  const wallet = new ethers.Wallet(AGENT_PRIVATE_KEYS[agent]);

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

// Verify a contribution trace signature
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
