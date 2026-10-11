"use client";

import type { Analysis, BuildingCheck } from "./schemas";
import { getAnalysis, updateAnalysis } from "./store";

/**
 * Building checks take a few minutes, so they run outside the main analysis: the browser starts
 * an agent run, polls it, and writes the result into the saved place. Survives reloads.
 */
const polling = new Set<string>();
const GIVE_UP_MS = 8 * 60 * 1000;

export async function startBuildingCheck(analysisId: string, address: string) {
  const startedAt = Date.now();
  const set = (building: BuildingCheck) => updateAnalysis(analysisId, { building });
  set({ status: "running", address, startedAt });
  try {
    const res = await fetch("/api/building", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error);
    set({ status: "running", address, startedAt, runId: j.runId, agentId: j.agentId });
    poll(analysisId);
  } catch {
    set({ status: "failed", address, startedAt });
  }
}

export function resumeBuildingChecks(saved: Analysis[]) {
  for (const a of saved) if (a.building?.status === "running" && a.building.runId) poll(a.id);
}

function poll(analysisId: string) {
  if (polling.has(analysisId)) return;
  polling.add(analysisId);
  const tick = async () => {
    const b = getAnalysis(analysisId)?.building;
    if (!b || b.status !== "running" || !b.runId || !b.agentId) return polling.delete(analysisId);
    if (Date.now() - b.startedAt > GIVE_UP_MS) {
      updateAnalysis(analysisId, { building: { ...b, status: "failed" } });
      return polling.delete(analysisId);
    }
    try {
      const res = await fetch(`/api/building?run=${encodeURIComponent(b.runId)}&agent=${encodeURIComponent(b.agentId)}`);
      const j = (await res.json()) as Pick<BuildingCheck, "status" | "result">;
      if (res.ok && j.status !== "running") {
        updateAnalysis(analysisId, { building: { ...b, status: j.status, result: j.result } });
        return polling.delete(analysisId);
      }
    } catch {}
    setTimeout(tick, 10_000);
  };
  setTimeout(tick, 10_000);
}
