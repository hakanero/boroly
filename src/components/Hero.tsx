"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Logo } from "./bits";

/**
 * The big hero logo fades out as the page scrolls; once it's gone, the header logo fades in.
 * Returns the ref for the hero logo and whether the header logo should show.
 */
export function useHeroFade(active: boolean) {
  const heroLogoRef = useRef<HTMLDivElement>(null);
  const [showHeaderLogo, setShowHeaderLogo] = useState(!active);

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowHeaderLogo(true);
      return;
    }
    let frame = 0;
    const apply = () => {
      frame = 0;
      const el = heroLogoRef.current;
      if (!el) return;
      // Fully faded by the time the logo's bottom edge reaches the header.
      const fadeOver = Math.max(1, el.offsetTop + el.offsetHeight - 72);
      const p = Math.min(1, Math.max(0, window.scrollY / fadeOver));
      el.style.opacity = String(1 - p);
      setShowHeaderLogo(p >= 0.95);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [active]);

  return { heroLogoRef, showHeaderLogo };
}

const FEATURES = [
  { title: "Real rents nearby", text: "Priced against live StreetEasy and Craigslist listings, not internet averages." },
  { title: "What locals say", text: "A research agent reads Reddit and neighborhood forums so you don’t have to." },
  { title: "Around the block", text: "Walking times to your park, gym, groceries and train." },
];

export function Hero({ logoRef, onStart }: { logoRef: RefObject<HTMLDivElement | null>; onStart: () => void }) {
  return (
    <section className="flex min-h-[calc(100svh-4.5rem)] flex-col items-center justify-center pt-10 pb-16 text-center sm:pt-0">
      <div ref={logoRef} className="mb-10">
        <Logo size="lg" />
      </div>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Is this place right for <span className="text-accent-ink">you</span>?
      </h1>
      <button
        onClick={onStart}
        className="mt-10 rounded-full bg-ink px-6 py-3 text-[15px] font-medium text-bg transition-opacity hover:opacity-90"
      >
        Check a place
      </button>
      <ul className="mt-16 grid w-full max-w-3xl gap-6 text-left sm:grid-cols-3">
        {FEATURES.map((f) => (
          <li key={f.title}>
            <p className="font-medium">{f.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{f.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
