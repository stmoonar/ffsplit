"use client";

import { useState } from "react";
import { ModelProfile } from "@/lib/types";
import { PROVIDER_LABELS } from "@/lib/llm";

interface TaskInputProps {
  onSubmit: (query: string, payment: number) => void;
  hasModel: boolean;
  defaultProfile: ModelProfile | null;
}

const EXAMPLE_PROMPTS = [
  { label: "旅行规划", text: "帮我规划东京 3 日游，预算 5000 元以内" },
  { label: "技术对比", text: "对比 React、Vue 和 Svelte 框架的优劣势，帮我选一个适合中型项目的" },
  { label: "商业分析", text: "分析 2025 年 AI Agent 市场的发展趋势和创业机会" },
  { label: "学习计划", text: "制定一个 30 天的 Rust 编程语言学习计划，我有 Python 基础" },
];

export default function TaskInput({ onSubmit, hasModel, defaultProfile }: TaskInputProps) {
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState(10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onSubmit(query, payment);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <form onSubmit={handleSubmit}>
        {/* Task input */}
        <div className="mb-4">
          <label className="small-caps mb-3 block text-muted-foreground">
            Task Description
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="描述你想让 AI Agents 协作完成的任务..."
            className="h-32 w-full resize-none rounded-lg border border-border bg-transparent px-5 py-4 font-sans text-base text-foreground transition-colors duration-200 placeholder:text-muted-foreground/60 hover:border-border-hover focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>

        {/* Example prompts */}
        <div className="mb-8 flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => setQuery(example.text)}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
            >
              {example.label}
            </button>
          ))}
        </div>

        {/* Payment amount */}
        <div className="mb-8">
          <label className="small-caps mb-3 block text-muted-foreground">
            Payment Amount
          </label>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <input
                type="number"
                value={payment}
                onChange={(e) => setPayment(Number(e.target.value))}
                min={1}
                max={1000}
                className="h-12 w-full rounded-lg border border-border bg-transparent px-5 pr-20 font-serif text-xl text-foreground transition-colors duration-200 hover:border-border-hover focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                USDC
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Testnet USDC on Base Sepolia
          </p>
        </div>

        {/* Dynamic agent info */}
        <div className="mb-10 rounded-lg border border-border bg-card p-6">
          <p className="small-caps mb-3 text-accent">Agent Collaboration</p>
          <p className="text-sm text-muted-foreground">
            Agents are assigned dynamically based on task complexity. The AI task planner will decompose your task into
            <span className="font-semibold text-foreground"> 2-5 research subtasks</span>, each handled by a dedicated worker agent, plus a
            <span className="font-semibold text-foreground"> Synthesizer</span> that combines all findings into a final report.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Worker 1", "Worker 2", "Worker N...", "Synthesizer"].map((label) => (
              <span
                key={label}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  label === "Synthesizer"
                    ? "border-accent/30 bg-accent/5 text-accent font-medium"
                    : "border-border text-muted-foreground"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Model status + Submit */}
        <div className="mb-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              hasModel ? "bg-green-500" : "bg-amber-400"
            }`}
          />
          {defaultProfile
            ? `${PROVIDER_LABELS[defaultProfile.provider]} · ${defaultProfile.model || "default"}`
            : "Mock Mode — configure LLM in settings"}
        </div>
        <button
          type="submit"
          disabled={!query.trim()}
          className="h-12 w-full rounded-md bg-accent text-base font-medium tracking-wide text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-secondary hover:shadow-md active:translate-y-0 disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
        >
          Start Agent Collaboration & Pay {payment} USDC
        </button>
      </form>

      {/* How it works */}
      <div className="mt-16">
        <div className="mb-6 flex items-center gap-4">
          <span className="h-px flex-1 bg-border" />
          <span className="small-caps text-accent">How It Works</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-3 gap-8 text-center">
          {[
            {
              step: "01",
              title: "Collaborate",
              desc: "Multiple AI agents work together on your task",
            },
            {
              step: "02",
              title: "Measure",
              desc: "Each agent's marginal contribution is tracked with ECDSA signatures",
            },
            {
              step: "03",
              title: "Split",
              desc: "Shapley Value calculates fair revenue distribution on-chain",
            },
          ].map((item) => (
            <div key={item.step}>
              <p className="font-serif text-4xl text-accent/30">
                {item.step}
              </p>
              <p className="mt-2 font-serif text-lg">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
