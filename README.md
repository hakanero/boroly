# Boroly

Paste any NYC sublet or rental listing (StreetEasy, Craigslist, Zillow, Facebook Marketplace, Reddit) and tell Boroly a bit about yourself. It reads the live web and tells you:

- what living there would be like for you
- whether the price is fair for the area
- similar places nearby, and whether they're better deals
- neighborhoods that might suit you better

## Setup

```bash
cp .env.example .env.local   # then add your keys
npm install
npm run dev
```

| Variable | Where to get it |
| --- | --- |
| `NIMBLE_API_KEY` | https://online.nimbleway.com/settings/api-keys |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | Optional. Defaults to `gemini-3.1-flash-lite`, the cheapest current model |

## How it works

`POST /api/analyze` streams NDJSON progress events while it runs (`src/lib/pipeline.ts`). Everything that can be measured is computed in code; Gemini only writes the personal parts.

1. **Nimble Extract** opens the listing URL in a stealth browser. Pasted text skips this step.
2. **Gemini**, in one small call, structures the listing, picks the kinds of places this person cares about, and names the StreetEasy area.
3. In parallel, all through Nimble:
   - **Price:** **Crawl** walks StreetEasy's paginated results for the same bedroom count, and **Extract** reads Craigslist's radius search within a mile. `src/lib/market.ts` de-dupes reposts, trims outliers and computes the median, the middle half and where the listing falls. A sublet is compared against sublets when there are enough of them.
   - **Neighborhood:** a **Web Search Agent** (low effort, about 30s) researches what residents say, with cited quotes. It's cached per neighborhood for 7 days in `.cache/` (`src/lib/agents.ts`).
   - **Around the block:** the **Extract Template `google_maps_search`** geocodes the listing and finds the nearest good option for each need. Walking times are calculated in code (`src/lib/places.ts`).
   - **Hoodmaps:** the crowd-voted category mix and top tags within a few blocks (`src/lib/hoodmaps.ts`).
4. **Gemini** writes the fit verdict, the day in the life, better-fit neighborhoods and the questions to ask, from about 1.3k tokens of facts. It retries and falls back to another model when busy.

**Building check (opt-in):** `POST /api/building` starts a medium-effort Web Search Agent on the exact address (HPD violations, 311 complaints, bedbugs, reviews, landlord). It takes about 3 minutes; the browser polls `GET /api/building` and saves the result into the place.

Checked places are saved in the browser (`localStorage`), so you can switch between them or see them all on a map (MapLibre with free OpenFreeMap tiles, no key needed).

## Cost per analysis (approximate)

| Piece | Cost |
| --- | --- |
| Gemini (2 calls, about 1.5k in / 1.3k out) | about $0.002 |
| Neighborhood agent (low effort) | $0.025 the first time per neighborhood, then cached |
| Building check (medium effort, opt-in) | $0.10 |
| Nimble extract, search, crawl and template calls | per your Nimble plan |
