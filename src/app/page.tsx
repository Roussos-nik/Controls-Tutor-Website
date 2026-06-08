"use client";

import { useState } from "react";
import PlantControls from "@/components/PlantControls";
import ControllerControls from "@/components/ControllerControls";
import StepResponsePlot from "@/components/StepResponsePlot";
import BodePlot from "@/components/BodePlot";
import PoleZeroPlot from "@/components/PoleZeroPlot";
import RootLocusPlot from "@/components/RootLocusPlot";
import MetricsStrip from "@/components/MetricsStrip";
import TutorSlideOver from "@/components/TutorSlideOver";
import ExercisesPanel from "@/components/ExercisesPanel";
import UrlStateSync from "@/components/UrlStateSync";
import CopyLinkButton from "@/components/CopyLinkButton";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — UI skeleton (refined aesthetic pass). Layout shell only.
// Pairs with IBM Plex Sans / IBM Plex Mono loaded in layout.tsx.
// ─────────────────────────────────────────────────────────────────────────────

const GRAPH_PAPER: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, rgba(15,23,42,0.045) 1px, transparent 1px)," +
    "linear-gradient(to bottom, rgba(15,23,42,0.045) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={`transition-transform duration-200 ${
        open ? "rotate-90 text-blue-500" : "rotate-0 text-slate-400"
      }`}
    >
      <path
        d="M4.5 2.5L8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlaceholderRow({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
        {label}
      </span>
      <div className="h-8 rounded-md border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white shadow-[inset_0_1px_2px_rgba(15,23,42,0.02)]" />
    </div>
  );
}

function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-200/70">
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-slate-50"
      >
        <span className="flex items-center gap-2.5">
          <Chevron open={open} />
          <span className="text-[13px] font-semibold tracking-tight text-slate-700">
            {title}
          </span>
        </span>
        {count && (
          <span className="rounded border border-slate-200/70 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            {count}
          </span>
        )}
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-4 px-5 pb-5 pt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, unit }: { label: string; unit: string }) {
  return (
    <div className="group flex min-w-[132px] flex-col gap-1 border-r border-slate-200/70 px-5 py-3 transition-colors last:border-r-0 hover:bg-slate-50/60">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-xl font-medium tabular-nums text-slate-300 transition-colors group-hover:text-slate-400">
          —
        </span>
        {unit && (
          <span className="font-mono text-[11px] text-slate-300">{unit}</span>
        )}
      </div>
    </div>
  );
}

function PlotCell({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-2.5">
        <span className="text-[12px] font-semibold tracking-tight text-slate-600">
          {title}
        </span>
        <div className="flex gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
        </div>
      </div>
      <div className="relative flex-1" style={children ? undefined : GRAPH_PAPER}>
        {children ? (
          <div className="absolute inset-0 p-1">{children}</div>
        ) : (
          <>
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-slate-200/40" />
              <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-slate-200/40" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300">
                plot area
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#fbfbfc] text-slate-900 antialiased">
      <UrlStateSync />
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200/80 bg-white">
        <div className="flex items-center gap-2.5 border-b border-slate-200/70 px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 shadow-sm">
            {/* Feedback-loop icon: forward path (top) + feedback path (bottom) */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 5h10" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M10 3.5L12 5l-2 1.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="5" x2="12" y2="11" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M12 11H2" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M4 9.5L2 11l2 1.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="2" y1="11" x2="2" y2="5" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold tracking-tight text-slate-800">
              Controls Tutor{" "}
              <span className="text-blue-500">+</span>
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section title="Plant" count="G(s)">
            <PlantControls />
          </Section>

          <Section title="Controller" count="C(s)">
            <ControllerControls />
          </Section>
          <Section title="Exercises" count="5">
            <ExercisesPanel />
          </Section>
        </div>
        
        <div className="border-t border-slate-200/80 p-4">
          <CopyLinkButton />
        </div>

        <div className="flex items-center justify-between border-t border-slate-200/70 px-5 py-3">
          <span className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="font-mono text-[10px] text-slate-400">ready</span>
          </span>
          <span className="font-mono text-[10px] text-slate-300">v0.1</span>
        </div>
      </aside>

      {/* ── Right area ──────────────────────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-slate-200/80 bg-white">
          <MetricsStrip />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-4 p-4">
          <PlotCell title="Step Response">
            <StepResponsePlot />
          </PlotCell>
          <PlotCell title="Bode">
            <BodePlot />
          </PlotCell>
          <PlotCell title="Pole–Zero Map">
            <PoleZeroPlot />
          </PlotCell>
          <PlotCell title="Root Locus (Kp)">
            <RootLocusPlot />
          </PlotCell>
        </div>
      </main>
      <TutorSlideOver />
    </div>
  );
}
