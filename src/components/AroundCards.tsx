"use client";

import { useState } from "react";
import type { Context, HoodmapsVibe } from "@/lib/schemas";
import { Card } from "./bits";
import { MapView, type Pin } from "./MapView";

export function NearbyCard({ context, className = "" }: { context: Context; className?: string }) {
  const [focus, setFocus] = useState<string | null>(null);
  const { location, nearby } = context;
  if (!location) return null;

  const places = [...nearby].sort((a, b) => a.walkMin - b.walkMin);
  const pins: Pin[] = [
    { id: "home", lat: location.lat, lng: location.lng, label: "B", title: "The listing", variant: "home" },
    ...places.map((p, i) => ({
      id: String(i),
      lat: p.lat,
      lng: p.lng,
      label: String(i + 1),
      title: `${p.label}: ${p.name} (${p.walkMin} min)`,
      variant: "place" as const,
    })),
  ];

  return (
    <Card title="Around the block" className={className}>
      <MapView pins={pins} onSelect={setFocus} className="h-56 sm:h-64" />
      {!location.precise && (
        <p className="mt-2 text-xs text-muted">The listing doesn’t give an exact address, so the pin and walking times are approximate.</p>
      )}
      {places.length > 0 ? (
        <ol className="mt-4 divide-y divide-line">
          {places.map((p, i) => (
            <li
              key={i}
              className={`flex items-start gap-3 py-2.5 transition-colors ${focus === String(i) ? "-mx-2 rounded-lg bg-soft px-2" : ""}`}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[11px] font-semibold">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px]">
                  <span className="font-medium">{p.label}</span>
                  {p.why && <span className="text-muted"> {p.why}</span>}
                </p>
                <p className="truncate text-sm text-muted">
                  <a href={p.url} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                    {p.name}
                  </a>
                  {p.rating ? ` · ${p.rating.toFixed(1)}★` : ""}
                  {p.moreWithin10 > 0 ? ` · ${p.moreWithin10} more within 10 min` : ""}
                </p>
                {p.onTheWayTo && (
                  <p className="mt-0.5 text-xs font-medium text-accent-ink">On your way to the {p.onTheWayTo.toLowerCase()}</p>
                )}
              </div>
              <span className="shrink-0 font-mono text-sm">{p.walkMin} min</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted">Couldn’t load nearby places right now.</p>
      )}
      <p className="mt-3 text-xs text-muted">Walking times are estimates from map distance.</p>
    </Card>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  hipsters: "#f59e0b",
  rich: "#10b981",
  suits: "#3b82f6",
  normies: "#a1a1aa",
  tourists: "#f43f5e",
  uni: "#8b5cf6",
  crime: "#7f1d1d",
};

export function HoodmapsCard({ vibe, className = "" }: { vibe: HoodmapsVibe; className?: string }) {
  const top = vibe.categories[0];
  return (
    <Card title="What Hoodmaps says" className={className}>
      {top && (
        <p className="text-xl font-semibold tracking-tight">
          Mostly <span style={{ color: CATEGORY_COLORS[top.key] }}>{top.label.toLowerCase()}</span>
        </p>
      )}
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-soft">
        {vibe.categories.map((c) => (
          <div key={c.key} style={{ width: `${c.pct}%`, background: CATEGORY_COLORS[c.key] ?? "var(--muted)" }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {vibe.categories.map((c) => (
          <li key={c.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[c.key] ?? "var(--muted)" }} />
            {c.label} <span className="text-muted">{c.pct}%</span>
          </li>
        ))}
      </ul>
      {vibe.tags.length > 0 && (
        <>
          <p className="mt-5 mb-2 text-sm font-medium">Tags locals left nearby</p>
          <ul className="space-y-2">
            {vibe.tags.map((t) => (
              <li key={t.text} className="flex items-baseline justify-between gap-3 text-sm">
                <span>“{t.text}”</span>
                <span className="shrink-0 font-mono text-xs text-muted">▲ {t.votes}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 text-xs text-muted">
        Crowd-drawn on{" "}
        <a href="https://hoodmaps.com/new-york-city-neighborhood-map" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          Hoodmaps
        </a>
        . Take it with a grain of salt.
      </p>
    </Card>
  );
}
