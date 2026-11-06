"use client";

import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";

// ── Types ──────────────────────────────────────────────────────────────────
export interface ScanHistoryItem {
  id: string;
  type: "policy" | "factcheck" | "image";
  input: string;           // full or truncated input text / URL
  result: object;
  timestamp: number;       // Date.now()
  cached: boolean;
}

const LS_KEY = "ambient_shield_history";
const MAX_ITEMS = 20;
const TTL_MS = 24 * 60 * 60 * 1_000; // 24 hours

function purgeExpired(items: ScanHistoryItem[]): ScanHistoryItem[] {
  const cutoff = Date.now() - TTL_MS;
  return items.filter((item) => item.timestamp > cutoff);
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useSessionHistory() {
  const [rawHistory, setRawHistory] = useLocalStorage<ScanHistoryItem[]>(
    LS_KEY,
    []
  );

  // Always return a fresh-purged view — expired items are cleaned lazily
  const history = purgeExpired(rawHistory);

  const addHistory = useCallback(
    (item: ScanHistoryItem) => {
      setRawHistory((prev) => {
        const fresh = purgeExpired(prev);
        // Deduplicate by id, newest first, cap at MAX_ITEMS
        return [item, ...fresh.filter((e) => e.id !== item.id)].slice(
          0,
          MAX_ITEMS
        );
      });
    },
    [setRawHistory]
  );

  const deleteHistoryItem = useCallback(
    (id: string) => {
      setRawHistory((prev) => purgeExpired(prev).filter((e) => e.id !== id));
    },
    [setRawHistory]
  );

  const clearHistory = useCallback(() => {
    setRawHistory([]);
  }, [setRawHistory]);

  const getHistory = useCallback(() => {
    return purgeExpired(rawHistory);
  }, [rawHistory]);

  return { history, addHistory, deleteHistoryItem, clearHistory, getHistory };
}
