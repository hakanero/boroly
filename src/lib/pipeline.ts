import { neighborhoodBrief } from "./agents";
import { generateJson } from "./gemini";
import { hoodmapsVibe } from "./hoodmaps";
import { craigslistComps, priceIt, streeteasyComps } from "./market";
import { extractPage, searchWeb, type WebSnippet } from "./nimble";
import { geocode, nearbyPlaces } from "./places";
import { ParseSchema, ReportSchema, type Comp, type Context, type StepId, type StreamEvent } from "./schemas";

export type AnalyzeInput = {
  url?: string;
  listingText?: string;
  about: string;
  budget?: number;
  commuteTo?: string;
  priorities?: string[];
};

type Emit = (e: StreamEvent) => void;

export async function analyze(input: AnalyzeInput, emit: Emit) {
  const step = (id: StepId, status: "active" | "done" | "skipped" | "error", detail?: string) =>
    emit({ type: "step", id, status, detail });

  // 1. Pull the listing off the live web (or use what the person pasted).
  let raw = (input.listingText ?? "").trim();
  if (input.url) {
    step("listing", "active", hostOf(input.url));
    try {
      const page = await extractPage(input.url, 8_000);
      raw = [page, raw].filter(Boolean).join("\n\n---\nPasted by user:\n");
      step("listing", "done", `Read ${hostOf(input.url)}`);
    } catch (err) {
      if (!raw) {
        step("listing", "error", "Couldn't open that page");
        throw new Error(
          `Couldn't read ${hostOf(input.url)} (${errMsg(err)}). Some sites like Facebook need a login — paste the listing text instead.`,
        );
      }
      step("listing", "error", "Page blocked, using your pasted text");
    }
  } else {
    step("listing", "done", "Using pasted text");
  }
  if (raw.length < 40) throw new Error("That listing is too short to analyze. Paste more of the description.");

  // 2. Structure it, and decide which nearby places this person cares about.
  step("parse", "active");
  const { listing, placeNeeds, streeteasyArea } = await generateJson(
    ParseSchema,
    "You extract NYC apartment/sublet listing details into JSON. Be precise; never invent numbers. If the neighborhood is not stated, infer it from address or cross streets and NYC knowledge.",
    `ABOUT THE PERSON: ${input.about || "(not given)"}${input.priorities?.length ? `\nPRIORITIES: ${input.priorities.join(", ")}` : ""}

LISTING (${input.url ?? "pasted text"}):
${raw}`,
  );
  emit({ type: "listing", listing, sourceUrl: input.url });
  step("parse", "done", `${listing.neighborhood || "NYC"} · ${money(listing.monthlyRent)}`);

  const hood = listing.neighborhood || listing.borough || "New York City";
  const boro = listing.borough !== "Unknown" ? listing.borough : "";
  const isSublet = listing.kind === "sublet";
  const isRoom = listing.kind === "room_share";

  // 3. Everything below runs in parallel, all through Nimble.

  // Map + nearby places + Hoodmaps + Craigslist within a mile all hang off the geocode.
  const around = (async () => {
    step("nearby", "active", "Placing it on the map");
    const area = [hood, boro, "NY"].filter(Boolean).join(", ");
    const location = await geocode(listing.address, area).catch(() => null);
    if (!location) {
      step("nearby", "error", "Couldn't place it on the map");
      step("craigslist", "skipped", "Needs a location");
      return { location: null, nearby: [], hoodmaps: null, craigslist: [] as Comp[] };
    }

    const craigslist = (async () => {
      step("craigslist", "active", "Within a mile of the listing");
      const cats: ("apa" | "sub" | "roo")[] = isRoom ? ["roo"] : isSublet ? ["sub", "apa"] : ["apa", "sub"];
      const found = (await Promise.all(cats.map((c) => craigslistComps(location, listing, c).catch(() => [])))).flat();
      step("craigslist", found.length ? "done" : "error", found.length ? `${found.length} listings within a mile` : "Nothing found nearby");
      return found;
    })();

    const [nearby, hoodmaps] = await Promise.all([
      nearbyPlaces(location, placeNeeds).catch(() => []),
      hoodmapsVibe(location).catch((err) => {
        console.warn("[boroly] hoodmaps failed:", errMsg(err));
        return null;
      }),
    ]);
    emit({ type: "context", context: { location, nearby, hoodmaps } });
    step("nearby", "done", `${nearby.length} spots nearby${hoodmaps ? " + vibes" : ""}`);
    return { location, nearby, hoodmaps, craigslist: await craigslist };
  })();

  // Crawl StreetEasy's paginated search results for the same bedroom count.
  const streeteasy = (async () => {
    if (isRoom || !streeteasyArea) {
      step("streeteasy", "skipped", isRoom ? "Not used for rooms" : "Neighborhood unknown");
      return [] as Comp[];
    }
    step("streeteasy", "active", `Crawling ${streeteasyArea} rentals`);
    const found = await streeteasyComps(streeteasyArea, listing.bedrooms).catch((err) => {
      console.warn("[boroly] streeteasy failed:", errMsg(err));
      return [] as Comp[];
    });
    step("streeteasy", found.length ? "done" : "error", found.length ? `${found.length} listings crawled` : "Couldn't crawl StreetEasy");
    return found;
  })();

  // A Nimble research agent reads Reddit and local sources itself (cached per neighborhood).
  const brief = (async () => {
    step("agent", "active", `Researching ${hood}`);
    const b = await neighborhoodBrief(hood, boro || "NYC").catch((err) => {
      console.warn("[boroly] brief agent failed:", errMsg(err));
      return null;
    });
    step("agent", b ? "done" : "error", b ? `${b.quotes.length} resident quotes, ${b.confidence} confidence` : "Agent didn't finish");
    return b;
  })();

  // Grounding for "neighborhoods that might suit you better".
  const fits = searchWeb(`best NYC neighborhood for someone who ${shortProfile(input)} reddit`, {
    includeDomains: ["reddit.com"],
    maxResults: 4,
    perResultChars: 600,
  }).catch(() => [] as WebSnippet[]);

  const [ctx, se, b, f] = await Promise.all([around, streeteasy, brief, fits]);
  const market = priceIt(listing, [...se, ...ctx.craigslist]);
  const context: Context = { location: ctx.location, nearby: ctx.nearby, hoodmaps: ctx.hoodmaps, market, brief: b };
  emit({ type: "context", context });

  // 4. Gemini only writes the personal parts; the facts above are already computed.
  step("report", "active", "Weighing it all up");
  const facts = [
    market
      ? `PRICE (computed from ${market.comparedTo}): listing ${money(listing.monthlyRent)}, median ${money(market.median)}, middle half ${money(market.p25)}-${money(market.p75)}, cheaper than ${market.cheaperThanPct}% of them, verdict ${market.verdict}.${market.subletMedian ? ` Sublets nearby median ${money(market.subletMedian)}.` : ""}`
      : "PRICE: not enough live listings nearby to compare.",
    ctx.nearby.length
      ? `NEARBY (measured): ${ctx.nearby.map((p) => `${p.label} ${p.name} ${p.walkMin}min${p.onTheWayTo ? ` (on the way to the ${p.onTheWayTo.toLowerCase()})` : ""}`).join("; ")}`
      : "",
    ctx.hoodmaps
      ? `HOODMAPS: ${ctx.hoodmaps.categories.map((x) => `${x.label} ${x.pct}%`).join(", ")}; tags ${ctx.hoodmaps.tags.map((t) => `"${t.text}"`).join(", ")}`
      : "",
    b ? `RESIDENTS (research agent): ${b.summary} Good for: ${b.goodFor.join("; ")}. Watch out: ${b.watchOuts.join("; ")}` : "",
    f.length ? `REDDIT ON NEIGHBORHOODS FOR PEOPLE LIKE THIS:\n${f.map((s) => `- ${s.text.replace(/\s+/g, " ")}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { title, kind, monthlyRent, bedrooms, neighborhood, borough, availability, furnished, petsAllowed, laundry, nearbyTrains, feesAndTerms } = listing;
  const report = await generateJson(
    ReportSchema,
    `You are Boroly, a sharp, warm, very-New-York apartment advisor helping someone decide if a NYC sublet or rental is right for THEM.
- The facts (price comparison, nearby places, resident research) are already measured. Use them; don't contradict or re-estimate them, and quote any number exactly as given.
- Personalize to the person. Be direct, specific, a little funny; no clichés. Today is ${new Date().toISOString().slice(0, 10)}.`,
    `PERSON: ${input.about || "(not given)"}
Budget: ${input.budget ? money(input.budget) + "/mo" : "not stated"} · Commute to: ${input.commuteTo || "not stated"} · Priorities: ${(input.priorities ?? []).join(", ") || "none"}

LISTING: ${JSON.stringify({ title, kind, monthlyRent, bedrooms, neighborhood, borough, availability, furnished, petsAllowed, laundry, nearbyTrains, feesAndTerms })}
Excerpt: ${raw.slice(0, 1_200)}

${facts}`,
  );

  const sources = [
    ...(b?.quotes ?? []).map((q) => ({ title: q.source, url: q.url, kind: "Agent" })),
    ...tag(f, "Reddit"),
    ...(market?.bySource ?? []).map((s) => ({
      title: `${s.n} ${s.source} listings (median ${money(s.median)})`,
      url: s.source === "StreetEasy" ? `https://streeteasy.com/for-rent/${streeteasyArea}` : "https://www.craigslist.org/search/subarea/brk",
      kind: "Prices",
    })),
    ...(ctx.hoodmaps ? [{ title: "Hoodmaps: New York City", url: "https://hoodmaps.com/new-york-city-neighborhood-map", kind: "Vibes" }] : []),
  ];
  step("report", "done");
  emit({ type: "report", report, sources });
}

function tag(items: WebSnippet[], kind: string) {
  return items.map((s) => ({ title: s.title, url: s.url, kind }));
}

function shortProfile(input: AnalyzeInput) {
  const bits = [input.about.slice(0, 120), ...(input.priorities ?? [])].filter(Boolean);
  return bits.join(", ") || "is new to the city";
}

const money = (n: number) => (n > 0 ? `$${Math.round(n).toLocaleString("en-US")}` : "price unknown");

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
