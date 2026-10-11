"use client";

import { useState } from "react";
import { startBuildingCheck } from "@/lib/building";
import type { Analysis, Market, NeighborhoodBrief } from "@/lib/schemas";
import { Card, money } from "./bits";

export const PRICE_LABEL: Record<Market["verdict"], { text: string; tone: string }> = {
  steal: { text: "A steal", tone: "text-good" },
  good: { text: "Good price", tone: "text-good" },
  fair: { text: "Fair price", tone: "text-ink" },
  high: { text: "On the high side", tone: "text-warn" },
  ripoff: { text: "Overpriced", tone: "text-bad" },
  unknown: { text: "Hard to say", tone: "text-muted" },
};

export function PriceCard({ market, rent, tip }: { market: Market | null; rent: number; tip: string }) {
  if (!market) {
    return (
      <Card title="Is the price right?">
        <p className="text-2xl font-semibold tracking-tight text-muted">Hard to say</p>
        <p className="mt-2 text-muted">There weren’t enough similar listings live nearby to compare against right now.</p>
      </Card>
    );
  }
  const p = PRICE_LABEL[market.verdict];
  const diff = rent > 0 ? Math.round((rent / market.median - 1) * 100) : 0;
  return (
    <Card title="Is the price right?">
      <p className={`text-2xl font-semibold tracking-tight ${p.tone}`}>{p.text}</p>
      <p className="mt-1.5 text-muted">
        {rent > 0 ? (
          <>
            {money(rent)} is{" "}
            <span className="font-medium text-ink">
              {diff === 0 ? "right at" : `${Math.abs(diff)}% ${diff < 0 ? "below" : "above"}`}
            </span>{" "}
            the {money(market.median)} median of {market.comparedTo}, and cheaper than {market.cheaperThanPct}% of them.
          </>
        ) : (
          <>Similar places nearby go for about {money(market.median)}.</>
        )}
      </p>
      <PriceStrip market={market} rent={rent} />
      <p className="mt-2 text-xs text-muted">
        Each dot is a live listing:{" "}
        {market.bySource.map((s, i) => (
          <span key={s.source}>
            {i > 0 && " · "}
            {s.n} on {s.source} (median {money(s.median)})
          </span>
        ))}
        {market.subletMedian ? ` · sublets nearby run about ${money(market.subletMedian)}` : ""}. The shaded band is the middle half.
      </p>
      {tip && (
        <p className="mt-4 rounded-xl bg-accent-soft px-4 py-3 text-sm">
          <span className="font-medium">Tip: </span>
          {tip}
        </p>
      )}
    </Card>
  );
}

/** Dot plot of every comparable rent, with the middle half shaded and the listing marked. */
function PriceStrip({ market, rent }: { market: Market; rent: number }) {
  const values = rent > 0 ? [...market.prices, rent] : market.prices;
  const min = Math.min(...values) * 0.97;
  const max = Math.max(...values) * 1.03;
  const pos = (n: number) => `${((n - min) / (max - min)) * 100}%`;
  return (
    <div className="mt-6" aria-hidden>
      <div className="relative h-20">
        <div
          className="absolute top-6 h-10 rounded-md bg-ink/10"
          style={{ left: pos(market.p25), width: `calc(${pos(market.p75)} - ${pos(market.p25)})` }}
        />
        <div className="absolute top-5 h-12 w-px bg-muted" style={{ left: pos(market.median) }} />
        {market.prices.map((p, i) => (
          <span
            key={i}
            className="absolute h-2 w-2 -translate-x-1/2 rounded-full bg-ink/45"
            style={{ left: pos(p), top: `${28 + ((i * 37) % 26)}px` }}
          />
        ))}
        {rent > 0 && (
          <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: pos(rent) }}>
            <p className="whitespace-nowrap font-mono text-xs font-semibold">{money(rent)}</p>
            <div className="mx-auto mt-0.5 h-14 w-0.5 rounded bg-accent" />
          </div>
        )}
      </div>
      <div className="relative mt-1 h-4 text-xs text-muted">
        <span className="absolute left-0">{money(Math.min(...market.prices))}</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pos(market.median) }}>
          median {money(market.median)}
        </span>
        <span className="absolute right-0">{money(Math.max(...market.prices))}</span>
      </div>
    </div>
  );
}

