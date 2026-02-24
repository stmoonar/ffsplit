import { ethers } from "ethers";
import { SPLIT_VAULT_ABI } from "./SplitVaultABI";

// Contract address — set after deployment
const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS || "";

// Oracle private key for submitting splits (server-side only)
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

// Server-side: Oracle submits Shapley split and settles
export async function submitSplitAndSettle(
  taskId: string,
  agents: string[],
  sharesBasisPoints: number[],
  paymentWei: bigint
): Promise<{
  createTxHash?: string;
  splitTxHash: string;
  settleTxHash: string;
}> {
  const oracleWallet = getOracleWallet();
  const vault = getVaultContract(oracleWallet);

  const taskIdBytes32 = ethers.id(taskId);

  // Manually manage nonce to avoid "nonce too low" errors
  // when sending multiple transactions in sequence
  let nonce = await oracleWallet.getNonce();

  // Check if task already exists on-chain
  const task = await vault.getTask(taskIdBytes32);
  let createTxHash: string | undefined;

  if (task.totalAmount === 0n) {
    // Create task on-chain (oracle pays for demo simplicity)
    const createTx = await vault.createTask(taskIdBytes32, agents, {
      value: paymentWei,
      nonce: nonce++,
    });
    await createTx.wait();
    createTxHash = createTx.hash;
  }

  // Submit split ratios
  const splitTx = await vault.submitSplit(taskIdBytes32, sharesBasisPoints, {
    nonce: nonce++,
  });
  await splitTx.wait();

  // Settle — distribute funds
  const settleTx = await vault.settle(taskIdBytes32, { nonce: nonce++ });
  await settleTx.wait();

  return {
    createTxHash,
    splitTxHash: splitTx.hash,
    settleTxHash: settleTx.hash,
  };
}

// Client-side: Get vault address for display
export function getVaultAddress(): string {
  return VAULT_ADDRESS;
}

// Check if contract integration is configured
export function isContractConfigured(): boolean {
  return !!(VAULT_ADDRESS && ORACLE_PRIVATE_KEY);
}
