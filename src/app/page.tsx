"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import {
  SSEEvent,
  ContributionTrace,
  ShapleyResult,
  SettlementResult,
  SettlementSignatureData,
  PaymentRequirement,
  TaskDecomposition,
  ModelProfile,
  HistoryRecord,
} from "@/lib/types";
import { SPLIT_VAULT_ABI, ERC20_ABI } from "@/lib/contracts/SplitVaultABI";
import TaskInput from "@/components/TaskInput";
import AgentFlow from "@/components/AgentFlow";
import SplitResult from "@/components/SplitResult";
import Settings from "@/components/Settings";
import History from "@/components/History";
import { saveHistoryRecord } from "@/lib/history";
import { RiSettings3Line, RiHistoryLine, RiWallet3Line } from "@remixicon/react";

const PROFILES_STORAGE_KEY = "fairsplit_model_profiles";
const DEFAULT_PROFILE_STORAGE_KEY = "fairsplit_default_profile_id";
const AGENT_ASSIGNMENTS_STORAGE_KEY = "fairsplit_agent_assignments";
const MAX_WORKERS_STORAGE_KEY = "fairsplit_max_workers";

type AppPhase = "input" | "approving" | "locking" | "running" | "result";

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("input");
  const [agentOutputs, setAgentOutputs] = useState<Record<string, string>>({});
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  const [completedAgents, setCompletedAgents] = useState<Set<string>>(new Set());
  const [traces, setTraces] = useState<ContributionTrace[]>([]);
  const [shapleyResult, setShapleyResult] = useState<ShapleyResult | null>(null);
  const [paymentUsdc, setPaymentUsdc] = useState(10);
  const [decomposition, setDecomposition] = useState<TaskDecomposition | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const queryRef = useRef<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [settlementResult, setSettlementResult] = useState<SettlementResult | null>(null);
  const [settlementPending, setSettlementPending] = useState(false);
  const [settlementSignature, setSettlementSignature] = useState<SettlementSignatureData | null>(null);
  const [settlementOnChain, setSettlementOnChain] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);

  // Model profile state
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [defaultProfileId, setDefaultProfileId] = useState<string | null>(null);
  const [agentAssignments, setAgentAssignments] = useState<Record<string, string>>({});
  const [maxWorkers, setMaxWorkers] = useState(5);

  // Load config from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PROFILES_STORAGE_KEY);
      if (stored) setProfiles(JSON.parse(stored));
    } catch { /* ignore */ }
    try {
      const stored = localStorage.getItem(DEFAULT_PROFILE_STORAGE_KEY);
      if (stored) setDefaultProfileId(JSON.parse(stored));
    } catch { /* ignore */ }
    try {
      const stored = localStorage.getItem(AGENT_ASSIGNMENTS_STORAGE_KEY);
      if (stored) setAgentAssignments(JSON.parse(stored));
    } catch { /* ignore */ }
    try {
      const stored = localStorage.getItem(MAX_WORKERS_STORAGE_KEY);
      if (stored) setMaxWorkers(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Sync settlement status from chain so UI reflects already-settled tasks after refresh/reload.
  useEffect(() => {
    let cancelled = false;

    const checkSettlementStatus = async () => {
      if (!shapleyResult || !/^0x[a-fA-F0-9]{64}$/.test(shapleyResult.task_id)) {
        if (!cancelled) setSettlementOnChain(false);
        return;
      }
      if (settlementResult) {
        if (!cancelled) setSettlementOnChain(true);
        return;
      }
      if (typeof window === "undefined" || !window.ethereum) return;

      const vaultAddress =
        settlementSignature?.vault_address || process.env.NEXT_PUBLIC_VAULT_ADDRESS;
      if (!vaultAddress) return;

      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const vault = new ethers.Contract(vaultAddress, SPLIT_VAULT_ABI, provider);
        const task = await vault.getTask(shapleyResult.task_id);
        const isSettled = Boolean(task[4]) || Boolean(task[5]);
        if (!cancelled) setSettlementOnChain(isSettled);
      } catch (error) {
        console.warn("Failed to sync on-chain settlement status:", error);
      }
    };

    void checkSettlementStatus();
    return () => {
      cancelled = true;
    };
  }, [shapleyResult, settlementResult, settlementSignature, walletChainId]);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setErrorMessage("MetaMask not detected. Please install MetaMask to use on-chain features.");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();
      setWalletAddress(accounts[0]);
      setWalletChainId(Number(network.chainId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Wallet connection failed");
    }
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const handleAccounts = (accounts: string[]) => {
      setWalletAddress(accounts[0] || null);
    };
    const handleChain = (chainId: string) => {
      setWalletChainId(parseInt(chainId, 16));
    };
    window.ethereum.on("accountsChanged", handleAccounts);
    window.ethereum.on("chainChanged", handleChain);
    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccounts);
      window.ethereum?.removeListener("chainChanged", handleChain);
    };
  }, []);

  const handleSaveConfig = useCallback(
    (newProfiles: ModelProfile[], newDefaultId: string | null, newAssignments: Record<string, string>, newMaxWorkers: number) => {
      setProfiles(newProfiles);
      setDefaultProfileId(newDefaultId);
      setAgentAssignments(newAssignments);
      setMaxWorkers(newMaxWorkers);

      if (newProfiles.length > 0) {
        localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(newProfiles));
      } else {
        localStorage.removeItem(PROFILES_STORAGE_KEY);
      }

      if (newDefaultId) {
        localStorage.setItem(DEFAULT_PROFILE_STORAGE_KEY, JSON.stringify(newDefaultId));
      } else {
        localStorage.removeItem(DEFAULT_PROFILE_STORAGE_KEY);
      }

      if (Object.keys(newAssignments).length > 0) {
        localStorage.setItem(AGENT_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(newAssignments));
      } else {
        localStorage.removeItem(AGENT_ASSIGNMENTS_STORAGE_KEY);
      }

      localStorage.setItem(MAX_WORKERS_STORAGE_KEY, JSON.stringify(newMaxWorkers));
    },
    []
  );

  // SSE stream handler
  const runSSEStream = useCallback(
    async (
      query: string,
      payment: number,
      extraHeaders: Record<string, string>,
      extraBody: Record<string, unknown>,
      controller: AbortController
    ) => {
      const response = await fetch("/api/task", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extraHeaders },
        body: JSON.stringify({
          query,
          payment_usdc: payment,
          model_profiles: profiles,
          default_profile_id: defaultProfileId,
          agent_assignments: agentAssignments,
          max_workers: maxWorkers,
          ...extraBody,
        }),
        signal: controller.signal,
      });

      // Handle 402 Payment Required
      if (response.status === 402) {
        const paymentInfo: PaymentRequirement = await response.json();
        return { type: "payment_required" as const, paymentInfo };
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Server error (${response.status})`);
      }
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let localDecomposition: TaskDecomposition | null = null;
      const localAgentOutputs: Record<string, string> = {};
      const localTraces: ContributionTrace[] = [];
      let localShapleyResult: ShapleyResult | null = null;
      let localSettlementSignature: SettlementSignatureData | null = null;
      let localSettlementResult: SettlementResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          try {
            const event = JSON.parse(data) as SSEEvent;
            switch (event.type) {
              case "task_decomposed":
                localDecomposition = event.decomposition;
                setDecomposition(event.decomposition);
                break;
              case "agent_start":
                setActiveAgents((prev) => new Set([...prev, event.agent]));
                setAgentOutputs((prev) => ({ ...prev, [event.agent]: prev[event.agent] || "" }));
                if (!(event.agent in localAgentOutputs)) localAgentOutputs[event.agent] = "";
                break;
              case "agent_chunk":
                localAgentOutputs[event.agent] = (localAgentOutputs[event.agent] || "") + event.content;
                setAgentOutputs((prev) => ({
                  ...prev,
                  [event.agent]: (prev[event.agent] || "") + event.content,
                }));
                break;
              case "agent_done":
                localTraces.push(event.trace);
                setActiveAgents((prev) => {
                  const next = new Set(prev);
                  next.delete(event.agent);
                  return next;
                });
                setCompletedAgents((prev) => new Set([...prev, event.agent]));
                setTraces((prev) => [...prev, event.trace]);
                break;
              case "shapley_result":
                localShapleyResult = event.result;
                setShapleyResult(event.result);
                setPhase("result");
                break;
              case "settlement_start":
                setSettlementPending(true);
                break;
              case "settlement_signature":
                setSettlementPending(false);
                setSettlementSignature(event.data);
                localSettlementSignature = event.data;
                break;
              case "settlement_result":
                localSettlementResult = event.result;
                setSettlementPending(false);
                setSettlementResult(event.result);
                break;
              case "task_complete":
                setSettlementPending(false);
                if (localShapleyResult) {
                  saveHistoryRecord({
                    id: event.task_id,
                    query,
                    payment_usdc: payment,
                    timestamp: Date.now(),
                    decomposition: localDecomposition,
                    agentOutputs: { ...localAgentOutputs },
                    traces: [...localTraces],
                    shapleyResult: localShapleyResult,
                    settlementSignature: localSettlementSignature,
                    settlementResult: localSettlementResult,
                  });
                }
                break;
              case "error":
                console.error("Backend error:", event.message);
                if (event.message.startsWith("Settlement signing failed")) {
                  setSettlementPending(false);
                } else {
                  setErrorMessage(event.message);
                  setPhase("input");
                }
                break;
            }
          } catch {
            // Skip malformed events
          }
        }
      }

      return { type: "stream_complete" as const };
    },
    [profiles, defaultProfileId, agentAssignments, maxWorkers]
  );

  const handleSubmit = useCallback(
    async (query: string, payment: number) => {
      queryRef.current = query;
      setPaymentUsdc(payment);
      setPhase("running");
      setAgentOutputs({});
      setActiveAgents(new Set());
      setCompletedAgents(new Set());
      setTraces([]);
      setShapleyResult(null);
      setDecomposition(null);
      setErrorMessage(null);
      setSettlementResult(null);
      setSettlementSignature(null);
      setSettlementOnChain(false);
      setSettlementPending(false);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Step 1: Initial request (may return 402)
        const result = await runSSEStream(query, payment, {}, {}, controller);

        if (result?.type === "payment_required" && walletAddress) {
          const paymentInfo = result.paymentInfo;
          const requiredChainId = Number(paymentInfo.chain_id);

          // Step 2a: Decompose task first to get dynamic agent list
          const decomposeResp = await fetch("/api/task", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query,
              decompose_only: true,
              model_profiles: profiles,
              default_profile_id: defaultProfileId,
              agent_assignments: agentAssignments,
              max_workers: maxWorkers,
            }),
            signal: controller.signal,
          });
          if (!decomposeResp.ok) {
            const errText = await decomposeResp.text().catch(() => "");
            throw new Error(errText || "Task decomposition failed");
          }
          const decomposeData = await decomposeResp.json();
          const dynamicAgentAddresses: string[] = decomposeData.agent_addresses;

          // Step 2b: Compute taskId with high-entropy nonce (cryptographically bound)
          const nonceBytes = new Uint8Array(32);
          crypto.getRandomValues(nonceBytes);
          const nonce = ethers.hexlify(nonceBytes);
          const taskIdBytes32 = ethers.solidityPackedKeccak256(
            ["string", "address", "bytes32"],
            [query, walletAddress, nonce]
          );

          let provider = new ethers.BrowserProvider(window.ethereum!);
          let signer = await provider.getSigner();
          let signerAddress = await signer.getAddress();
          const amountRaw = BigInt(paymentInfo.amount_raw);

          // Step 2.5: Ensure wallet is on required chain
          const network = await provider.getNetwork();
          if (Number(network.chainId) !== requiredChainId) {
            const chainIdHex = ethers.toBeHex(requiredChainId);
            try {
              await window.ethereum!.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: chainIdHex }],
              });
            } catch (switchError) {
              const err = switchError as { code?: number };
              if (err.code === 4902 && requiredChainId === 31337) {
                await window.ethereum!.request({
                  method: "wallet_addEthereumChain",
                  params: [
                    {
                      chainId: chainIdHex,
                      chainName: "Hardhat Local",
                      nativeCurrency: {
                        name: "Ether",
                        symbol: "ETH",
                        decimals: 18,
                      },
                      rpcUrls: ["http://127.0.0.1:8545"],
                    },
                  ],
                });
              } else {
                throw new Error(
                  `Please switch wallet network to chainId=${requiredChainId} before payment.`
                );
              }
            }

            provider = new ethers.BrowserProvider(window.ethereum!);
            signer = await provider.getSigner();
            signerAddress = await signer.getAddress();

            const switchedNetwork = await provider.getNetwork();
            if (Number(switchedNetwork.chainId) !== requiredChainId) {
              throw new Error(
                `Wallet is on chainId=${Number(switchedNetwork.chainId)}, expected ${requiredChainId}.`
              );
            }
            setWalletChainId(Number(switchedNetwork.chainId));
          }

          // Step 2.6: Verify target contracts exist on current network
          const [usdcCode, vaultCode] = await Promise.all([
            provider.getCode(paymentInfo.usdc_address),
            provider.getCode(paymentInfo.vault_address),
          ]);

          if (usdcCode === "0x") {
            throw new Error(
              `USDC contract not found at ${paymentInfo.usdc_address} on chain ${requiredChainId}. Restart hardhat node and redeploy contracts.`
            );
          }

          if (vaultCode === "0x") {
            throw new Error(
              `Vault contract not found at ${paymentInfo.vault_address} on chain ${requiredChainId}. Restart hardhat node and redeploy contracts.`
            );
          }

          // Step 3: Check allowance, approve if needed
          const usdcContract = new ethers.Contract(paymentInfo.usdc_address, ERC20_ABI, signer);
          let allowance: bigint;
          try {
            allowance = await usdcContract.allowance(signerAddress, paymentInfo.vault_address);
          } catch {
            throw new Error(
              "Failed to read USDC allowance. Check wallet network, contract addresses, and whether local contracts were redeployed."
            );
          }

          if (allowance < amountRaw) {
            setPhase("approving");
            const approveTx = await usdcContract.approve(paymentInfo.vault_address, ethers.MaxUint256);
            await approveTx.wait();
          }

          // Step 4: Create task on-chain with dynamic agent list
          setPhase("locking");
          const vaultContract = new ethers.Contract(paymentInfo.vault_address, SPLIT_VAULT_ABI, signer);

          const createTx = await vaultContract.createTask(taskIdBytes32, dynamicAgentAddresses, amountRaw);
          const receipt = await createTx.wait();

          // Step 5: Re-request with payment proof
          setPhase("running");
          const messageToSign = `x402-payment:${receipt.hash}`;
          const paymentSig = await signer.signMessage(messageToSign);

          await runSSEStream(
            query,
            payment,
            { Authorization: `x402 tx="${receipt.hash}", sig="${paymentSig}"` },
            { task_id: taskIdBytes32, sender_address: walletAddress },
            controller
          );
        } else if (result?.type === "payment_required" && !walletAddress) {
          setErrorMessage("Please connect your wallet to pay for agent collaboration.");
          setPhase("input");
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Task failed:", error);
        setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        setPhase("input");
      }
    },
    [profiles, defaultProfileId, agentAssignments, walletAddress, runSSEStream]
  );

  // Handle permissionless settlement
  const handleSettle = useCallback(async () => {
    if (!settlementSignature || !window.ethereum) return;

    setSettlementPending(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const vault = new ethers.Contract(
        settlementSignature.vault_address,
        SPLIT_VAULT_ABI,
        signer
      );

      // Preflight: avoid submitting a second settlement for an already-settled task.
      const task = await vault.getTask(settlementSignature.taskId);
      const splitSubmitted = Boolean(task[4]);
      const settled = Boolean(task[5]);
      if (splitSubmitted || settled) {
        throw new Error("This task has already been settled on-chain. No need to submit again.");
      }

      const shares = settlementSignature.shares.map((s) => BigInt(s));
      const tx = await vault.submitSplitAndSettle(
        settlementSignature.taskId,
        shares,
        settlementSignature.signature
      );
      const receipt = await tx.wait();

      setSettlementResult({
        settleTxHash: receipt.hash,
        explorerBaseUrl: settlementSignature.explorerBaseUrl,
      });
      setSettlementOnChain(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("0x4bee0194") || errorMessage.includes("SplitAlreadySubmitted")) {
        setErrorMessage("This task has already been settled on-chain. Re-submission is rejected by contract.");
        setSettlementOnChain(true);
      } else {
        setErrorMessage(`Settlement failed: ${errorMessage}`);
      }
      console.error("Settlement failed:", error);
    } finally {
      setSettlementPending(false);
    }
  }, [settlementSignature]);

  const handleRegenerateSettlementSignature = useCallback(async () => {
    if (!shapleyResult) return;

    if (!/^0x[a-fA-F0-9]{64}$/.test(shapleyResult.task_id)) {
      setErrorMessage("This task was not created as an on-chain paid task and cannot be settled on-chain.");
      return;
    }

    setSettlementPending(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/settlement-sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: shapleyResult.task_id,
          agents: shapleyResult.agents.map((agent) => ({
            agent: agent.agent,
            share_percent: agent.share_percent,
            share_raw: agent.share_raw,
          })),
        }),
      });

      const responseText = await response.text();
      let data: unknown = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        const errorMessage =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : responseText || `Failed to regenerate signature (${response.status})`;
        throw new Error(errorMessage);
      }

      if (!data || typeof data !== "object") {
        throw new Error("Invalid settlement-sign response payload");
      }

      setSettlementSignature(data as SettlementSignatureData);
    } catch (error) {
      setErrorMessage(
        `Settlement signature regeneration failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setSettlementPending(false);
    }
  }, [shapleyResult]);

  const handleLoadHistory = useCallback((record: HistoryRecord) => {
    abortRef.current?.abort();
    abortRef.current = null;
    queryRef.current = record.query;
    setPaymentUsdc(record.payment_usdc);
    setDecomposition(record.decomposition);
    setAgentOutputs(record.agentOutputs);
    setActiveAgents(new Set());
    setCompletedAgents(new Set(Object.keys(record.agentOutputs)));
    setTraces(record.traces);
    setShapleyResult(record.shapleyResult);
    setSettlementSignature(record.settlementSignature || null);
    setSettlementResult(record.settlementResult);
    setSettlementOnChain(!!record.settlementResult);
    setSettlementPending(false);
    setErrorMessage(null);
    setPhase("result");
  }, []);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("input");
    setAgentOutputs({});
    setActiveAgents(new Set());
    setCompletedAgents(new Set());
    setTraces([]);
    setShapleyResult(null);
    setDecomposition(null);
    setErrorMessage(null);
    setSettlementResult(null);
    setSettlementSignature(null);
    setSettlementOnChain(false);
    setSettlementPending(false);
  }, []);

  const hasModelConfigured = profiles.length > 0 && profiles.some((p) => p.apiKey.trim() || p.provider === "ollama");
  const defaultProfile = profiles.find((p) => p.id === defaultProfileId);

  const isPaymentPhase = phase === "approving" || phase === "locking";

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <div>
            <h1 className="font-serif text-2xl tracking-tight">FairSplit</h1>
            <p className="small-caps mt-1 text-muted-foreground">
              AI Agent Fair Revenue Protocol
            </p>
          </div>
          <div className="flex items-center gap-4">
            {phase !== "input" && !isPaymentPhase && (
              <button
                onClick={handleReset}
                className="text-xs font-semibold tracking-wide uppercase text-muted-foreground transition-colors duration-200 hover:text-accent"
              >
                New Task
              </button>
            )}

            {/* Wallet connection */}
            {walletAddress ? (
              <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                <span className="text-xs font-mono text-accent">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
              >
                <RiWallet3Line size={14} />
                Connect
              </button>
            )}

            <button
              onClick={() => setHistoryOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
              title="History"
            >
              <RiHistoryLine size={18} />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
              title="LLM Settings"
            >
              <RiSettings3Line size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-8 py-12">
        {/* Error Banner */}
        {errorMessage && phase === "input" && (
          <div className="mb-8 animate-fade-in rounded-lg border border-red-500/30 bg-red-500/5 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">Task Failed</p>
                <p className="mt-1 text-sm text-red-400/80">{errorMessage}</p>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="flex-shrink-0 text-red-400/60 transition-colors hover:text-red-400"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Payment Phase Overlay */}
        {isPaymentPhase && (
          <div className="animate-fade-in flex flex-col items-center justify-center py-24">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="mt-6 font-serif text-xl">
              {phase === "approving" ? "Approving USDC..." : "Locking Payment..."}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {phase === "approving"
                ? "Please confirm the USDC approval in your wallet"
                : "Please confirm the createTask transaction in your wallet"}
            </p>
          </div>
        )}

        {/* Phase 1: Task Input */}
        {phase === "input" && (
          <div className="animate-fade-in">
            <div className="mb-16 text-center">
              <div className="mb-6 flex items-center justify-center gap-4">
                <span className="h-px flex-1 max-w-[120px] bg-border" />
                <span className="small-caps text-accent">
                  Shapley Value Protocol
                </span>
                <span className="h-px flex-1 max-w-[120px] bg-border" />
              </div>
              <h2 className="font-serif text-5xl leading-tight tracking-tight md:text-7xl">
                Fair Revenue
                <br />
                <span className="italic text-accent">Splitting</span>
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
                When multiple AI Agents collaborate on a task, how should the
                revenue be split? FairSplit uses Nobel Prize-winning game theory
                to calculate each agent&apos;s fair share.
              </p>
            </div>

            <TaskInput
              onSubmit={handleSubmit}
              hasModel={hasModelConfigured}
              defaultProfile={defaultProfile || null}
            />
          </div>
        )}

        {/* Phase 2: Agent Collaboration */}
        {(phase === "running" || phase === "result") && (
          <div className="animate-fade-in">
            <AgentFlow
              agentOutputs={agentOutputs}
              activeAgents={activeAgents}
              completedAgents={completedAgents}
              traces={traces}
              decomposition={decomposition}
            />
          </div>
        )}

        {/* Phase 3: Split Result */}
        {phase === "result" && shapleyResult && (
          <div className="mt-16 animate-slide-up">
            <SplitResult
              result={shapleyResult}
              paymentUsdc={paymentUsdc}
              traces={traces}
              settlement={settlementResult}
              settlementOnChain={settlementOnChain}
              settlementPending={settlementPending}
              settlementSignature={settlementSignature}
              onSettle={handleSettle}
              onRegenerateSignature={handleRegenerateSettlementSignature}
              walletConnected={!!walletAddress}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center">
        <p className="small-caps text-muted-foreground">
          Built with Shapley Value &middot; EIP-712 &middot; x402 Protocol &middot; Base Sepolia
        </p>
      </footer>

      {/* History Modal */}
      <History
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onLoad={handleLoadHistory}
      />

      {/* Settings Modal */}
      <Settings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profiles={profiles}
        defaultProfileId={defaultProfileId}
        agentAssignments={agentAssignments}
        maxWorkers={maxWorkers}
        onSave={handleSaveConfig}
      />
    </main>
  );
}