export function CompsCard({ market }: { market: Market | null }) {
  const picks = market?.picks ?? [];
  return (
    <Card title="Similar places nearby">
      {picks.length === 0 ? (
        <p className="text-muted">No live comparable listings found right now.</p>
      ) : (
        <ul className="-my-3 divide-y divide-line">
          {picks.map((c) => (
            <li key={c.url} className="py-3">
              <a href={c.url} target="_blank" rel="noreferrer" className="group flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium group-hover:underline">{c.title}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {[c.beds, c.area, c.source, c.kind === "sublet" ? "Sublet" : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono font-medium">{money(c.price)}</p>
                  {c.delta !== 0 && (
                    <p className={`mt-0.5 font-mono text-xs ${c.delta < 0 ? "text-good" : "text-muted"}`}>
                      {c.delta < 0 ? "−" : "+"}
                      {money(Math.abs(c.delta))}
                    </p>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function LocalsCard({ brief }: { brief: NeighborhoodBrief }) {
  return (
    <Card title="What locals say">
      <p className="leading-relaxed">{brief.summary}</p>
      {brief.quotes.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {brief.quotes.map((q, i) => (
            <figure key={i} className="rounded-xl bg-soft p-4">
              <blockquote className="text-sm leading-relaxed">“{q.quote}”</blockquote>
              <figcaption className="mt-2 truncate text-xs text-muted">
                <a href={q.url} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                  {q.source}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Researched by a Nimble web agent · {brief.confidence || "unknown"} confidence ·{" "}
        {new Date(brief.researchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </p>
    </Card>
  );
}

export function BuildingCard({ analysis }: { analysis: Analysis }) {
  const b = analysis.building;
  const [address, setAddress] = useState(
    b?.address ?? (/^\s*\d/.test(analysis.listing.address) ? analysis.listing.address : ""),
  );

  if (b?.status === "done" && b.result) {
    const r = b.result;
    return (
      <Card title={`Building check · ${b.address}`}>
        <p className="leading-relaxed">{r.summary}</p>
        {r.landlord && (
          <p className="mt-2 text-sm text-muted">
            <span className="font-medium text-ink">Landlord / management:</span> {r.landlord}
          </p>
        )}
        {r.issues.length > 0 && (
          <ul className="mt-4 space-y-3">
            {r.issues.map((it, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="w-3 shrink-0 font-mono font-semibold text-bad">!</span>
                <div>
                  <p className="font-medium">
                    {it.url ? (
                      <a href={it.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {it.issue}
                      </a>
                    ) : (
                      it.issue
                    )}
                  </p>
                  <p className="mt-0.5 leading-relaxed text-muted">{it.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {r.positives.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {r.positives.map((x, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="w-3 shrink-0 font-mono font-semibold text-good">+</span>
                <span>{x}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">Researched by a Nimble web agent · {r.confidence} confidence. Verify on HPD Online before signing.</p>
      </Card>
    );
  }

  if (b?.status === "running") {
    return (
      <Card title="Building check">
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" />
          <p>
            Digging into violations, 311 complaints, bedbugs and reviews for <span className="font-medium">{b.address}</span>…
          </p>
        </div>
        <p className="mt-2 text-sm text-muted">
          Started at {new Date(b.startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}, takes about 3
          minutes. You can keep browsing; it’ll show up here.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Building check">
      <p className="text-muted">
        A research agent looks up HPD violations, 311 complaints, bedbug filings and tenant reviews for the exact building.
        {b?.status === "failed" && <span className="text-bad"> The last attempt didn’t finish, try again.</span>}
      </p>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (address.trim().length >= 6) startBuildingCheck(analysis.id, address.trim());
        }}
      >
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Building address, e.g. 123 Melrose St, Brooklyn"
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-4 py-2.5 text-[15px] outline-none placeholder:text-muted/70 focus:border-ink"
        />
        <button
          type="submit"
          disabled={address.trim().length < 6}
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-bg disabled:opacity-40"
        >
          Check the building
        </button>
      </form>
      <p className="mt-2 text-xs text-muted">Takes about 3 minutes.</p>
    </Card>
  );
}
