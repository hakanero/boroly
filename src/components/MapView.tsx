"use client";

import { useEffect, useRef } from "react";
import type { Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type Pin = {
  id: string;
  lat: number;
  lng: number;
  /** Text inside the pin; omitted for small dot pins. */
  label?: string;
  title: string;
  variant: "home" | "place" | "listing";
  active?: boolean;
};

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

export function MapView({
  pins,
  onSelect,
  className = "",
  scrollZoom = false,
}: {
  pins: Pin[];
  onSelect?: (id: string) => void;
  className?: string;
  /** Off by default so an inline map doesn't hijack page scrolling. */
  scrollZoom?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  const fitKey = useRef("");
  const pinsRef = useRef(pins);
  useEffect(() => {
    pinsRef.current = pins;
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !box.current) return;
      lib.current = maplibre;
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      map.current = new maplibre.Map({
        container: box.current,
        style: dark ? STYLE.dark : STYLE.light,
        center: [-73.95, 40.72],
        zoom: 11,
        attributionControl: { compact: true },
        scrollZoom,
      });
      map.current.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      map.current.once("load", () => {
        if (map.current && lib.current)
        {
          markers.current = drawPins(map.current, lib.current, pinsRef.current, markers.current, (id) => onSelectRef.current?.(id), true);
          fitKey.current = pinsRef.current.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|");
        }
      });
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw on any change, but only re-frame the view when the set of locations changes.
  useEffect(() => {
    if (!map.current?.loaded() || !lib.current) return;
    const key = pins.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|");
    markers.current = drawPins(map.current, lib.current, pins, markers.current, (id) => onSelectRef.current?.(id), key !== fitKey.current);
    fitKey.current = key;
  }, [pins]);

  return <div ref={box} className={`overflow-hidden rounded-xl bg-soft ${className}`} />;
}

function drawPins(
  m: MLMap,
  maplibre: typeof import("maplibre-gl"),
  pins: Pin[],
  old: Marker[],
  onSelect: (id: string) => void,
  fit: boolean,
): Marker[] {
  old.forEach((mk) => mk.remove());
  const next = pins.map((p) => {
    const el = document.createElement("button");
    el.type = "button";
    el.title = p.title;
    el.setAttribute("aria-label", p.title);
    el.className = pinClass(p);
    if (p.label) el.textContent = p.label;
    if (p.variant === "home" || p.active) el.style.zIndex = "2";
    el.onclick = (e) => {
      e.stopPropagation();
      onSelect(p.id);
    };
    return new maplibre.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m);
  });

  if (!fit) return next;
  if (pins.length === 1) {
    m.jumpTo({ center: [pins[0].lng, pins[0].lat], zoom: 14 });
  } else if (pins.length > 1) {
    const b = new maplibre.LngLatBounds();
    pins.forEach((p) => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: 48, maxZoom: 15.5, duration: 0 });
  }
  return next;
}

function pinClass(p: Pin) {
  const base = "rounded-full border-2 border-white shadow-md cursor-pointer hover:brightness-110";
  if (p.variant === "home")
    return `${base} flex h-7 w-7 items-center justify-center bg-accent text-[13px] font-bold text-white`;
  if (p.variant === "listing")
    return `${base} px-2.5 py-1 font-mono text-xs font-semibold ${p.active ? "bg-accent text-white z-10" : "bg-ink text-bg"}`;
  return `${base} flex h-6 min-w-6 items-center justify-center bg-card px-1.5 text-[11px] font-semibold text-ink`;
}
