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

export function PlaceCard({ a, onOpen, active }: { a: Analysis; onOpen: () => void; active?: boolean }) {
  const p = PRICE[a.context.market?.verdict ?? "unknown"] ?? PRICE.unknown;
  return (
    <button
      onClick={onOpen}
      className={`rise w-full rounded-2xl border bg-card p-4 text-left transition-colors hover:border-muted ${active ? "border-ink" : "border-line"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{where(a)}</p>
        <FitBadge score={a.report.fit.score} />
      </div>
      <p className="mt-1 font-semibold leading-snug">{a.listing.title}</p>
      <p className="mt-2 text-sm">
        <span className="font-mono font-medium">{money(a.listing.monthlyRent)}</span>
        <span className="text-muted">/mo</span> · <span className={p.tone}>{p.text}</span>
      </p>
      <p className="mt-2 line-clamp-2 text-sm text-muted">{a.report.fit.headline}</p>
    </button>
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

/** My places: every saved place in a list, with the ones we could locate pinned on a map by rent. */
export function PlacesMap({ places, onOpen }: { places: Analysis[]; onOpen: (id: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const mapped = places.filter((a) => a.context.location);

  const pins: Pin[] = mapped.map((a) => ({
    id: a.id,
    lat: a.context.location!.lat,
    lng: a.context.location!.lng,
    label: a.listing.monthlyRent > 0 ? `$${(a.listing.monthlyRent / 1000).toFixed(1)}k` : "?",
    title: `${a.listing.title} (${money(a.listing.monthlyRent)})`,
    variant: "listing",
    active: a.id === selected,
  }));

  // A selected pin's card jumps to the top of the list.
  const list = selected ? [...places].sort((a) => (a.id === selected ? -1 : 0)) : places;
  const cards = list.map((a) => (
    <PlaceCard key={a.id} a={a} active={a.id === selected} onOpen={() => onOpen(a.id)} />
  ));

  if (!mapped.length) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards}</div>;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <MapView pins={pins} onSelect={setSelected} scrollZoom className="h-[50vh] min-h-80 lg:h-[70vh]" />
      <div className="space-y-3 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">{cards}</div>
    </div>
  );
}
