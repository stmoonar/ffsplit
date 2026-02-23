// LLM provider configuration
export type LLMProvider = "openai" | "deepseek" | "kimi" | "claude";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

// Agent identifiers
export type AgentId = "researcher_a" | "researcher_b" | "synthesizer";

// Task decomposition result
export interface TaskDecomposition {
  subtask_a: string;
  subtask_b: string;
  synthesis_prompt: string;
}

// Contribution trace log for each agent call
export interface ContributionTrace {
  task_id: string;
  agent: AgentId;
  agent_address: string;
  action: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  result_used: boolean;
  entities_returned: number;
  entities_adopted: number;
  constraints_met: boolean;
  signature: string;
  timestamp: number;
}

// Agent output during collaboration
export interface AgentOutput {
  agent: AgentId;
  content: string;
  done: boolean;
}

// On-chain settlement result
export interface SettlementResult {
  splitTxHash: string;
  settleTxHash: string;
  createTxHash?: string;
  explorerBaseUrl: string;
}

// SSE event types sent to frontend
export type SSEEvent =
  | { type: "agent_start"; agent: AgentId; action: string }
  | { type: "agent_chunk"; agent: AgentId; content: string }
  | { type: "agent_done"; agent: AgentId; trace: ContributionTrace }
  | { type: "task_decomposed"; decomposition: TaskDecomposition }
  | { type: "shapley_result"; result: ShapleyResult }
  | { type: "settlement_start" }
  | { type: "settlement_result"; result: SettlementResult }
  | { type: "task_complete"; task_id: string }
  | { type: "error"; message: string };

// Shapley value calculation result
export interface ShapleyResult {
  task_id: string;
  total_value: number;
  agents: AgentShapleyValue[];
  permutations: PermutationDetail[];
}

export interface AgentShapleyValue {
  agent: AgentId;
  agent_address: string;
  shapley_value: number;
  share_percent: number;
  payout_usdc: number;
}

export interface PermutationDetail {
  order: AgentId[];
  marginals: Record<AgentId, number>;
}

// Value function table: V(S) for subsets
export type SubsetKey = string; // sorted agent ids joined by ","
export type ValueTable = Record<SubsetKey, number>;

// Task state
export interface TaskState {
  task_id: string;
  query: string;
  payment_usdc: number;
  status: "pending" | "running" | "completed" | "failed";
  traces: ContributionTrace[];
  shapley_result?: ShapleyResult;
  agent_outputs: Record<AgentId, string>;
}
