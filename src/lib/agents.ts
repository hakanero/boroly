import { promises as fs } from "node:fs";
import path from "node:path";
import { nimble } from "./nimble";
import type { BuildingCheck, NeighborhoodBrief } from "./schemas";

/**
 * Nimble Web Search Agents plan their own searches, read sources and return cited JSON.
 * Two jobs here: a neighborhood brief (low effort, ~30s, cached per neighborhood) and an
 * opt-in building check (medium effort, ~3 min) that runs after the report.
 */

type Claim = { path?: string; confidence?: string; citations?: { url?: string }[] };
type AgentResult = { content: unknown; confidence: string; claims: Claim[] };

async function startAgent(input: string, schema: object, effort: "low" | "medium") {
  const run = await nimble().agents.run({ input, effort, output_schema: schema as Record<string, unknown> });
  return { runId: run.id, agentId: run.web_search_agent_id };
}

async function readAgent(runId: string, agentId: string): Promise<"running" | "failed" | AgentResult> {
  const n = nimble();
  const run = await n.agents.runs.get(runId, { agent_id: agentId });
  if (run.is_active) return "running";
  if (run.status !== "completed") return "failed";
  const res = (await n.agents.runs.result(runId, { agent_id: agentId })) as unknown as {
    output?: { content?: unknown; trust?: { confidence?: string; claims?: Claim[] } };
  };
  if (!res.output) return "failed";
  const content = typeof res.output.content === "string" ? safeJson(res.output.content) : res.output.content;
  return { content, confidence: res.output.trust?.confidence ?? "", claims: res.output.trust?.claims ?? [] };
}

/** First citation URL the agent attached to a field, e.g. "$.issues[2]". */
function citationFor(claims: Claim[], prefix: string) {
  return claims.find((c) => c.path?.startsWith(prefix) && c.citations?.[0]?.url)?.citations?.[0]?.url ?? "";
}

// ---------- Neighborhood brief ----------

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "3 sentences on day-to-day life there, for a renter" },
    quotes: {
      type: "array",
      description: "3-4 real resident quotes, verbatim, from Reddit or local forums",
      items: {
        type: "object",
        properties: {
          quote: { type: "string" },
          source: { type: "string", description: "e.g. r/Bushwick" },
          url: { type: "string" },
        },
        required: ["quote", "source", "url"],
      },
    },
    goodFor: { type: "array", items: { type: "string" }, description: "2-3 short points" },
    watchOuts: { type: "array", items: { type: "string" }, description: "2-3 short points" },
  },
  required: ["summary", "quotes", "goodFor", "watchOuts"],
};

const WEEK = 7 * 24 * 60 * 60 * 1000;
const CACHE_FILE = path.join(process.cwd(), ".cache", "neighborhood-briefs.json");
const memory = globalThis as unknown as { __briefs?: Map<string, Promise<NeighborhoodBrief | null>> };
memory.__briefs ??= new Map();

export async function neighborhoodBrief(hood: string, borough: string, deadlineMs = 60_000) {
  const key = `${hood}, ${borough}`.toLowerCase().trim();
  const inFlight = memory.__briefs!.get(key);
  if (inFlight) return inFlight;

  const job = (async () => {
    const disk = await readCache();
    if (disk[key] && Date.now() - disk[key].researchedAt < WEEK) return disk[key];

    const { runId, agentId } = await startAgent(
      `What do current residents say about living in ${hood}, ${borough}, New York City? Focus on everyday life: noise, safety feel, food, parks, transit reliability and who it suits. Prefer Reddit and local sources from the last two years, and quote real residents verbatim.`,
      BRIEF_SCHEMA,
      "low",
    );
    const stopAt = Date.now() + deadlineMs;
    while (Date.now() < stopAt) {
      await new Promise((r) => setTimeout(r, 3_000));
      const r = await readAgent(runId, agentId);
      if (r === "running") continue;
      if (r === "failed") return null;
      const c = r.content as Omit<NeighborhoodBrief, "confidence" | "researchedAt">;
      const brief: NeighborhoodBrief = {
        summary: c.summary ?? "",
        quotes: dedupeQuotes(c.quotes ?? []).slice(0, 4),
        goodFor: (c.goodFor ?? []).slice(0, 3),
        watchOuts: (c.watchOuts ?? []).slice(0, 3),
        confidence: r.confidence,
        researchedAt: Date.now(),
      };
      await writeCache({ ...(await readCache()), [key]: brief });
      return brief;
    }
    return null;
  })().finally(() => memory.__briefs!.delete(key));

  memory.__briefs!.set(key, job);
  return job;
}

async function readCache(): Promise<Record<string, NeighborhoodBrief>> {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeCache(data: Record<string, NeighborhoodBrief>) {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(data));
  } catch (err) {
    console.warn("[boroly] couldn't write brief cache:", err);
  }
}

// ---------- Building check ----------

const BUILDING_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "2-3 factual sentences for a prospective tenant" },
    landlord: { type: "string", description: "Owner or management company, '' if unknown" },
    issues: {
      type: "array",
      description: "Concrete problems on record: HPD violations, 311 complaints, bedbugs, litigation, bad reviews",
      items: {
        type: "object",
        properties: {
          issue: { type: "string", description: "Short title" },
          detail: { type: "string", description: "1-2 sentences with numbers and dates" },
        },
        required: ["issue", "detail"],
      },
    },
    positives: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "landlord", "issues", "positives"],
};

export async function startBuildingCheck(address: string) {
  return startAgent(
    `Research the residential building at ${address}, New York City, for someone about to rent there: HPD violations and their classes, 311 complaints, bedbug filings, housing court cases, tenant reviews (Openigloo, Google, Reddit) and the owner or management company. Be factual, give numbers and dates, and only report what you find.`,
    BUILDING_SCHEMA,
    "medium",
  );
}

export async function readBuildingCheck(runId: string, agentId: string): Promise<Pick<BuildingCheck, "status" | "result">> {
  const r = await readAgent(runId, agentId);
  if (r === "running" || r === "failed") return { status: r };
  const c = r.content as {
    summary?: string;
    landlord?: string;
    issues?: { issue: string; detail: string }[];
    positives?: string[];
  };
  return {
    status: "done",
    result: {
      summary: c.summary ?? "",
      landlord: c.landlord ?? "",
      issues: (c.issues ?? []).map((it, i) => ({ ...it, url: citationFor(r.claims, `$.issues[${i}]`) })),
      positives: c.positives ?? [],
      confidence: r.confidence,
    },
  };
}

/** Keeps quotes with a real link, dropping near-repeats (agents sometimes cite one source twice). */
function dedupeQuotes(quotes: NeighborhoodBrief["quotes"]) {
  const seen = new Set<string>();
  return quotes.filter((q) => {
    const key = q.quote.toLowerCase().replace(/[^a-z ]/g, "").slice(0, 40);
    if (!/^https?:\/\//.test(q.url ?? "") || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
