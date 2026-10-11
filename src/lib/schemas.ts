import { z } from "zod";

/** Unknown numbers are 0 and unknown strings are "", which keeps the schemas Gemini-friendly. */

export const ListingSchema = z.object({
  title: z.string().describe("Short human title for the place, e.g. 'Sunny 1BR walk-up'"),
  kind: z.enum(["sublet", "rental", "room_share", "unknown"]),
  monthlyRent: z.number().describe("Monthly rent in USD; convert weekly/nightly. 0 if unknown"),
  bedrooms: z.number().describe("0 for studio; -1 if unknown"),
  bathrooms: z.number().describe("0 if unknown"),
  sqft: z.number().describe("0 if unknown"),
  neighborhood: z.string().describe("Best-guess NYC neighborhood, e.g. 'Bushwick'. Infer from cross streets or address"),
  borough: z.enum(["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island", "Unknown"]),
  address: z.string().describe("Address or cross streets as written; '' if none"),
  availability: z.string().describe("Move-in date / sublet dates as written; '' if none"),
  furnished: z.enum(["yes", "no", "unknown"]),
  petsAllowed: z.enum(["yes", "no", "unknown"]),
  laundry: z.string().describe("e.g. 'in-unit', 'in building', 'none', '' if unknown"),
  nearbyTrains: z.array(z.string()).describe("Subway lines mentioned or very likely nearby, e.g. ['L','J','M']"),
  amenities: z.array(z.string()),
  feesAndTerms: z.string().describe("Broker fee, deposit, lease length, utilities included, etc."),
  summary: z.string().describe("2-sentence neutral summary of the listing"),
});
export type Listing = z.infer<typeof ListingSchema>;

export const PlaceNeedSchema = z.object({
  label: z.string().describe("Short label, e.g. 'Park', 'Gym', 'Dog run', 'Natural wine bar'"),
  query: z.string().describe("Google Maps search query, e.g. 'park', 'gym', 'dog park', 'natural wine bar'"),
  why: z.string().describe("2-5 words starting with 'for', tied to the person, e.g. 'for your morning runs', 'for your cat'. '' if generic"),
  role: z.enum(["anchor", "errand"]).describe("anchor = somewhere they go regularly (gym, park, office, school); errand = a quick stop (grocery, coffee, pharmacy, laundromat)"),
});
export type PlaceNeed = z.infer<typeof PlaceNeedSchema>;

/** One cheap call does both: structure the listing and decide which nearby places matter to this person. */
export const ParseSchema = z.object({
  listing: ListingSchema,
  placeNeeds: z
    .array(PlaceNeedSchema)
    .describe("3-5 kinds of places this person will care about nearby, from their description. Do NOT include subway or grocery/supermarket (already covered). Add laundromat if the unit has no laundry"),
  streeteasyArea: z
    .string()
    .describe("StreetEasy URL slug for the listing's neighborhood, e.g. 'bushwick', 'bedford-stuyvesant', 'upper-west-side', 'long-island-city', 'east-village'. '' if unsure"),
});

export type LatLng = { lat: number; lng: number };

export type NearbyPlace = {
  label: string;
  why: string;
  role: "anchor" | "errand";
  name: string;
  address: string;
  lat: number;
  lng: number;
  walkMin: number;
  rating?: number;
  url: string;
  moreWithin10: number;
  onTheWayTo: string;
};

export type HoodmapsVibe = {
  categories: { key: string; label: string; pct: number }[];
  tags: { text: string; votes: number }[];
};

/** A live listing found nearby, used to price the place. */
export type Comp = {
  title: string;
  price: number;
  beds: string;
  area: string;
  url: string;
  source: "StreetEasy" | "Craigslist";
  kind: "lease" | "sublet";
};

