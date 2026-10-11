import type { Analysis, Listing, Source } from "@/lib/schemas";
import { HoodmapsCard, NearbyCard } from "./AroundCards";
import { Card, Chip, money } from "./bits";
import { BuildingCard, CompsCard, LocalsCard, PriceCard } from "./MarketCards";

export function ListingSummary({ listing, sourceUrl }: { listing: Listing; sourceUrl?: string }) {
  const facts = [
    listing.bedrooms === 0 ? "Studio" : listing.bedrooms > 0 ? `${listing.bedrooms} bed` : "",
    listing.bathrooms > 0 ? `${listing.bathrooms} bath` : "",
    listing.sqft > 0 ? `${listing.sqft} ft²` : "",
    listing.kind === "sublet" ? "Sublet" : listing.kind === "room_share" ? "Room" : listing.kind === "rental" ? "Lease" : "",
    listing.furnished === "yes" ? "Furnished" : "",
    listing.availability,
  ].filter(Boolean);

  return (
    <div className="rise">
      <p className="text-sm text-muted">
        {[listing.neighborhood, listing.borough !== "Unknown" ? listing.borough : ""].filter(Boolean).join(", ")}
        {listing.nearbyTrains.length > 0 && <> · {listing.nearbyTrains.join(" ")} trains</>}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{listing.title}</h1>
      <p className="mt-2 text-muted">
        <span className="font-medium text-ink">{money(listing.monthlyRent)}/mo</span>
        {facts.length > 0 && <> · {facts.join(" · ")}</>}
        {sourceUrl && (
          <>
            {" · "}
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">
              View listing
            </a>
          </>
        )}
      </p>
    </div>
  );
}

export function ReportView({ analysis }: { analysis: Analysis }) {
  const { report, sources, context, listing } = analysis;
  const { fit, life } = report;

  return (
    <div className="space-y-4">
      {/* Verdict */}
      <Card>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Score value={fit.score} />
          <div>
            <p className="text-xl font-semibold tracking-tight">{fit.headline}</p>
            <p className="mt-1.5 leading-relaxed text-muted">{fit.verdict}</p>
          </div>
        </div>
      </Card>

      {(context.location || context.hoodmaps) && (
        <div className="grid gap-4 lg:grid-cols-5">
          <NearbyCard context={context} className={context.hoodmaps ? "lg:col-span-3" : "lg:col-span-5"} />
          {context.hoodmaps && (
            <HoodmapsCard vibe={context.hoodmaps} className={context.location ? "lg:col-span-2" : "lg:col-span-5"} />
          )}
        </div>
      )}

      {/* Living there */}
      <Card title="What living there would be like">
        <p className="leading-relaxed">{life.dayInTheLife}</p>
        {life.vibeTags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {life.vibeTags.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        )}
        {life.commute && (
          <p className="mt-4 rounded-xl bg-soft px-4 py-3 text-sm">
            <span className="font-medium">Commute: </span>
            {life.commute}
          </p>
        )}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <List title="Good for you" items={life.pros} mark="+" tone="text-good" />
          <List title="Watch out" items={life.cons} mark="–" tone="text-bad" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <PriceCard market={context.market} rent={listing.monthlyRent} tip={report.negotiationTip} />
        <CompsCard market={context.market} />
      </div>

      {context.brief && <LocalsCard brief={context.brief} />}

      {/* Better fits */}
      {report.betterFits.length > 0 && (
        <Card title="Neighborhoods that might suit you better">
          <div className={`grid gap-3 ${report.betterFits.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            {report.betterFits.map((b) => (
              <div key={b.neighborhood} className="rounded-xl border border-line p-4">
                <p className="font-semibold">{b.neighborhood}</p>
                <p className="text-sm text-muted">
                  {b.borough}
                  {b.trains.length > 0 && <> · {b.trains.join(" ")}</>}
                </p>
                <p className="mt-3 text-sm leading-relaxed">{b.why}</p>
                <p className="mt-3 font-mono text-sm">{b.typicalRent}</p>
                <p className="mt-1 text-xs text-muted">Trade-off: {b.tradeoff}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <BuildingCard analysis={analysis} />

      {/* Before you sign */}
      <Card title="Before you sign">
        <div className="grid gap-5 sm:grid-cols-2">
          <List title="Ask about" items={report.askBeforeSigning} mark="?" tone="text-muted" />
          {report.redFlags.length > 0 ? (
            <List title="Red flags" items={report.redFlags} mark="!" tone="text-bad" />
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium">Red flags</p>
              <p className="text-sm text-muted">Nothing obvious. Still, never pay before you’ve seen the place.</p>
            </div>
          )}
        </div>
      </Card>

      {sources.length > 0 && (
        <details className="rounded-2xl border border-line bg-card px-5 py-4 sm:px-6">
          <summary className="cursor-pointer text-sm text-muted">
            {sources.length} live sources, fetched with Nimble
          </summary>
          <ul className="mt-3 space-y-1.5 text-sm">
            {dedupe(sources).map((s) => (
              <li key={s.url} className="flex gap-2">
                <span className="w-20 shrink-0 text-muted">{s.kind}</span>
                <a href={s.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Score({ value }: { value: number }) {
  const v = clamp(Math.round(value), 0, 100);
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = v >= 70 ? "var(--good)" : v >= 45 ? "var(--warn)" : "var(--bad)";
  return (
    <div className="relative h-20 w-20 shrink-0" role="img" aria-label={`Fit score ${v} out of 100`}>
      <svg viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--soft)" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold leading-none">{v}</span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">fit</span>
      </div>
    </div>
  );
}

function List({ title, items, mark, tone }: { title: string; items: string[]; mark: string; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
            <span className={`w-3 shrink-0 font-mono font-semibold ${tone}`}>{mark}</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, Number(n) || 0));

function dedupe(s: Source[]) {
  const seen = new Set<string>();
  return s.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)));
}
