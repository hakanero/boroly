import { nimble } from "./nimble";
import type { LatLng, NearbyPlace, PlaceNeed } from "./schemas";

type MapsResult = {
  title?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  rating?: string | number;
  number_of_reviews?: number | string;
  business_category?: string[];
  place_url?: string;
};

/** Google Maps search through Nimble's pre-built `google_maps_search` template. */
async function mapsSearch(query: string, near?: LatLng, zoom = 16): Promise<MapsResult[]> {
  const res = await nimble().extract.templates.run({
    template: "google_maps_search",
    params: {
      query,
      ...(near ? { coordinates: `@${near.lat},${near.lng},${zoom}z` } : {}),
    },
  });
  const parsing = (res.data as { parsing?: { entities?: Record<string, MapsResult[]> } } | undefined)?.parsing;
  // Coordinates sometimes come back as strings.
  return Object.values(parsing?.entities ?? {})
    .flat()
    .map((r) => ({ ...r, latitude: Number(r.latitude), longitude: Number(r.longitude) }))
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && r.latitude !== 0);
}

/**
 * Places the listing on the map. The address alone can be ambiguous ("Jefferson Ave" runs through
 * two neighborhoods), so it's checked against the neighborhood and only trusted when it's specific.
 */
export async function geocode(address: string, area: string): Promise<(LatLng & { precise: boolean }) | null> {
  const first = async (q: string) => {
    if (!q.trim()) return null;
    const [hit] = await mapsSearch(q).catch(() => []);
    return hit && inNyc(hit.latitude!, hit.longitude!) ? { lat: hit.latitude!, lng: hit.longitude! } : null;
  };
  const [byAddress, byArea] = await Promise.all([first(address ? `${address}, ${area}` : ""), first(area)]);
  if (byAddress && (!byArea || walkMinutes(byAddress, byArea) <= 30)) {
    // A house number or a cross street pins it down; a bare street name doesn't.
    const specific = /^\s*\d+[a-z]?\s|&|\band\b|\bnear\b|\bat\b|\//i.test(address);
    return { ...byAddress, precise: specific };
  }
  return byArea ? { ...byArea, precise: false } : null;
}

const DEFAULT_NEEDS: PlaceNeed[] = [
  { label: "Subway", query: "subway station", why: "", role: "anchor" },
  { label: "Groceries", query: "grocery store", why: "", role: "errand" },
];

/**
 * Finds the closest good option for each of the person's needs, with walking times,
 * and notes when an errand sits on the way to somewhere they already go.
 */
export async function nearbyPlaces(home: LatLng, needs: PlaceNeed[]): Promise<NearbyPlace[]> {
  const all = dedupeNeeds([...DEFAULT_NEEDS, ...needs]).slice(0, 8);
  const found = await Promise.all(
    all.map(async (need): Promise<NearbyPlace | null> => {
      const results = await mapsSearch(need.query, home).catch(() => []);
      // Google Maps search is fuzzy ("park" can return a beer garden), so prefer category matches.
      const matching = results.filter((r) => matchesNeed(r, need.query));
      const ranked = (matching.length ? matching : results)
        .map((r) => ({ r, m: walkMinutes(home, { lat: r.latitude!, lng: r.longitude! }) }))
        .filter((x) => x.m <= 15)
        .sort((a, b) => a.m - b.m);
      if (!ranked.length) return null;
      // Nearest, unless a well-rated option is only a couple of minutes further.
      const pick =
        ranked.find((x) => ratingOf(x.r) >= 4.3 && x.m <= ranked[0].m + 3) ?? ranked[0];
      return {
        label: need.label,
        why: need.why,
        role: need.role,
        name: pick.r.title ?? need.label,
        address: pick.r.address ?? "",
        lat: pick.r.latitude!,
        lng: pick.r.longitude!,
        walkMin: pick.m,
        rating: ratingOf(pick.r) || undefined,
        url: pick.r.place_url ?? "",
        moreWithin10: ranked.filter((x) => x.m <= 10).length - 1,
        onTheWayTo: "",
      };
    }),
  );

  const places = found.filter((p): p is NearbyPlace => !!p);
  const anchors = places.filter((p) => p.role === "anchor");
  for (const p of places) {
    // Something around the corner isn't "on the way" to anything; it's just close.
    if (p.role !== "errand" || p.walkMin < 3) continue;
    // On the way = less than ~2 minutes of detour on a walk to an anchor that's further away.
    const via = anchors
      .filter((a) => a.walkMin > p.walkMin)
      .map((a) => ({ a, detour: walkMinutes(home, p) + walkMinutes(p, a) - walkMinutes(home, a) }))
      .filter((x) => x.detour <= 2)
      .sort((x, y) => x.detour - y.detour)[0];
    if (via) p.onTheWayTo = via.a.label;
  }
  return places;
}

/** Straight-line distance × 1.3 for the street grid, at ~80 m per minute. */
export function walkMinutes(a: LatLng, b: LatLng) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * R * Math.asin(Math.sqrt(h));
  return Math.max(1, Math.round((meters * 1.3) / 80));
}

/** Exact Google Maps category names for common needs; anything else falls back to keyword matching. */
const CATEGORIES: Record<string, string[]> = {
  grocery: ["grocery store", "supermarket", "organic food store", "produce market", "asian grocery store", "health food store"],
  subway: ["subway station", "transit station", "train station"],
  park: ["park", "city park", "state park", "nature preserve", "botanical garden"],
  gym: ["gym", "fitness center", "yoga studio", "pilates studio", "rock climbing gym", "boxing gym"],
  laundromat: ["laundromat", "laundry", "laundry service"],
  coffee: ["coffee shop", "cafe", "espresso bar"],
  pharmacy: ["pharmacy", "drug store"],
};

function matchesNeed(r: MapsResult, query: string) {
  const cats = (r.business_category ?? []).map((c) => c.toLowerCase());
  if (!cats.length) return false;
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && w !== "store" && w !== "near");
  const known = words.map((w) => CATEGORIES[w]).find(Boolean);
  if (known) return cats.some((c) => known.includes(c));
  return words.some((w) => cats.some((c) => c.includes(w)));
}

function ratingOf(r: MapsResult) {
  return parseFloat(String(r.rating ?? "")) || 0;
}

/** Drops repeat needs, including the AI re-adding ones we always search for (subway, groceries). */
function dedupeNeeds(needs: PlaceNeed[]) {
  const seen = new Set<string>();
  return needs.filter((n) => {
    const q = n.query.toLowerCase().trim();
    const k = /grocer|supermarket/.test(q) ? "grocery" : /subway|train station/.test(q) ? "subway" : q;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const inNyc = (lat: number, lng: number) => lat > 40.45 && lat < 40.95 && lng > -74.3 && lng < -73.65;
