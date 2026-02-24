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

  const body = await request.json();
  const { task_id, agents } = body as {
    task_id?: string;
    agents?: { agent: string; share_percent: number }[];
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

    const shapleyAddressMap = new Map<string, number>();
    for (const agent of agents) {
      const address = getAgentAddress(agent.agent).toLowerCase();
      shapleyAddressMap.set(address, Math.round(agent.share_percent * 100));
    }

    const addresses = await getTaskAgentAddresses(taskIdBytes32);
    if (addresses.length === 0) {
      throw new Error("On-chain task has no agents");
    }

    const sharesBasisPoints = addresses.map(
      (address) => shapleyAddressMap.get(address.toLowerCase()) ?? 0
    );

    const bpSum = sharesBasisPoints.reduce((sum, value) => sum + value, 0);
    if (bpSum !== 10000) {
      const synthIndex = addresses.findIndex(
        (address) => address.toLowerCase() === getAgentAddress("synthesizer").toLowerCase()
      );
      const targetIndex = synthIndex >= 0 ? synthIndex : 0;
      sharesBasisPoints[targetIndex] += 10000 - bpSum;
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to regenerate settlement signature" },
      { status: 500 }
    );
  }
}
