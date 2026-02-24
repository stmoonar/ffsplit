// LLM provider configuration
export type LLMProvider = "openai" | "deepseek" | "kimi" | "claude" | "gemini" | "qwen" | "grok" | "ollama";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

// Model profile: a saved, reusable LLM configuration
export interface ModelProfile {
  id: string;
  name: string;
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

// Agent identifiers — now dynamic strings (e.g. "worker_1", "worker_2", "synthesizer")
export type AgentId = string;

// Per-agent LLM configuration (keyed by dynamic agent ID)
export type AgentLLMConfigs = Record<string, LLMConfig>;

// Agent-to-profile assignment (agent_id → profile_id)
export type AgentModelAssignment = Record<string, string>;

// Task decomposition result — dynamic subtask count
export interface TaskDecomposition {
  subtasks: { id: string; description: string }[];
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

// On-chain settlement result (after tx submitted by frontend/relayer)
export interface SettlementResult {
  settleTxHash: string;
  explorerBaseUrl: string;
}

// EIP-712 signed settlement data from oracle (for permissionless submission)
export interface SettlementSignatureData {
  taskId: string;
  agents: string[];
  shares: string[]; // stringified bigints
  signature: string;
  vault_address: string;
  explorerBaseUrl: string;
}

// x402 payment info returned in 402 response
export interface PaymentRequirement {
  payment_required: true;
  vault_address: string;
  usdc_address: string;
  amount_usdc: number;
  amount_raw: string;
  chain_id: number;
}

// SSE event types sent to frontend
export type SSEEvent =
  | { type: "agent_start"; agent: AgentId; action: string }
  | { type: "agent_chunk"; agent: AgentId; content: string }
  | { type: "agent_done"; agent: AgentId; trace: ContributionTrace }
  | { type: "task_decomposed"; decomposition: TaskDecomposition }
  | { type: "shapley_result"; result: ShapleyResult }
  | { type: "payment_verified"; tx_hash: string }
  | { type: "settlement_start" }
  | { type: "settlement_signature"; data: SettlementSignatureData }
  | { type: "settlement_result"; result: SettlementResult }
  | { type: "task_complete"; task_id: string }
  | { type: "error"; message: string };

// Shapley value calculation result
export interface ShapleyResult {
  task_id: string;
  total_value: number;
  agents: AgentShapleyValue[];
  permutations: PermutationDetail[];
  value_table: ValueTable;
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

// History record for persisting completed tasks
export interface HistoryRecord {
  id: string;
  query: string;
  payment_usdc: number;
  timestamp: number;
  decomposition: TaskDecomposition | null;
  agentOutputs: Record<string, string>;
  traces: ContributionTrace[];
  shapleyResult: ShapleyResult;
  settlementResult: SettlementResult | null;
}
