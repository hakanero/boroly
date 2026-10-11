"use client";

import { useEffect, useRef, useState } from "react";
import type { Analysis, Context, Listing, StepId, StreamEvent } from "@/lib/schemas";
import { resumeBuildingChecks } from "@/lib/building";
import { removeAnalysis, saveAnalysis, useSaved } from "@/lib/store";
import { AnalyzeForm, type FormValues } from "./AnalyzeForm";
import { NearbyCard } from "./AroundCards";
import { Hero, useHeroFade } from "./Hero";
import { Card, Logo } from "./bits";
import { CompareView } from "./Compare";
import { PlacesView, PlaceSwitcher } from "./Places";
import { Progress, STEPS, type StepState } from "./Progress";
import { ListingSummary, ReportView } from "./ReportView";

/** What's on screen. Mirrored into the URL (?p=id, ?view=places|map) so back/forward work. */
type View =
  | { kind: "new" }
  | { kind: "running" }
  | { kind: "place"; id: string }
  | { kind: "places" }
  | { kind: "compare"; ids: string[] };

const EMPTY_CONTEXT: Context = { location: null, nearby: [], hoodmaps: null, market: null, brief: null };

const freshSteps = () =>
  Object.fromEntries(STEPS.map((s) => [s.id, { status: "pending" }])) as Record<StepId, StepState>;

function viewFromUrl(): View {
  const q = new URLSearchParams(window.location.search);
  const id = q.get("p");
  if (id) return { kind: "place", id };
  const compare = q.get("compare");
  if (compare) return { kind: "compare", ids: compare.split(",").filter(Boolean) };
  const v = q.get("view");
  // "map" was its own page before; it's part of My places now.
  if (v === "places" || v === "map") return { kind: "places" };
  return { kind: "new" };
}

function urlFor(v: View) {
  if (v.kind === "place") return `?p=${v.id}`;
  if (v.kind === "places") return "?view=places";
  if (v.kind === "compare") return `?compare=${v.ids.join(",")}`;
  return window.location.pathname;
}

