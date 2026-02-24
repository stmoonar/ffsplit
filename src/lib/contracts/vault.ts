import { ethers } from "ethers";
import { SPLIT_VAULT_ABI } from "./SplitVaultABI";

// Contract addresses
const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS || "";
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || "";

// Oracle private key for EIP-712 signing (server-side only)
const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY || "";
const RPC_URL =
  process.env.BASE_SEPOLIA_RPC ||
  (process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:8545"
    : "https://sepolia.base.org");

function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

function getOracleWallet() {
  if (!ORACLE_PRIVATE_KEY) throw new Error("ORACLE_PRIVATE_KEY not configured");
  return new ethers.Wallet(ORACLE_PRIVATE_KEY, getProvider());
}

function getVaultContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  if (!VAULT_ADDRESS) throw new Error("VAULT_ADDRESS not configured");
  return new ethers.Contract(
    VAULT_ADDRESS,
    SPLIT_VAULT_ABI,
    signerOrProvider || getProvider()
  );
}

// Consumed task IDs — prevents replay/double-spend attacks
const consumedTaskIds = new Set<string>();

const SPLIT_TYPES = {
  Split: [
    { name: "taskId", type: "bytes32" },
    { name: "agents", type: "address[]" },
    { name: "shares", type: "uint256[]" },
  ],
};

// Server-side: Oracle signs Shapley split data with EIP-712 (does NOT submit tx)
export async function signSplitData(
  taskIdBytes32: string,
  agents: string[],
  sharesBasisPoints: number[]
): Promise<{
  taskId: string;
  agents: string[];
  shares: bigint[];
  signature: string;
}> {
  const oracleWallet = getOracleWallet();

  // Get actual chain ID from provider
  const network = await getProvider().getNetwork();
  const domain = {
    name: "SplitVault",
    version: "1",
    chainId: network.chainId,
    verifyingContract: VAULT_ADDRESS,
  };

  const shares = sharesBasisPoints.map((s) => BigInt(s));

  const value = {
    taskId: taskIdBytes32,
    agents,
    shares,
  };

  const signature = await oracleWallet.signTypedData(domain, SPLIT_TYPES, value);

  return {
    taskId: taskIdBytes32,
    agents,
    shares,
    signature,
  };
}

// Server-side: Verify a createTask transaction on-chain (anti-replay + anti-double-spend)
export async function verifyCreateTaskTx(
  txHash: string,
  expectedTaskId: string,
  expectedAmount: bigint,
  signerAddress: string
): Promise<{ valid: boolean; error?: string }> {
  // Check consumed (anti-double-spend)
  if (consumedTaskIds.has(expectedTaskId)) {
    return { valid: false, error: "Task ID already consumed" };
  }

  try {
    const provider = getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return { valid: false, error: "Transaction not found or not confirmed" };
    }

    if (receipt.status !== 1) {
      return { valid: false, error: "Transaction failed on-chain" };
    }

    // Verify the tx was sent to our vault contract
    if (receipt.to?.toLowerCase() !== VAULT_ADDRESS.toLowerCase()) {
      return { valid: false, error: "Transaction target is not the SplitVault" };
    }

    // Parse TaskCreated event from logs
    const vault = getVaultContract();
    const taskCreatedTopic = vault.interface.getEvent("TaskCreated")!.topicHash;

    const taskCreatedLog = receipt.logs.find(
      (log) => log.topics[0] === taskCreatedTopic
    );

    if (!taskCreatedLog) {
      return { valid: false, error: "No TaskCreated event found in transaction" };
    }

    const parsed = vault.interface.parseLog({
      topics: [...taskCreatedLog.topics],
      data: taskCreatedLog.data,
    });

    if (!parsed) {
      return { valid: false, error: "Failed to parse TaskCreated event" };
    }

    // Verify taskId matches
    if (parsed.args.taskId !== expectedTaskId) {
      return { valid: false, error: "Task ID mismatch" };
    }

    // Verify payer matches signer
    if (parsed.args.payer.toLowerCase() !== signerAddress.toLowerCase()) {
      return { valid: false, error: "Payer address does not match signer" };
    }

    // Verify amount
    if (parsed.args.totalAmount < expectedAmount) {
      return { valid: false, error: "Insufficient payment amount" };
    }

    // Mark as consumed
    consumedTaskIds.add(expectedTaskId);

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Verification error: ${error instanceof Error ? error.message : "Unknown"}`,
    };
  }
}

// Client-side helpers
export function getVaultAddress(): string {
  return VAULT_ADDRESS;
}

export function getUsdcAddress(): string {
  return USDC_ADDRESS;
}

export function isContractConfigured(): boolean {
  return !!(VAULT_ADDRESS && ORACLE_PRIVATE_KEY);
}

// Get chain ID for frontend use
export async function getChainId(): Promise<number> {
  const network = await getProvider().getNetwork();
  return Number(network.chainId);
}
