import { nimble } from "./nimble";
import type { HoodmapsVibe, LatLng } from "./schemas";

/**
 * Hoodmaps is crowd-drawn: people paint city blocks with a category (hipsters, rich, suits…)
 * and drop short tags that others upvote. The NYC dataset is one ~7MB JSON payload, fetched
 * through Nimble and cached in memory for a day.
 */
type HoodmapsData = {
  tags: { latitude: number; longitude: number; votes: number; tag: string }[];
  highZoomUsersPaths: [number, number, string, number][]; // [lat, lng, category, vote share]
};

const CATEGORY_LABELS: Record<string, string> = {
  hipsters: "Hipsters",
  rich: "Rich",
  suits: "Suits",
  normies: "Normies",
  tourists: "Tourists",
  uni: "Students",
  crime: "Sketchy",
};

const DAY = 24 * 60 * 60 * 1000;
const cache = globalThis as unknown as { __hoodmaps?: { at: number; data: Promise<HoodmapsData> } };

function load(): Promise<HoodmapsData> {
  if (cache.__hoodmaps && Date.now() - cache.__hoodmaps.at < DAY) return cache.__hoodmaps.data;
  const data = (async () => {
    const res = await nimble().extract.run({
      url: "https://hoodmaps.com/?action=get_data&slug=new-york-city",
      driver: "vx6",
      formats: ["html"],
      headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
    });
    const body = ((res.data as { html?: string } | undefined)?.html ?? "").trim();
    const json = JSON.parse(body.startsWith("{") ? body : Buffer.from(body, "base64").toString("utf8"));
    if (!json.success) throw new Error("Hoodmaps returned no data");
    return { tags: json.tags ?? [], highZoomUsersPaths: json.highZoomUsersPaths ?? [] } as HoodmapsData;
  })();
  cache.__hoodmaps = { at: Date.now(), data };
  data.catch(() => delete cache.__hoodmaps);
  return data;
}

export async function hoodmapsVibe(at: LatLng): Promise<HoodmapsVibe | null> {
  const data = await load();
  const near = (lat: number, lng: number, meters: number) =>
    Math.hypot((lat - at.lat) * 111_000, (lng - at.lng) * 84_000) <= meters;

  const totals = new Map<string, number>();
  for (const [lat, lng, cat, share] of data.highZoomUsersPaths) {
    if (near(lat, lng, 350)) totals.set(cat, (totals.get(cat) ?? 0) + share);
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  if (!sum) return null;

  const categories = [...totals.entries()]
    .map(([key, v]) => ({ key, label: CATEGORY_LABELS[key] ?? key, pct: Math.round((v / sum) * 100) }))
    .filter((c) => c.pct >= 3)
    .sort((a, b) => b.pct - a.pct);

  const seen = new Set<string>();
  const tags = data.tags
    .filter((t) => near(t.latitude, t.longitude, 700) && t.votes >= 2)
    .sort((a, b) => b.votes - a.votes)
    .filter((t) => {
      const k = t.tag.trim().toLowerCase();
      return seen.has(k) ? false : (seen.add(k), true);
    })
    .slice(0, 6)
    .map((t) => ({ text: t.tag.trim().replace(/^["'“”]+|["'“”]+$/g, ""), votes: t.votes }));

  return { categories, tags };
}
