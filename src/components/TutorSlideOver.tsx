"use client";

import { useEffect, useState } from "react";
import TutorChat from "./TutorChat";

// ─────────────────────────────────────────────────────────────────────────────
// TutorSlideOver — a floating button that slides a tutor panel in from the right
// over the plots. Self-contained: drop <TutorSlideOver /> anywhere inside the
// app shell and it manages its own open/closed state.
// ─────────────────────────────────────────────────────────────────────────────

export default function TutorSlideOver() {
  const [open, setOpen] = useState(false);

  // Close on Escape for convenience.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Floating toggle button (bottom-right) */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-lg transition-colors hover:bg-slate-700"
        aria-label="Toggle tutor"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M2 3.5h10M2 7h10M2 10.5h6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        Tutor
      </button>

      {/* Backdrop — click to close. Fades in/out. */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-900/20 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Sliding panel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[380px] max-w-[90vw] flex-col border-l border-slate-200/80 bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Close affordance */}
        <button
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close tutor"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3.5 3.5l7 7M10.5 3.5l-7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <TutorChat />
      </aside>
    </>
  );
}