/** Rent math done in code from live comps, not from articles. */
export type Market = {
  n: number;
  p25: number;
  median: number;
  p75: number;
  /** Share of comps that are cheaper than the listing, 0-100. */
  cheaperThanPct: number;
  verdict: "steal" | "good" | "fair" | "high" | "ripoff" | "unknown";
  comparedTo: string;
  prices: number[];
  bySource: { source: string; n: number; median: number }[];
  subletMedian?: number;
  picks: (Comp & { delta: number })[];
};

/** Neighborhood research done by a Nimble Web Search Agent, cached per neighborhood. */
export type NeighborhoodBrief = {
  summary: string;
  quotes: { quote: string; source: string; url: string }[];
  goodFor: string[];
  watchOuts: string[];
  confidence: string;
  researchedAt: number;
};

export type BuildingCheck = {
  status: "running" | "done" | "failed";
  address: string;
  runId?: string;
  agentId?: string;
  startedAt: number;
  result?: {
    summary: string;
    landlord: string;
    issues: { issue: string; detail: string; url: string }[];
    positives: string[];
    confidence: string;
  };
};

export type Context = {
  location: (LatLng & { precise: boolean }) | null;
  nearby: NearbyPlace[];
  hoodmaps: HoodmapsVibe | null;
  market: Market | null;
  brief: NeighborhoodBrief | null;
};

export const ReportSchema = z.object({
  fit: z.object({
    score: z.number().describe("0-100 how well this place fits THIS person"),
    headline: z.string().describe("Punchy 4-8 word verdict, NYC voice, no clichés"),
    verdict: z.string().describe("2-3 sentences: should they go see it and why"),
  }),
  life: z.object({
    dayInTheLife: z.string().describe("Second-person 'a weekday living here' vignette, 60-90 words, using the real nearby places by name"),
    vibeTags: z.array(z.string()).describe("4-7 short vibe tags, e.g. 'bodega cats', 'loud Fridays'"),
    commute: z.string().describe("Commute estimate to the person's stated destination if any, with lines. '' if none given"),
    pros: z.array(z.string()).describe("3-4 short pros for this person"),
    cons: z.array(z.string()).describe("3-4 short cons for this person"),
  }),
  negotiationTip: z.string().describe("One concrete negotiation tip using the live price data"),
  betterFits: z
    .array(
      z.object({
        neighborhood: z.string(),
        borough: z.string(),
        why: z.string().describe("One or two sentences tied to the person's description"),
        typicalRent: z.string().describe("e.g. '$2,400-2,900 for a 1BR'"),
        tradeoff: z.string(),
        trains: z.array(z.string()),
      }),
    )
    .describe("2-3 neighborhoods that would fit the person better or comparably for the money"),
  redFlags: z.array(z.string()).describe("Scam signals or problems with the listing itself (payment method, no viewing, missing landlord approval, price too good to be true, vague address). Not fit issues already covered in cons. Empty if none"),
  askBeforeSigning: z.array(z.string()).describe("3-4 sharp questions to ask the landlord/subletter"),
});
export type Report = z.infer<typeof ReportSchema>;

export type StepId = "listing" | "parse" | "nearby" | "agent" | "streeteasy" | "craigslist" | "report";

export type StreamEvent =
  | { type: "step"; id: StepId; status: "active" | "done" | "skipped" | "error"; detail?: string }
  | { type: "listing"; listing: Listing; sourceUrl?: string }
  | { type: "context"; context: Partial<Context> }
  | { type: "report"; report: Report; sources: Source[] }
  | { type: "error"; message: string };

export type Source = { title: string; url: string; kind: string };

/** The "about you" a place was checked with; each saved place keeps its own. */
export type Profile = { about: string; budget: string; commuteTo: string; priorities: string[] };

/** Everything we keep for a checked listing; saved in the browser. */
export type Analysis = {
  id: string;
  savedAt: number;
  input: { listing: string; profile?: Profile };
  listing: Listing;
  sourceUrl?: string;
  context: Context;
  report: Report;
  sources: Source[];
  building?: BuildingCheck;
};

export function toGeminiSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