export function App() {
  const saved = useSaved();
  const [view, setViewState] = useState<View>({ kind: "new" });
  const [steps, setSteps] = useState(freshSteps);
  const [live, setLive] = useState<{ listing?: Listing; sourceUrl?: string; context?: Context }>({});
  const [error, setError] = useState("");
  const [lastValues, setLastValues] = useState<FormValues | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const { heroLogoRef, showHeaderLogo } = useHeroFade(view.kind === "new");

  // Pick up building checks that were still running when the page was closed.
  useEffect(() => {
    resumeBuildingChecks(saved);
  }, [saved]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewState(viewFromUrl());
    const onPop = () => setViewState(viewFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function go(v: View) {
    if (v.kind !== "running") abortRef.current?.abort();
    setViewState(v);
    if (v.kind !== "running") window.history.pushState(null, "", urlFor(v));
    window.scrollTo({ top: 0 });
  }

  async function run(v: FormValues) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLastValues(v);
    setSteps(freshSteps());
    setLive({});
    setError("");
    go({ kind: "running" });

    const text = v.listing.trim();
    const isUrl = /^(https?:\/\/|www\.)\S+$/i.test(text);
    const urlInText = !isUrl ? text.match(/https?:\/\/\S+/)?.[0] : undefined;
    const acc: Partial<Analysis> = {
      input: { listing: text, profile: { about: v.about, budget: v.budget, commuteTo: v.commuteTo, priorities: v.priorities } },
    };

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          url: isUrl ? text : urlInText,
          listingText: isUrl ? "" : text,
          about: v.about,
          budget: v.budget,
          commuteTo: v.commuteTo,
          priorities: v.priorities,
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as StreamEvent;
          if (e.type === "step") setSteps((s) => ({ ...s, [e.id]: { status: e.status, detail: e.detail } }));
          else if (e.type === "listing") {
            acc.listing = e.listing;
            acc.sourceUrl = e.sourceUrl;
            setLive((l) => ({ ...l, listing: e.listing, sourceUrl: e.sourceUrl }));
          } else if (e.type === "context") {
            acc.context = { ...(acc.context ?? EMPTY_CONTEXT), ...e.context };
            const merged = acc.context;
            setLive((l) => ({ ...l, context: merged }));
          } else if (e.type === "report") {
            const analysis: Analysis = {
              id: Math.random().toString(36).slice(2, 10),
              savedAt: Date.now(),
              input: acc.input!,
              listing: acc.listing!,
              sourceUrl: acc.sourceUrl,
              context: acc.context ?? EMPTY_CONTEXT,
              report: e.report,
              sources: e.sources,
            };
            saveAnalysis(analysis);
            go({ kind: "place", id: analysis.id });
            return;
          } else if (e.type === "error") throw new Error(e.message);
        }
      }
      throw new Error("The analysis stopped early. Try again.");
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const current = view.kind === "place" ? saved.find((a) => a.id === view.id) : undefined;
  const tab = view.kind === "places" || view.kind === "place" || view.kind === "compare" ? "places" : "new";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-colors duration-200 ${
          showHeaderLogo ? "border-b border-line bg-bg/85 backdrop-blur" : "border-b border-transparent"
        }`}
      >
        <div className="mx-auto flex h-[4.5rem] w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <button onClick={() => go({ kind: "new" })} aria-label="Boroly home" className="shrink-0">
            <span className={`inline-block transition-opacity duration-300 ${showHeaderLogo ? "opacity-100" : "pointer-events-none opacity-0"}`}>
              <Logo />
            </span>
          </button>
          <nav className="flex items-center gap-1 rounded-full border border-line bg-card p-1 text-sm">
            <NavTab active={tab === "new"} onClick={() => go({ kind: "new" })}>
              Check
            </NavTab>
            <NavTab active={tab === "places"} onClick={() => go({ kind: "places" })}>
              My places{saved.length > 0 && <span className="ml-1.5 text-muted">{saved.length}</span>}
            </NavTab>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-[4.5rem] pb-20 sm:px-6">
        {view.kind === "new" && (
          <>
            <Hero
              logoRef={heroLogoRef}
              onStart={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            />
            <div ref={formRef} className="mx-auto max-w-xl scroll-mt-24 pt-8">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Check your place</h2>
              <p className="mt-3 text-muted">Paste the listing, tell us a bit about yourself. Takes about a minute.</p>
              <div className="mt-8">
                <AnalyzeForm onSubmit={run} busy={false} initial={lastValues} />
              </div>
            </div>
          </>
        )}

        {view.kind === "running" && (
          <div className="space-y-6 pt-4">
            {live.listing && <ListingSummary listing={live.listing} sourceUrl={live.sourceUrl} />}
            <div className="grid gap-4 lg:grid-cols-5">
              {error ? (
                <Card className="lg:col-span-2">
                  <p className="font-medium">That didn’t work</p>
                  <p className="mt-1 text-muted">{error}</p>
                  <button onClick={() => go({ kind: "new" })} className="mt-4 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-bg">
                    Try again
                  </button>
                </Card>
              ) : (
                <Card className="lg:col-span-2">
                  <Progress steps={steps} />
                </Card>
              )}
              {live.context?.location && <NearbyCard context={live.context} className="lg:col-span-3" />}
            </div>
          </div>
        )}

        {view.kind === "place" &&
          (current ? (
            <div className="space-y-6 pt-2">
              {saved.length > 1 && <PlaceSwitcher places={saved} activeId={current.id} onOpen={(id) => go({ kind: "place", id })} />}
              <ListingSummary listing={current.listing} sourceUrl={current.sourceUrl} />
              <ReportView analysis={current} />
              <button
                onClick={() => {
                  removeAnalysis(current.id);
                  go({ kind: "places" });
                }}
                className="text-sm text-muted hover:text-bad"
              >
                Remove from my places
              </button>
            </div>
          ) : (
            <Empty onNew={() => go({ kind: "new" })} text="That place isn’t saved in this browser." />
          ))}

        {view.kind === "places" &&
          (saved.length ? (
            <div className="pt-4">
              <PlacesView
                places={saved}
                onOpen={(id) => go({ kind: "place", id })}
                onCompare={(ids) => go({ kind: "compare", ids })}
              />
            </div>
          ) : (
            <Empty onNew={() => go({ kind: "new" })} text="Places you check show up here, on a map, so you can compare them." />
          ))}
        {view.kind === "compare" &&
          (() => {
            const chosen = view.ids.map((id) => saved.find((a) => a.id === id)).filter((a): a is Analysis => !!a);
            return chosen.length >= 2 ? (
              <div className="pt-4">
                <button onClick={() => go({ kind: "places" })} className="mb-3 text-sm text-muted hover:text-ink">
                  ← My places
                </button>
                <CompareView places={chosen} onOpen={(id) => go({ kind: "place", id })} />
              </div>
            ) : (
              <Empty onNew={() => go({ kind: "places" })} text="Pick at least two saved places to compare." />
            );
          })()}
      </main>

    </div>
  );
}

function NavTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 transition-colors sm:px-4 ${active ? "bg-ink text-bg" : "text-ink hover:bg-soft"}`}
    >
      {children}
    </button>
  );
}

function Empty({ text, onNew }: { text: string; onNew: () => void }) {
  return (
    <div className="mx-auto max-w-md pt-20 text-center">
      <p className="text-muted">{text}</p>
      <button onClick={onNew} className="mt-5 rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-bg">
        Check a place
      </button>
    </div>
  );
}
