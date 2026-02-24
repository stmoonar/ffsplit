import { HistoryRecord } from "./types";

const HISTORY_STORAGE_KEY = "fairsplit_task_history";
const MAX_HISTORY_ITEMS = 50;

export function loadHistory(): HistoryRecord[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as HistoryRecord[];
  } catch {
    return [];
  }
}

export function saveHistoryRecord(record: HistoryRecord): void {
  const history = loadHistory();
  // Prepend new record (most recent first)
  history.unshift(record);
  // Keep only the latest N items
  if (history.length > MAX_HISTORY_ITEMS) {
    history.length = MAX_HISTORY_ITEMS;
  }
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
}

export function deleteHistoryRecord(id: string): void {
  const history = loadHistory().filter((r) => r.id !== id);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
}
