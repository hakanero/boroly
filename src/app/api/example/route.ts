import { extractMarkdown } from "@/lib/nimble";

/**
 * "Try an example": a real, live Craigslist listing picked at random, plus a random renter.
 * Search pages are cached for 30 minutes so repeated clicks stay fast and cheap.
 */

const SEARCHES = [
  { boro: "brk", cat: "sub" },
  { boro: "brk", cat: "apa" },
  { boro: "mnh", cat: "sub" },
  { boro: "mnh", cat: "apa" },
  { boro: "que", cat: "apa" },
  { boro: "que", cat: "sub" },
];

const PEOPLE = [
  {
    about: "29, product designer, I work from home 3 days a week. I have a cat. I like natural wine bars and cooking, and I run in the mornings. I'm a light sleeper.",
    budget: "2800",
    commuteTo: "Flatiron",
    priorities: ["Quiet at night", "Pet-friendly", "Parks nearby"],
  },
  {
    about: "24, first job in finance, moving from Ohio. Long hours, want to go out on weekends and meet people. Gym every morning.",
    budget: "3200",
    commuteTo: "Midtown",
    priorities: ["Nightlife", "Short commute", "Feels safe"],
  },
  {
    about: "Grad student at Columbia, 26. Tight budget, cook most meals, need somewhere quiet to study. Bike everywhere.",
    budget: "1800",
    commuteTo: "Columbia University",
    priorities: ["Quiet at night", "Great food", "Space to WFH"],
  },
  {
    about: "Couple in our 30s with a dog. Both remote. We want a neighborhood feel, good coffee, and somewhere to walk the dog. Not into loud bars.",
    budget: "4000",
    commuteTo: "",
    priorities: ["Pet-friendly", "Parks nearby", "Laundry in unit", "Space to WFH"],
  },
  {
    about: "Nurse, 31, working night shifts at a hospital. Need to sleep during the day, want a fast trip home at 7am, and I love trying new restaurants on days off.",
    budget: "2500",
    commuteTo: "NYU Langone",
    priorities: ["Quiet at night", "Short commute", "Great food"],
  },
  {
    about: "Musician, 27, play gigs late most nights. Need a place where practicing guitar won't get me evicted. Love dive bars and record stores.",
    budget: "2200",
    commuteTo: "Lower East Side",
    priorities: ["Nightlife", "Lots of light"],
  },
  {
    about: "Here for a 3-month internship this summer, 21. Never lived in NYC. Want to be close to the action and the subway, and safe walking home late.",
    budget: "2000",
    commuteTo: "Hudson Yards",
    priorities: ["Feels safe", "Short commute", "Nightlife"],
  },
];

type Item = { title: string; price: number; area: string; url: string };
const cache = globalThis as unknown as { __examples?: Map<string, { at: number; items: Item[] }> };
cache.__examples ??= new Map();

async function listings(boro: string, cat: string): Promise<Item[]> {
  const key = `${boro}/${cat}`;
  const hit = cache.__examples!.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.items;
  const md = await extractMarkdown(`https://www.craigslist.org/search/subarea/${boro}?cat=${cat}`);
  const items = [...md.matchAll(/\[([^\]]+?)\s+\\?\$([\d,]+)\s+([^\]]*)\]\((https:\/\/www\.craigslist\.org\/view\/d\/[^)\s]+)\)/g)]
    .map((m) => ({
      title: m[1].replace(/\s+/g, " ").replace(/\\/g, "").trim(),
      price: Number(m[2].replace(/,/g, "")),
      area: m[3].replace(/\s+/g, " ").trim(),
      url: m[4],
    }))
    // Skip per-night/weekly posts and obvious junk so the example is a sensible monthly rental.
    .filter((x) => x.price >= 1_400 && x.price <= 8_000 && x.title.length > 12);
  cache.__examples!.set(key, { at: Date.now(), items });
  return items;
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export async function GET() {
  const person = pick(PEOPLE);
  for (const s of [...SEARCHES].sort(() => Math.random() - 0.5).slice(0, 3)) {
    try {
      const items = await listings(s.boro, s.cat);
      if (items.length) return Response.json({ listing: pick(items), person });
    } catch (err) {
      console.warn("[boroly] example search failed:", err instanceof Error ? err.message : err);
    }
  }
  return Response.json({ error: "Couldn't fetch a live listing right now." }, { status: 502 });
}
