"use client";

import { useSyncExternalStore } from "react";
import type { Analysis } from "./schemas";

/** Saved checks live in this browser's localStorage. Newest first. */
// v2: price comparison and resident research moved out of the AI report.
const KEY = "boroly.saved.v2";
const listeners = new Set<() => void>();
let cache: Analysis[] | null = null;
const EMPTY: Analysis[] = [];

function read(): Analysis[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    cache = [];
  }
  return cache!;
}

function write(next: Analysis[]) {
  cache = next;
  // If storage is full, drop the oldest until it fits.
  for (let list = next; list.length; list = list.slice(0, -1)) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      cache = list;
      break;
    } catch {}
  }
  listeners.forEach((l) => l());
}

export function saveAnalysis(a: Analysis) {
  write([a, ...read().filter((x) => x.id !== a.id)]);
}

export function updateAnalysis(id: string, patch: Partial<Analysis>) {
  write(read().map((x) => (x.id === id ? { ...x, ...patch } : x)));
}

export function getAnalysis(id: string) {
  return read().find((x) => x.id === id);
}

export function removeAnalysis(id: string) {
  write(read().filter((x) => x.id !== id));
}

export function useSaved(): Analysis[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
          cache = null;
          cb();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => EMPTY,
  );
}
