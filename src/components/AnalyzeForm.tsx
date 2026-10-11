"use client";

import { useEffect, useState } from "react";
import { Chip } from "./bits";

export type FormValues = {
  listing: string;
  about: string;
  budget: string;
  commuteTo: string;
  priorities: string[];
};

const PRIORITIES = [
  "Quiet at night",
  "Nightlife",
  "Great food",
  "Parks nearby",
  "Short commute",
  "Pet-friendly",
  "Feels safe",
  "Laundry in unit",
  "Lots of light",
  "Space to WFH",
];

/** Offline fallback if a live example can't be fetched. */
const EXAMPLE: FormValues = {
  listing: `Summer sublet: sunny 1BR in Bushwick, Jefferson L stop, $2,650/mo

Subletting my furnished 1 bedroom June 1 to Aug 31 (dates a little flexible). 3rd floor walk-up on Troutman St near Wyckoff Ave, about 4 min to the Jefferson St L. Big windows, south facing, the bedroom fits a queen. Exposed brick, renovated kitchen with dishwasher. Laundromat on the corner, no laundry in the building. Heat and hot water included, you'd pay ConEd and wifi (~$90/mo). Cats OK, sorry no dogs (landlord rule). Bars on the block can get loud on weekends. $2,650 a month plus a one-month deposit. Venmo only, message me for a FaceTime tour.`,
  about:
    "29, product designer, I work from home 3 days a week. I have a cat. I like natural wine bars and cooking, and I run in the mornings. I'm a light sleeper.",
  budget: "2500",
  commuteTo: "Flatiron",
  priorities: ["Quiet at night", "Pet-friendly", "Parks nearby"],
};

const STORAGE_KEY = "boroly.profile.v1";

export function AnalyzeForm({
  onSubmit,
  busy,
  initial,
}: {
  onSubmit: (v: FormValues) => void;
  busy: boolean;
  initial?: FormValues | null;
}) {
  const [v, setV] = useState<FormValues>(
    initial ?? { listing: "", about: "", budget: "", commuteTo: "", priorities: [] },
  );

  // Remember the person between visits, not the listing.
  useEffect(() => {
    if (initial) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setV((cur) => ({ ...cur, ...saved, listing: cur.listing }));
    } catch {}
  }, [initial]);

  const update = (patch: Partial<FormValues>) => setV((cur) => ({ ...cur, ...patch }));

  // A random real Craigslist listing plus a random renter, fresh on every click.
  const [example, setExample] = useState<{ loading: boolean; note: string }>({ loading: false, note: "" });
  async function tryExample() {
    setExample({ loading: true, note: "" });
    try {
      const res = await fetch("/api/example", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.listing) throw new Error();
      setV({ listing: j.listing.url, ...j.person });
      setExample({ loading: false, note: `Live on Craigslist: “${j.listing.title}” · $${j.listing.price.toLocaleString("en-US")}` });
    } catch {
      setV(EXAMPLE);
      setExample({ loading: false, note: "Couldn’t reach Craigslist, so here’s a sample listing instead." });
    }
  }
  const togglePriority = (p: string) =>
    update({ priorities: v.priorities.includes(p) ? v.priorities.filter((x) => x !== p) : [...v.priorities, p] });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.listing.trim() || busy) return;
    try {
      const { listing: _listing, ...profile } = v;
      void _listing;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {}
    onSubmit(v);
  };

  const isUrl = /^\s*(https?:\/\/|www\.)\S+\s*$/i.test(v.listing);
  const label = "mb-2 block text-sm font-medium";
  const input =
    "w-full rounded-xl border border-line bg-card px-4 py-3 text-[15px] outline-none transition-colors placeholder:text-muted/70 focus:border-ink";

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="listing" className="text-sm font-medium">
            The listing
          </label>
          <button
            type="button"
            onClick={tryExample}
            disabled={example.loading}
            className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline disabled:no-underline disabled:opacity-60"
          >
            {example.loading ? "Finding a listing…" : "Try a random example"}
          </button>
        </div>
        <textarea
          id="listing"
          rows={isUrl ? 2 : 4}
          value={v.listing}
          onChange={(e) => update({ listing: e.target.value })}
          placeholder="Paste a link, or the listing text"
          className={`${input} resize-y`}
        />
        <p className="mt-2 text-xs text-muted">
          {example.note ||
            "Works with StreetEasy, Craigslist, Zillow and most listing pages. For Facebook or Reddit posts, paste the text."}
        </p>
      </div>

      <div>
        <label htmlFor="about" className={label}>
          About you
        </label>
        <textarea
          id="about"
          rows={3}
          value={v.about}
          onChange={(e) => update({ about: e.target.value })}
          placeholder="Age, job, schedule, pets, what a good weekend looks like, deal-breakers…"
          className={`${input} resize-y`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="budget" className={label}>
            Monthly budget
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">$</span>
            <input
              id="budget"
              inputMode="numeric"
              value={v.budget}
              onChange={(e) => update({ budget: e.target.value.replace(/[^\d]/g, "") })}
              placeholder="2,500"
              className={`${input} pl-8`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="commute" className={label}>
            Commute to
          </label>
          <input
            id="commute"
            value={v.commuteTo}
            onChange={(e) => update({ commuteTo: e.target.value })}
            placeholder="e.g. Midtown, NYU, Hudson Yards"
            className={input}
          />
        </div>
      </div>

      <div>
        <span className={label}>What matters most</span>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <Chip key={p} active={v.priorities.includes(p)} onClick={() => togglePriority(p)}>
              {p}
            </Chip>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={!v.listing.trim() || busy}
        className="w-full rounded-xl bg-ink px-5 py-3.5 text-[15px] font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Checking…" : "Check this place"}
      </button>
    </form>
  );
}
