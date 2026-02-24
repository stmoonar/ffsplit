"use client";

import { useState, useEffect } from "react";
import { HistoryRecord } from "@/lib/types";
import { loadHistory, deleteHistoryRecord, clearHistory } from "@/lib/history";

interface HistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (record: HistoryRecord) => void;
}

export default function History({ isOpen, onClose, onLoad }: HistoryProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);

  useEffect(() => {
    if (isOpen) {
      setRecords(loadHistory());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteHistoryRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleClearAll = () => {
    clearHistory();
    setRecords([]);
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hour = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${month}-${day} ${hour}:${min}`;
  };

  const truncateQuery = (query: string, maxLen = 60) => {
    return query.length > maxLen ? query.slice(0, maxLen) + "..." : query;
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="animate-slide-up relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-lg" style={{ boxShadow: "var(--shadow-lg), 0 0 0 1px rgba(0,0,0,0.03)" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
              <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            <h2 className="font-serif text-lg tracking-tight">History</h2>
            <span className="ml-1 text-xs text-muted-foreground">({records.length})</span>
          </div>
          <div className="flex items-center gap-3">
            {records.length > 0 && (
              <button
                onClick={handleClearAll}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
              >
                Clear All
              </button>
            )}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto bg-card p-3">
          {records.length === 0 ? (
            <div className="py-16 text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 text-border">
                <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="9" />
              </svg>
              <p className="text-sm text-muted-foreground">No history yet</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Run a task to see it here</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {records.map((record, index) => (
                <button
                  key={record.id}
                  onClick={() => { onLoad(record); onClose(); }}
                  className="group flex w-full items-center gap-4 rounded-lg border border-transparent px-4 py-3 text-left transition-all duration-200 hover:border-border hover:bg-muted/60"
                >
                  {/* Index number */}
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    {index + 1}
                  </span>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-accent" title={record.query}>
                      {truncateQuery(record.query)}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(record.timestamp)}</span>
                      <span className="inline-block h-0.5 w-0.5 rounded-full bg-muted-foreground/40" />
                      <span>{record.shapleyResult.agents.length} agents</span>
                      <span className="inline-block h-0.5 w-0.5 rounded-full bg-muted-foreground/40" />
                      <span className="font-mono">{record.payment_usdc} USDC</span>
                    </div>
                  </div>

                  {/* Shapley split preview */}
                  <div className="hidden flex-shrink-0 items-center gap-0.5 sm:flex">
                    {record.shapleyResult.agents.map((a) => (
                      <div
                        key={a.agent}
                        className="h-5 rounded-sm bg-accent/15 px-1.5 text-[10px] font-medium leading-5 text-accent"
                        title={`${a.agent}: ${a.share_percent.toFixed(1)}%`}
                      >
                        {a.share_percent.toFixed(0)}%
                      </div>
                    ))}
                  </div>

                  {/* Delete button */}
                  <div
                    onClick={(e) => handleDelete(record.id, e)}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
