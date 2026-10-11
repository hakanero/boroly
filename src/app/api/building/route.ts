import { readBuildingCheck, startBuildingCheck } from "@/lib/agents";

/** Starts a building-check agent run. The browser polls GET below and stores the result. */
export async function POST(req: Request) {
  const { address } = ((await req.json().catch(() => ({}))) ?? {}) as { address?: string };
  if (!address || address.trim().length < 6) {
    return Response.json({ error: "Give the building's street address." }, { status: 400 });
  }
  try {
    return Response.json(await startBuildingCheck(address.trim().slice(0, 200)));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't start the check." }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const runId = q.get("run");
  const agentId = q.get("agent");
  if (!runId || !agentId) return Response.json({ error: "Missing run or agent." }, { status: 400 });
  try {
    return Response.json(await readBuildingCheck(runId, agentId));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't read the check." }, { status: 502 });
  }
}
