"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useSimulation } from "@/lib/controlsStore";

// Plotly references `window` at import time → must load client-only.
const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300">
      loading plot…
    </div>
  ),
});

// Palette matched to the app shell (slate + blue accent, emerald for "good").
const COLORS = {
  response: "#2563eb",   // blue-600 — the output curve
  setpoint: "#94a3b8",   // slate-400 — reference line
  band: "rgba(16,185,129,0.08)", // emerald tint — ±2% settling band
  bandLine: "#10b981",   // emerald-500 — settling marker
  grid: "rgba(15,23,42,0.09)",
  text: "#475569",       // slate-600
  textMuted: "#64748b",  // slate-500 — WCAG AA safe at 11px
};

const FONT_SANS = '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';

export default function StepResponsePlot() {
  const sim = useSimulation();
  const { t, y } = sim.stepResponse;
  const { overshoot, settlingTime, ss_error } = sim.metrics;

  const figure = useMemo(() => {
    // No simulable data (e.g. improper/failed) → signal empty.
    if (!y || y.length === 0) return null;

    // Steady-state value: derive from ss_error if available, else last sample.
    const finalVal =
      ss_error !== null && Number.isFinite(ss_error) ? 1 - ss_error : y[y.length - 1];

    // ±2% settling band around the final value.
    const bandLo = finalVal * 0.98;
    const bandHi = finalVal * 1.02;

    // Peak (for the overshoot annotation).
    let peakVal = -Infinity;
    let peakIdx = 0;
    for (let i = 0; i < y.length; i++) {
      if (y[i] > peakVal) {
        peakVal = y[i];
        peakIdx = i;
      }
    }
    const peakT = t[peakIdx];

    const showOvershoot = overshoot !== null && overshoot > 0.5;
    const showSettling = settlingTime !== null;

    const data = [
      {
        x: t,
        y,
        type: "scatter",
        mode: "lines",
        name: "Output",
        line: { color: COLORS.response, width: 2, shape: "spline" },
        hovertemplate: "t = %{x:.2f} s<br>y = %{y:.3f}<extra></extra>",
      },
      // Peak marker dot
      ...(showOvershoot
        ? [
            {
              x: [peakT],
              y: [peakVal],
              type: "scatter",
              mode: "markers",
              marker: { color: COLORS.response, size: 7 },
              hoverinfo: "skip",
              showlegend: false,
            },
          ]
        : []),
    ];

    const shapes: any[] = [
      // ±2% settling band (shaded)
      {
        type: "rect",
        xref: "paper",
        x0: 0,
        x1: 1,
        y0: bandLo,
        y1: bandHi,
        fillcolor: COLORS.band,
        line: { width: 0 },
        layer: "below",
      },
      // Setpoint reference line at y = 1
      {
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        y0: 1,
        y1: 1,
        line: { color: COLORS.setpoint, width: 1.5, dash: "dash" },
      },
    ];

    const annotations: any[] = [];

    // Overshoot peak annotation
    if (showOvershoot) {
      annotations.push({
        x: peakT,
        y: peakVal,
        text: `Overshoot ${overshoot!.toFixed(1)}%`,
        showarrow: true,
        arrowhead: 3,
        arrowsize: 1,
        arrowwidth: 1,
        arrowcolor: COLORS.textMuted,
        ax: 36,
        ay: -34,
        font: { family: FONT_MONO, size: 10, color: COLORS.text },
        bgcolor: "rgba(255,255,255,0.85)",
        bordercolor: "rgba(15,23,42,0.08)",
        borderpad: 3,
      });
    }

    // Settling time vertical marker + label
    if (showSettling) {
      shapes.push({
        type: "line",
        x0: settlingTime,
        x1: settlingTime,
        yref: "paper",
        y0: 0,
        y1: 1,
        line: { color: COLORS.bandLine, width: 1, dash: "dot" },
      });
      annotations.push({
        x: settlingTime,
        yref: "paper",
        y: 0.06,
        yanchor: "bottom",
        text: `t_s = ${settlingTime!.toFixed(2)} s`,
        showarrow: false,
        font: { family: FONT_MONO, size: 10, color: COLORS.bandLine },
        bgcolor: "rgba(255,255,255,0.85)",
        borderpad: 2,
        xshift: 4,
        xanchor: "left",
      });
    }

    const layout = {
      font: { family: FONT_SANS, size: 12, color: COLORS.text },
      xaxis: {
        title: { text: "Time (s)", font: { size: 11, color: COLORS.textMuted } },
        gridcolor: COLORS.grid,
        zeroline: false,
        tickfont: { family: FONT_MONO, size: 11, color: COLORS.textMuted },
        showline: true,
        linecolor: COLORS.grid,
      },
      yaxis: {
        title: { text: "Output", font: { size: 11, color: COLORS.textMuted } },
        gridcolor: COLORS.grid,
        zeroline: false,
        tickfont: { family: FONT_MONO, size: 11, color: COLORS.textMuted },
        showline: true,
        linecolor: COLORS.grid,
      },
      shapes,
      annotations,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 52, r: 18, t: 16, b: 44 },
      showlegend: false,
      hovermode: "x unified",
      autosize: true,
      dragmode: "zoom",
    };

    return { data, layout };
  }, [t, y, overshoot, settlingTime, ss_error]);

  // Empty / unsimulable state
  if (!figure) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-300">
          no response
        </span>
        <span className="font-mono text-[10px] text-slate-300">
          system is improper or unstable
        </span>
      </div>
    );
  }

  return (
    <Plot
      data={figure.data as any}
      layout={figure.layout as any}
      config={{
        displayModeBar: false,
        responsive: true,
        doubleClick: "reset",
        scrollZoom: false,
      } as any}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
    />
  );
}
