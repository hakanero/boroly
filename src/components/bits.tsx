import type { ReactNode } from "react";

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rise rounded-2xl border border-line bg-card p-5 sm:p-6 ${className}`}>
      {title && <h2 className="mb-4 text-sm font-medium text-muted">{title}</h2>}
      {children}
    </section>
  );
}

export function Chip({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  const base = "inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition-colors";
  if (!onClick) return <span className={`${base} border-line bg-soft text-ink`}>{children}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${base} ${active ? "border-ink bg-ink text-bg" : "border-line bg-card text-ink hover:border-muted"}`}
    >
      {children}
    </button>
  );
}

/** "B" in a G-train-green circle: circles mark local service on the subway. */
export function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const lg = size === "lg";
  return (
    <span
      className={`inline-flex items-center font-semibold tracking-tight ${lg ? "gap-1 text-6xl sm:text-8xl" : "gap-px text-xl"}`}
      aria-label="Boroly"
    >
      <span
        aria-hidden
        className={`inline-flex items-center justify-center rounded-full bg-accent font-bold leading-none text-white ${
          lg ? "h-[4.25rem] w-[4.25rem] text-[2.6rem] sm:h-[6.5rem] sm:w-[6.5rem] sm:text-[4rem]" : "h-7 w-7 text-[17px]"
        }`}
      >
        B
      </span>
      <span aria-hidden>oroly</span>
    </span>
  );
}

export const money = (n: number) => (n > 0 ? `$${Math.round(n).toLocaleString("en-US")}` : "—");
