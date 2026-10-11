import { crawlPages, extractMarkdown } from "./nimble";
import type { Comp, LatLng, Listing, Market } from "./schemas";

/**
 * Prices a listing against what's actually listed nearby right now:
 * StreetEasy's search results (crawled across pages) and Craigslist within a mile.
 */

const BORO_CODES: Record<string, string> = {
  Manhattan: "mnh",
  Brooklyn: "brk",
  Queens: "que",
  Bronx: "brx",
  "Staten Island": "stn",
};

/** Nimble Crawl walks StreetEasy's paginated results for the neighborhood and bedroom count. */
export async function streeteasyComps(slug: string, bedrooms: number): Promise<Comp[]> {
  if (!slug || bedrooms < 0) return [];
  const beds = `beds:${Math.min(bedrooms, 4)}`;
  const start = `https://streeteasy.com/for-rent/${slug}/${beds}`;
  const pages = await crawlPages(start, {
    includePaths: [`^/for-rent/${slug}/${beds}$`],
    limit: 5,
    deadlineMs: 35_000,
    render: true,
  });
  return pages.flatMap((p) => parseStreetEasy(p.markdown));
}

function parseStreetEasy(md: string): Comp[] {
  const start = md.search(/^# .*for Rent/m);
  if (start < 0) return [];
  const body = md.slice(start).split(/^\s*\[?Next Page|^### /m)[0];
  return body
    .split(/\n\*\s{3}/)
    .slice(1)
    .flatMap((card): Comp[] => {
      const link = card.match(/\[([^\]\n]+)\]\((https:\/\/streeteasy\.com\/(?:building|rental)\/[^)\s]+)\)/);
      const price = card.match(/\\?\$([\d,]{3,7})/);
      const beds = card.match(/\b(Studio|\d+ beds?)\b/);
      if (!link || !price) return [];
      const area = card.match(/\bin ([A-Z][^\n]+?)\s*\n/)?.[1] ?? "";
      return [
        {
          title: link[1].trim(),
          price: Number(price[1].replace(/,/g, "")),
          beds: beds?.[1] ?? "",
          area,
          url: link[2].replace(/\?featured=1$/, ""),
          source: "StreetEasy",
          kind: "lease",
        },
      ];
    });
}

/** Craigslist's own radius search (1 mile around the listing), one page through Nimble Extract. */
export async function craigslistComps(
  at: LatLng,
  listing: Listing,
  cat: "apa" | "sub" | "roo",
): Promise<Comp[]> {
  const code = BORO_CODES[listing.borough];
  if (!code) return [];
  const params = new URLSearchParams({
    cat,
    lat: at.lat.toFixed(4),
    lon: at.lng.toFixed(4),
    search_distance: "1",
  });
  if (listing.bedrooms >= 0 && cat !== "roo") {
    params.set("min_bedrooms", String(listing.bedrooms));
    params.set("max_bedrooms", String(listing.bedrooms));
  }
  const md = await extractMarkdown(`https://www.craigslist.org/search/subarea/${code}?${params}`);
  const items = md.matchAll(
    /\[([^\]]+?)\s+\\?\$([\d,]+)\s+([^\]]*)\]\((https:\/\/www\.craigslist\.org\/view\/d\/[^)\s]+)\)/g,
  );
  return [...items].map((m) => ({
    title: m[1].replace(/\s+/g, " ").replace(/\\/g, "").trim(),
    price: Number(m[2].replace(/,/g, "")),
    beds: cat === "roo" ? "Room" : bedsLabel(listing.bedrooms, true),
    area: m[3].replace(/\s+/g, " ").trim(),
    url: m[4],
    source: "Craigslist",
    kind: cat === "sub" ? "sublet" : "lease",
  }));
}

