"use client";

import { useState } from "react";

interface TaskInputProps {
  onSubmit: (query: string, payment: number) => void;
}

export default function TaskInput({ onSubmit }: TaskInputProps) {
  const [query, setQuery] = useState("帮我规划东京 3 日游，预算 5000 元以内");
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
        <div className="mb-8">
          <label className="small-caps mb-3 block text-muted-foreground">
            Task Description
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe your task for the AI agents..."
            className="h-32 w-full resize-none rounded-lg border border-border bg-transparent px-5 py-4 font-sans text-base text-foreground transition-colors duration-200 placeholder:text-muted-foreground/60 hover:border-border-hover focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
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

        {/* Agent roster */}
        <div className="mb-10 rounded-lg border border-border bg-card p-6">
          <p className="small-caps mb-4 text-accent">Participating Agents</p>
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                name: "Planner",
                role: "Coordinator",
                desc: "Generates itinerary framework",
              },
              {
                name: "Flight",
                role: "Data Provider",
                desc: "Searches flight options",
              },
              {
                name: "Hotel",
                role: "Data Provider",
                desc: "Searches hotel options",
              },
            ].map((agent) => (
              <div
                key={agent.name}
                className="rounded-md border border-border p-4 transition-colors duration-200 hover:border-border-hover"
              >
                <p className="font-serif text-lg">{agent.name}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  {agent.role}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {agent.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="h-12 w-full rounded-md bg-accent text-base font-medium tracking-wide text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-secondary hover:shadow-md active:translate-y-0"
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
