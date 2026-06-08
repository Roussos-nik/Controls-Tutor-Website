"use client";

import { useEffect } from "react";
import { useControlsStore, useSimulation } from "@/lib/controlsStore";
import { EXERCISES, getExercise, meetsCriteria } from "@/lib/exercises";

// ─────────────────────────────────────────────────────────────────────────────
// ExercisesPanel — lists challenges; while one is active, shows a live
// criteria checklist, detects success on every state change, and (via the
// store flag) drives a completion banner. Designed to sit in a sidebar Section.
// ─────────────────────────────────────────────────────────────────────────────

export default function ExercisesPanel() {
  const activeId = useControlsStore((s) => s.activeExerciseId);
  const complete = useControlsStore((s) => s.exerciseComplete);
  const startExercise = useControlsStore((s) => s.startExercise);
  const exitExercise = useControlsStore((s) => s.exitExercise);
  const markComplete = useControlsStore((s) => s.markExerciseComplete);

  const sim = useSimulation();
  const active = getExercise(activeId);

  // Success detection — runs on every recompute (sim changes when config does).
  useEffect(() => {
    if (active && !complete && meetsCriteria(active, sim)) {
      markComplete();
    }
  }, [active, complete, sim, markComplete]);

  // ── Idle: the challenge list ────────────────────────────────────────────────
  if (!active) {
    return (
      <div className="flex flex-col gap-2">
        {EXERCISES.map((ex) => (
          <button
            key={ex.id}
            onClick={() => startExercise(ex.id, ex.plant.type, ex.plant.params)}
            className="group flex flex-col gap-1 rounded-lg border border-slate-200/80 bg-white p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40"
          >
            <span className="text-[13px] font-semibold text-slate-700 group-hover:text-blue-700">
              {ex.title}
            </span>
            <span className="text-[11px] leading-relaxed text-slate-500">
              {ex.description}
            </span>
          </button>
        ))}
      </div>
    );
  }

  // ── Active: goal + live criteria checklist ──────────────────────────────────
  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-blue-500">
            active challenge
          </span>
          <span className="text-[13px] font-semibold text-slate-800">{active.title}</span>
          <span className="text-[11px] leading-relaxed text-slate-500">{active.description}</span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/60 p-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-slate-500">
            success criteria
          </span>
          {active.criteria.map((c, i) => {
            const pass = c.test(sim);
            return (
              <div key={i} className="flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                    pass ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-400"
                  }`}
                >
                  {pass ? "✓" : "○"}
                </span>
                <span className={`text-[12px] ${pass ? "text-slate-700" : "text-slate-500"}`}>
                  {c.label}
                </span>
              </div>
            );
          })}
        </div>

        <button
          onClick={exitExercise}
          className="self-start font-mono text-[10px] uppercase tracking-[0.1em] text-slate-400 hover:text-slate-600"
        >
          exit challenge
        </button>
      </div>

      {/* Completion banner — fixed, so it shows regardless of panel scroll state */}
      {complete && (
        <div className="fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full border border-emerald-200 bg-white px-5 py-2.5 shadow-lg">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[13px] text-emerald-600">
            ✓
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-semibold text-slate-800">Challenge complete!</span>
            <span className="text-[11px] text-slate-500">
              You solved &ldquo;{active.title}&rdquo;.
            </span>
          </div>
          <button
            onClick={exitExercise}
            className="ml-2 rounded-md bg-slate-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-slate-700"
          >
            Done
          </button>
        </div>
      )}
    </>
  );
}
