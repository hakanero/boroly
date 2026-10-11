"use client";

import type { ReactNode } from "react";
import type { Analysis } from "@/lib/schemas";
import { money } from "./bits";
import { PRICE_LABEL } from "./MarketCards";
import { vsMedian, walkTo } from "./Places";

type Row = {
  label: string;
  /** Display value per place; null shows a dash. */
  cells: (ReactNode | null)[];
  /** Numbers used to find the best place in this row. */
  scores?: (number | null | undefined)[];
  better?: "lower" | "higher";
};

/**
 * Side by side, only the facts that decide between places. Everything here is already saved with
 * each place, so comparing is instant and costs nothing.
 */
export function CompareView({ places, onOpen }: { places: Analysis[]; onOpen: (id: string) => void }) {
  const pct = (d: number | null) => (d === null ? null : `${Math.abs(Math.round(d * 100))}% ${d < 0 ? "below" : "above"}`);

  // Walks only make sense where every place was searched for the same thing.
  const walkLabels = (places[0]?.context.nearby ?? [])
    .map((p) => p.label)
    .filter((label) => places.every((a) => walkTo(a, label) !== undefined));

  const rows: Row[] = [
    {
      label: "Rent",
      cells: places.map((a) => (a.listing.monthlyRent > 0 ? `${money(a.listing.monthlyRent)}/mo` : null)),
      scores: places.map((a) => (a.listing.monthlyRent > 0 ? a.listing.monthlyRent : null)),
      better: "lower",
    },
    {
      label: "Size",
      cells: places.map((a) => {
        const l = a.listing;
        const beds = l.bedrooms === 0 ? "Studio" : l.bedrooms > 0 ? `${l.bedrooms} bed` : "";
        const kind = { sublet: "Sublet", rental: "Lease", room_share: "Room", unknown: "" }[l.kind];
        return [beds, l.sqft > 0 ? `${l.sqft} ft²` : "", kind].filter(Boolean).join(" · ") || null;
      }),
    },
    {
      label: "vs. nearby median",
      cells: places.map((a) => pct(vsMedian(a))),
      scores: places.map((a) => vsMedian(a)),
      better: "lower",
    },
    {
      label: "Price",
      cells: places.map((a) => {
        const v = a.context.market?.verdict;
        return v && v !== "unknown" ? <span key={a.id} className={PRICE_LABEL[v].tone}>{PRICE_LABEL[v].text}</span> : null;
      }),
    },
    {
      label: "Fit for you",
      cells: places.map((a) => `${Math.round(a.report.fit.score)}/100`),
      scores: places.map((a) => a.report.fit.score),
      better: "higher",
    },
    ...walkLabels.map(
      (label): Row => ({
        label: `Walk to ${label.toLowerCase()}`,
        cells: places.map((a) => `${walkTo(a, label)} min`),
        scores: places.map((a) => walkTo(a, label)),
        better: "lower",
      }),
    ),
    {
      label: "Vibes",
      cells: places.map((a) => {
        const cats = a.context.hoodmaps?.categories.slice(0, 2);
        return cats?.length ? cats.map((c) => `${c.label} ${c.pct}%`).join(", ") : null;
      }),
    },
    {
      label: "Building issues",
      cells: places.map((a) =>
        a.building?.status === "done" && a.building.result
          ? String(a.building.result.issues.length)
          : <span key={a.id} className="text-muted">Not checked</span>,
      ),
      scores: places.map((a) => (a.building?.status === "done" ? (a.building.result?.issues.length ?? null) : null)),
      better: "lower",
    },
    {
      label: "Red flags",
      cells: places.map((a) => String(a.report.redFlags.length)),
      scores: places.map((a) => a.report.redFlags.length),
      better: "lower",
    },
    {
      label: "Available",
      cells: places.map((a) => a.listing.availability || null),
    },
    {
      label: "Verdict",
      cells: places.map((a) => <span key={a.id} className="text-muted">{a.report.fit.headline}</span>),
    },
  ];

  return (
    <div className="pb-16">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Compare</h1>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-36 bg-bg" />
              {places.map((a) => (
                <th key={a.id} className="border-b border-line px-3 pb-3 text-left align-bottom font-normal">
                  <p className="text-muted">{a.listing.neighborhood}</p>
                  <button onClick={() => onOpen(a.id)} className="mt-0.5 text-left text-[15px] font-semibold leading-snug hover:underline">
                    {a.listing.title}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const best = bestIndexes(row);
              return (
                <tr key={row.label}>
                  <th className="sticky left-0 z-10 border-b border-line bg-bg py-3 pr-3 text-left align-top font-normal text-muted">
                    {row.label}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={i}
                      className={`border-b border-line px-3 py-3 align-top ${best.has(i) ? "font-semibold text-good" : ""}`}
                    >
                      {cell ?? <span className="text-muted">—</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Which places win this row. Nothing is highlighted on a tie across the board or with fewer than two values. */
function bestIndexes(row: Row) {
  const out = new Set<number>();
  if (!row.scores || !row.better) return out;
  const vals = row.scores.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => typeof x.v === "number");
  if (vals.length < 2) return out;
  const target = row.better === "lower" ? Math.min(...vals.map((x) => x.v)) : Math.max(...vals.map((x) => x.v));
  const winners = vals.filter((x) => x.v === target);
  if (winners.length === vals.length) return out;
  winners.forEach((x) => out.add(x.i));
  return out;
}