export function priceIt(listing: Listing, comps: Comp[]): Market | null {
  const rent = listing.monthlyRent;
  const isRoom = listing.kind === "room_share";
  const [lo, hi] = isRoom ? [400, 6_000] : [900, 30_000];

  const seen = new Set<string>();
  const samePrice = new Map<number, number>();
  const clean = comps.filter((c) => {
    const key = c.url || `${c.title}|${c.price}`;
    if (seen.has(key) || c.price < lo || c.price > hi) return false;
    seen.add(key);
    // Brokers repost the same unit on Craigslist over and over; let a price count a few times at most.
    if (c.source === "Craigslist") {
      const k = samePrice.get(c.price) ?? 0;
      samePrice.set(c.price, k + 1);
      if (k >= 3) return false;
    }
    return true;
  });

  const leases = trim(clean.filter((c) => c.kind === "lease"));
  // Sublets are often posted per week or night; drop anything implausibly cheap next to leases.
  const leaseMedian = quantile(leases.map((c) => c.price), 0.5);
  const sublets = trim(clean.filter((c) => c.kind === "sublet" && (!leaseMedian || c.price > leaseMedian * 0.4)));

  // Compare like with like: a sublet against sublets when there are enough of them.
  const subletPool = listing.kind === "sublet" && sublets.length >= 6;
  const pool = subletPool ? sublets : trim([...leases, ...sublets]);
  if (pool.length < 5) return null;

  const prices = pool.map((c) => c.price).sort((a, b) => a - b);
  const median = quantile(prices, 0.5);
  const cheaperThanPct = rent > 0 ? Math.round((prices.filter((p) => p > rent).length / prices.length) * 100) : 0;
  const diff = rent > 0 ? rent / median - 1 : NaN;
  const verdict: Market["verdict"] = Number.isNaN(diff)
    ? "unknown"
    : diff <= -0.2
      ? "steal"
      : diff <= -0.05
        ? "good"
        : diff < 0.05
          ? "fair"
          : diff < 0.2
            ? "high"
            : "ripoff";

  const bySource = (["StreetEasy", "Craigslist"] as const)
    .map((source) => {
      const ps = pool.filter((c) => c.source === source).map((c) => c.price);
      return { source, n: ps.length, median: quantile(ps, 0.5) };
    })
    .filter((s) => s.n > 0);

  const what = isRoom ? "rooms" : `${bedsLabel(listing.bedrooms)} ${subletPool ? "sublets" : "rentals"}`;
  return {
    n: pool.length,
    p25: quantile(prices, 0.25),
    median,
    p75: quantile(prices, 0.75),
    cheaperThanPct,
    verdict,
    comparedTo: `${pool.length} ${what} listed nearby right now`,
    prices,
    bySource,
    subletMedian: !subletPool && sublets.length >= 3 ? quantile(sublets.map((c) => c.price), 0.5) : undefined,
    picks: pickComps(pool, rent),
  };
}

/** The closest cheaper options first (the "better deals"), plus a couple just above. */
function pickComps(pool: Comp[], rent: number) {
  if (!(rent > 0)) return pool.slice(0, 6).map((c) => ({ ...c, delta: 0 }));
  const below = pool.filter((c) => c.price < rent).sort((a, b) => b.price - a.price).slice(0, 4);
  const above = pool.filter((c) => c.price >= rent).sort((a, b) => a.price - b.price).slice(0, 6 - below.length);
  return [...below, ...above].sort((a, b) => a.price - b.price).map((c) => ({ ...c, delta: c.price - rent }));
}

/** Drop outliers (luxury penthouses, typos, per-night prices) outside a 1.5×IQR fence. */
function trim(cs: Comp[]) {
  if (cs.length < 6) return cs;
  const ps = cs.map((c) => c.price).sort((a, b) => a - b);
  const q1 = quantile(ps, 0.25);
  const q3 = quantile(ps, 0.75);
  // A floor on the fence keeps a tight cluster of identical prices from discarding normal listings.
  const fence = Math.max(1.5 * (q3 - q1), 0.35 * quantile(ps, 0.5));
  return cs.filter((c) => c.price >= q1 - fence && c.price <= q3 + fence);
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const next = s[base + 1] ?? s[base];
  return Math.round(s[base] + (pos - base) * (next - s[base]));
}

function bedsLabel(b: number, short = false) {
  if (b === 0) return short ? "Studio" : "studio";
  if (b < 0) return short ? "" : "similar";
  return short ? `${b} bed` : `${["zero", "one", "two", "three", "four"][b] ?? b}-bedroom`;
}
