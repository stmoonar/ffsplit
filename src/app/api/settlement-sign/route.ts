import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { getAgentAddress } from "@/lib/trace";
import {
  getTaskAgentAddresses,
  getVaultAddress,
  isContractConfigured,
  signSplitData,
} from "@/lib/contracts/vault";

export async function POST(request: NextRequest) {
  if (!isContractConfigured()) {
    return NextResponse.json(
      { error: "Smart contract not configured" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { task_id, agents } = body as {
    task_id?: string;
    agents?: { agent: string; share_percent: number; share_raw?: number }[];
  };

  if (!task_id || !Array.isArray(agents) || agents.length === 0) {
    return NextResponse.json(
      { error: "Missing task_id or agents" },
      { status: 400 }
    );
  }

  try {
    const taskIdBytes32 = /^0x[a-fA-F0-9]{64}$/.test(task_id)
      ? task_id
      : ethers.id(task_id);

    // Build address → raw share mapping (prefer share_raw, fall back to share_percent)
    const shapleyRawMap = new Map<string, number>();
    for (const agent of agents) {
      const address = getAgentAddress(agent.agent).toLowerCase();
      shapleyRawMap.set(address, agent.share_raw ?? agent.share_percent);
    }

    const addresses = await getTaskAgentAddresses(taskIdBytes32);
    if (addresses.length === 0) {
      throw new Error("On-chain task has no agents");
    }

    // Normalize first to avoid overflow/underflow and index-out-of-range in remainder loop.
    const matchedShares = addresses.map(
      (address) => shapleyRawMap.get(address.toLowerCase()) ?? 0
    );
    const totalMatchedShare = matchedShares.reduce((sum, share) => sum + share, 0);
    if (totalMatchedShare <= 0) {
      throw new Error("No matching Shapley shares for on-chain agents");
    }

    // Largest-remainder method for fair bp allocation
    const rawBasisPoints = matchedShares.map((share) => (share / totalMatchedShare) * 10000);
    const floored = rawBasisPoints.map((s) => Math.floor(s));
    let remainder = 10000 - floored.reduce((s, v) => s + v, 0);
    const remainders = rawBasisPoints.map((s, i) => ({
      index: i,
      remainder: s - floored[i],
    }));
    remainders.sort((a, b) => b.remainder - a.remainder);
    const sharesBasisPoints = [...floored];

    for (let i = 0; i < remainder; i++) {
      sharesBasisPoints[remainders[i % remainders.length].index] += 1;
    }

    const signedData = await signSplitData(taskIdBytes32, addresses, sharesBasisPoints);

    const explorerBaseUrl =
      process.env.BASE_SEPOLIA_RPC?.includes("127.0.0.1") ||
      process.env.NODE_ENV === "development"
        ? ""
        : "https://sepolia.basescan.org";

    return NextResponse.json({
      taskId: signedData.taskId,
      agents: signedData.agents,
      shares: signedData.shares.map((s) => s.toString()),
      signature: signedData.signature,
      vault_address: getVaultAddress(),
      explorerBaseUrl,
    });
  } catch (error) {
    console.error("[settlement-sign] failed:", {
      task_id,
      agents_count: agents?.length ?? 0,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to regenerate settlement signature" },
      { status: 500 }
    );
  }
}
