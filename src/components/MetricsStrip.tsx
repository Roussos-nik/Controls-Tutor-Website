"use client";

import { useSimulation } from "@/lib/controlsStore";

// ─────────────────────────────────────────────────────────────────────────────
// MetricsStrip — horizontal row of six derived performance metrics.
// Reads useSimulation().metrics; shows "—" for any null value (e.g. infinite
// gain margin when the phase never reaches -180°).
// ─────────────────────────────────────────────────────────────────────────────

function fmt(v: number | null, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function MetricCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  const empty = value === "—";
  return (
    <div className="flex min-w-[132px] flex-col gap-1 border-r border-slate-200 px-5 py-3 last:border-r-0">
      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-slate-500">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className={`font-mono text-xl font-medium tabular-nums ${
            empty ? "text-slate-400" : "text-slate-800"
          }`}
        >
          {value}
        </span>
        {unit && !empty && (
          <span className="font-mono text-[11px] text-slate-400">{unit}</span>
        )}
      </div>
    </div>
  );
}

export default function MetricsStrip() {
  const { metrics, stable } = useSimulation();

  return (
    <div className="flex items-stretch overflow-x-auto">
      <MetricCard label="Phase Margin" value={fmt(metrics.PM, 1)} unit="deg" />
      <MetricCard label="Gain Margin" value={fmt(metrics.GM, 1)} unit="dB" />
      <MetricCard label="Bandwidth" value={fmt(metrics.bandwidth, 2)} unit="rad/s" />
      <MetricCard label="Overshoot" value={fmt(metrics.overshoot, 1)} unit="%" />
      <MetricCard label="Settling" value={fmt(metrics.settlingTime, 2)} unit="s" />
      <MetricCard label="SS Error" value={fmt(metrics.ss_error, 3)} unit="" />

      {/* Stability flag pinned to the right */}
      <div className="ml-auto flex items-center gap-2 px-5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            stable ? "bg-emerald-400" : "bg-red-500"
          }`}
        />
        <span
          className={`font-mono text-[11px] uppercase tracking-[0.1em] ${
            stable ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {stable ? "stable" : "unstable"}
        </span>
      </div>
    </div>
  );
}
