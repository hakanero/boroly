"use client";

import { useState } from "react";
import type { Analysis, Market } from "@/lib/schemas";
import { money } from "./bits";
import { MapView, type Pin } from "./MapView";

const PRICE: Record<Market["verdict"], { text: string; tone: string }> = {
  steal: { text: "A steal", tone: "text-good" },
  good: { text: "Good price", tone: "text-good" },
  fair: { text: "Fair price", tone: "text-muted" },
  high: { text: "Pricey", tone: "text-warn" },
  ripoff: { text: "Overpriced", tone: "text-bad" },
  unknown: { text: "Price unclear", tone: "text-muted" },
};

function where(a: Analysis) {
  return [a.listing.neighborhood, a.listing.borough !== "Unknown" ? a.listing.borough : ""].filter(Boolean).join(", ");
}

function FitBadge({ score }: { score: number }) {
  const v = Math.max(0, Math.min(100, Math.round(score)));
  const tone = v >= 70 ? "bg-good" : v >= 45 ? "bg-warn" : "bg-bad";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium" title={`Fit ${v}/100`}>
      <span className={`h-2 w-2 rounded-full ${tone}`} />
      {v}
    </span>
  );
}

/** How the rent compares to the nearby median, e.g. -0.22 for 22% below. */
export function vsMedian(a: Analysis) {
  const m = a.context.market;
  return m && a.listing.monthlyRent > 0 ? a.listing.monthlyRent / m.median - 1 : null;
}

export function walkTo(a: Analysis, label: string) {
  return a.context.nearby.find((p) => p.label.toLowerCase() === label.toLowerCase())?.walkMin;
}

/** The two most telling walks for a card: the subway plus the first place this person goes regularly. */
function keyWalks(a: Analysis) {
  const subway = a.context.nearby.find((p) => p.label === "Subway");
  const anchor = a.context.nearby.find((p) => p.role === "anchor" && p.label !== "Subway");
  return [anchor, subway].filter((p) => !!p).map((p) => `${p!.label} ${p!.walkMin} min`);
}

export function PlaceCard({
  a,
  onOpen,
  active,
  comparing,
  onToggleCompare,
}: {
  a: Analysis;
  onOpen: () => void;
  active?: boolean;
  comparing?: boolean;
  onToggleCompare?: () => void;
}) {
  const p = PRICE[a.context.market?.verdict ?? "unknown"] ?? PRICE.unknown;
  const diff = vsMedian(a);
  const facts = [
    diff === null ? "" : `${Math.abs(Math.round(diff * 100))}% ${diff < 0 ? "below" : "above"} median`,
    ...keyWalks(a),
  ].filter(Boolean);

  return (
    <div
      className={`rise flex rounded-2xl border bg-card transition-colors hover:border-muted ${
        active || comparing ? "border-ink" : "border-line"
      }`}
    >
      <button onClick={onOpen} className="min-w-0 flex-1 p-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted">{where(a)}</p>
          <FitBadge score={a.report.fit.score} />
        </div>
        <p className="mt-1 font-semibold leading-snug">{a.listing.title}</p>
        <p className="mt-2 text-sm">
          <span className="font-mono font-medium">{money(a.listing.monthlyRent)}</span>
          <span className="text-muted">/mo</span> · <span className={p.tone}>{p.text}</span>
        </p>
        {facts.length > 0 && <p className="mt-1 text-xs text-muted">{facts.join(" · ")}</p>}
        <p className="mt-2 line-clamp-2 text-sm text-muted">{a.report.fit.headline}</p>
      </button>
      {onToggleCompare && (
        <button
          onClick={onToggleCompare}
          aria-pressed={comparing}
          aria-label={comparing ? "Remove from comparison" : "Add to comparison"}
          title="Compare"
          className="flex shrink-0 items-center border-l border-line px-3.5 text-muted hover:text-ink"
        >
          <span
            className={`flex h-[18px] w-[18px] items-center justify-center rounded border ${
              comparing ? "border-ink bg-ink text-bg" : "border-muted/60"
            }`}
          >
            {comparing && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
              </svg>
            )}
          </span>
        </button>
      )}
    </div>
  );
}

