import type { StepId } from "@/lib/schemas";

export type StepState = { status: "pending" | "active" | "done" | "skipped" | "error"; detail?: string };

export const STEPS: { id: StepId; label: string }[] = [
  { id: "listing", label: "Reading the listing" },
  { id: "parse", label: "Pulling out the details" },
  { id: "nearby", label: "Mapping what’s nearby" },
  { id: "agent", label: "Asking locals" },
  { id: "streeteasy", label: "Crawling StreetEasy rents" },
  { id: "craigslist", label: "Scanning Craigslist within a mile" },
  { id: "report", label: "Writing your report" },
];

export function Progress({ steps }: { steps: Record<StepId, StepState> }) {
  return (
    <ol className="space-y-3">
      {STEPS.map(({ id, label }) => {
        const s = steps[id];
        return (
          <li key={id} className="flex items-start gap-3">
            <StatusIcon status={s.status} />
            <div className="min-w-0">
              <p className={`text-[15px] ${s.status === "pending" ? "text-muted" : "text-ink"}`}>{label}</p>
              {s.detail && <p className="truncate text-sm text-muted">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StatusIcon({ status }: { status: StepState["status"] }) {
  const box = "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full";
  if (status === "active")
    return <span className={`${box} animate-spin border-2 border-line border-t-accent`} aria-label="In progress" />;
  if (status === "done")
    return (
      <span className={`${box} bg-ink text-bg`} aria-label="Done">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
        </svg>
      </span>
    );
  if (status === "error" || status === "skipped")
    return (
      <span className={`${box} border border-line text-muted`} aria-label="Skipped">
        <span className="h-px w-2 bg-current" />
      </span>
    );
  return <span className={`${box} border border-line`} aria-label="Pending" />;
}