/** Compact strip for hopping between saved places from inside a report. */
export function PlaceSwitcher({
  places,
  activeId,
  onOpen,
}: {
  places: Analysis[];
  activeId: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-2">
        {places.map((a) => (
          <button
            key={a.id}
            onClick={() => onOpen(a.id)}
            aria-current={a.id === activeId ? "true" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              a.id === activeId ? "border-ink bg-ink text-bg" : "border-line bg-card hover:border-muted"
            }`}
          >
            <span className="max-w-40 truncate">{a.listing.neighborhood || a.listing.title}</span>
            <span className={`font-mono text-xs ${a.id === activeId ? "opacity-70" : "text-muted"}`}>
              {money(a.listing.monthlyRent)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

type Sort = "newest" | "fit" | "deal" | "rent";
const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "fit", label: "Best fit" },
  { id: "deal", label: "Best deal" },
  { id: "rent", label: "Lowest rent" },
];

function sortPlaces(places: Analysis[], sort: Sort) {
  const last = Number.POSITIVE_INFINITY;
  const key: Record<Sort, (a: Analysis) => number> = {
    newest: (a) => -a.savedAt,
    fit: (a) => -a.report.fit.score,
    deal: (a) => vsMedian(a) ?? last,
    rent: (a) => (a.listing.monthlyRent > 0 ? a.listing.monthlyRent : last),
  };
  return [...places].sort((a, b) => key[sort](a) - key[sort](b));
}

export const MAX_COMPARE = 3;

/** My places: every saved place in a list, with the ones we could locate pinned on a map by rent. */
export function PlacesView({
  places,
  onOpen,
  onCompare,
}: {
  places: Analysis[];
  onOpen: (id: string) => void;
  onCompare: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("newest");
  const [compare, setCompare] = useState<string[]>([]);
  const mapped = places.filter((a) => a.context.location);

  const toggleCompare = (id: string) =>
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < MAX_COMPARE ? [...c, id] : c));

  const pins: Pin[] = mapped.map((a) => ({
    id: a.id,
    lat: a.context.location!.lat,
    lng: a.context.location!.lng,
    label: a.listing.monthlyRent > 0 ? `$${(a.listing.monthlyRent / 1000).toFixed(1)}k` : "?",
    title: `${a.listing.title} (${money(a.listing.monthlyRent)})`,
    variant: "listing",
    active: a.id === selected || compare.includes(a.id),
  }));

  // A selected pin's card jumps to the top of the list.
  const sorted = sortPlaces(places, sort);
  const list = selected ? [...sorted].sort((a) => (a.id === selected ? -1 : 0)) : sorted;
  const cards = list.map((a) => (
    <PlaceCard
      key={a.id}
      a={a}
      active={a.id === selected}
      onOpen={() => onOpen(a.id)}
      comparing={compare.includes(a.id)}
      onToggleCompare={places.length > 1 ? () => toggleCompare(a.id) : undefined}
    />
  ));

  return (
    <div className="pb-16">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">My places</h1>
        {places.length > 1 && (
          <div className="flex items-center gap-1 rounded-full border border-line bg-card p-1 text-sm" role="group" aria-label="Sort places">
            {SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                aria-pressed={sort === s.id}
                className={`rounded-full px-3 py-1 transition-colors ${sort === s.id ? "bg-ink text-bg" : "hover:bg-soft"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {mapped.length ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <MapView pins={pins} onSelect={setSelected} scrollZoom className="h-[50vh] min-h-80 lg:h-[70vh]" />
          <div className="space-y-3 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">{cards}</div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards}</div>
      )}

      {compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="text-sm text-muted">
              {compare.length < 2
                ? "Pick one more to compare"
                : `${compare.length} selected${compare.length === MAX_COMPARE ? " (max)" : ""}`}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setCompare([])} className="rounded-full px-3 py-2 text-sm text-muted hover:text-ink">
                Clear
              </button>
              <button
                onClick={() => onCompare(compare)}
                disabled={compare.length < 2}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-40"
              >
                Compare {compare.length > 1 ? compare.length : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
