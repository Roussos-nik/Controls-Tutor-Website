"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useSimulation } from "@/lib/controlsStore";

// Plotly touches `window` at import → load client-only.
const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300">
      loading plot…
    </div>
  ),
});

const COLORS = {
  mag: "#2563eb",        // blue-600 — magnitude curve
  phase: "#7c3aed",      // violet-600 — phase curve
  gainX: "#2563eb",      // gain crossover marker
  phaseX: "#dc2626",     // red-600 — phase crossover marker (the danger point)
  setpoint: "#94a3b8",   // 0 dB / -180° reference lines
  grid: "rgba(15,23,42,0.09)",
  text: "#475569",
  textMuted: "#64748b",  // slate-500 — WCAG AA safe at 11px
};

const FONT_SANS = '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';

// X-axis display window (rad/s), as requested.
const F_MIN = 0.01;
const F_MAX = 100;

// Interpolate (in log-frequency) the first frequency where `y` crosses `target`.
function findCrossing(
  omega: number[],
  y: number[],
  target: number
): number | null {
  for (let i = 0; i < y.length - 1; i++) {
    const d0 = y[i] - target;
    const d1 = y[i + 1] - target;
    if (d0 === 0 || (d0 < 0) !== (d1 < 0)) {
      const frac = d0 / (d0 - d1);
      const logF =
        Math.log10(omega[i]) +
        frac * (Math.log10(omega[i + 1]) - Math.log10(omega[i]));
      return Math.pow(10, logF);
    }
  }
  return null;
}

export default function BodePlot() {
  const sim = useSimulation();
  const { omega, mag, phase } = sim.freqResponse;
  const { GM, PM } = sim.metrics;

  const figure = useMemo(() => {
    if (!omega || omega.length === 0) return null;

    const gainXover = findCrossing(omega, mag, 0);      // |G| = 0 dB
    const phaseXover = findCrossing(omega, phase, -180); // ∠G = -180°

    const data = [
      // Magnitude → top subplot (xaxis/yaxis)
      {
        x: omega,
        y: mag,
        type: "scatter",
        mode: "lines",
        line: { color: COLORS.mag, width: 2 },
        xaxis: "x",
        yaxis: "y",
        hovertemplate: "ω = %{x:.3g} rad/s<br>|G| = %{y:.1f} dB<extra></extra>",
        showlegend: false,
      },
      // Phase → bottom subplot (xaxis2/yaxis2)
      {
        x: omega,
        y: phase,
        type: "scatter",
        mode: "lines",
        line: { color: COLORS.phase, width: 2 },
        xaxis: "x2",
        yaxis: "y2",
        hovertemplate: "ω = %{x:.3g} rad/s<br>∠G = %{y:.1f}°<extra></extra>",
        showlegend: false,
      },
    ];

    const shapes: any[] = [
      // 0 dB reference (magnitude subplot)
      {
        type: "line", xref: "paper", x0: 0, x1: 1,
        yref: "y", y0: 0, y1: 0,
        line: { color: COLORS.setpoint, width: 1, dash: "dot" },
      },
      // -180° reference (phase subplot)
      {
        type: "line", xref: "paper", x0: 0, x1: 1,
        yref: "y2", y0: -180, y1: -180,
        line: { color: COLORS.setpoint, width: 1, dash: "dot" },
      },
    ];

    const annotations: any[] = [];

    // Gain crossover — vertical dashed line through BOTH subplots + PM label
    if (gainXover !== null && gainXover >= F_MIN && gainXover <= F_MAX) {
      shapes.push(
        {
          type: "line", x0: gainXover, x1: gainXover,
          yref: "paper", y0: 0.56, y1: 1, // top subplot region
          line: { color: COLORS.gainX, width: 1, dash: "dash" },
        },
        {
          type: "line", x0: gainXover, x1: gainXover,
          yref: "paper", y0: 0, y1: 0.44, // bottom subplot region
          line: { color: COLORS.gainX, width: 1, dash: "dash" },
        }
      );
      if (PM !== null) {
        annotations.push({
          x: Math.log10(gainXover), // log axis → annotation x is log10
          xref: "x2",
          yref: "y2",
          y: -180,
          text: `PM = ${PM.toFixed(1)}°`,
          showarrow: false,
          font: { family: FONT_MONO, size: 10, color: COLORS.gainX },
          bgcolor: "rgba(255,255,255,0.85)",
          borderpad: 2,
          xanchor: "left",
          yanchor: "bottom",
          xshift: 5,
          yshift: 5,
        });
      }
    }

    // Phase crossover — vertical dashed line through BOTH subplots + GM label
    if (phaseXover !== null && phaseXover >= F_MIN && phaseXover <= F_MAX) {
      shapes.push(
        {
          type: "line", x0: phaseXover, x1: phaseXover,
          yref: "paper", y0: 0.56, y1: 1,
          line: { color: COLORS.phaseX, width: 1, dash: "dash" },
        },
        {
          type: "line", x0: phaseXover, x1: phaseXover,
          yref: "paper", y0: 0, y1: 0.44,
          line: { color: COLORS.phaseX, width: 1, dash: "dash" },
        }
      );
      if (GM !== null) {
        annotations.push({
          x: Math.log10(phaseXover),
          xref: "x",
          yref: "y",
          y: 0,
          text: `GM = ${GM.toFixed(1)} dB`,
          showarrow: false,
          font: { family: FONT_MONO, size: 10, color: COLORS.phaseX },
          bgcolor: "rgba(255,255,255,0.85)",
          borderpad: 2,
          xanchor: "left",
          yanchor: "bottom",
          xshift: 5,
          yshift: 5,
        });
      }
    }

    // Subplot axis titles via annotations (cleaner than per-axis with shared x)
    annotations.push(
      {
        text: "Magnitude (dB)", xref: "paper", yref: "paper",
        x: -0.13, y: 0.78, showarrow: false, textangle: -90,
        font: { family: FONT_SANS, size: 11, color: COLORS.textMuted },
      },
      {
        text: "Phase (deg)", xref: "paper", yref: "paper",
        x: -0.13, y: 0.22, showarrow: false, textangle: -90,
        font: { family: FONT_SANS, size: 11, color: COLORS.textMuted },
      }
    );

    const logAxis = {
      type: "log" as const,
      range: [Math.log10(F_MIN), Math.log10(F_MAX)],
      gridcolor: COLORS.grid,
      zeroline: false,
      tickfont: { family: FONT_MONO, size: 11, color: COLORS.textMuted },
      showline: true,
      linecolor: COLORS.grid,
    };

    const layout = {
      font: { family: FONT_SANS, size: 12, color: COLORS.text },
      // Top subplot (magnitude) occupies y 0.56–1.0
      xaxis: { ...logAxis, anchor: "y", matches: "x2", showticklabels: false },
      yaxis: {
        type: "log",
        domain: [0.56, 1.0],
        gridcolor: COLORS.grid,
        zeroline: false,
        tickfont: { family: FONT_MONO, size: 11, color: COLORS.textMuted },
        showline: true,
        linecolor: COLORS.grid,
      },
      // Bottom subplot (phase) occupies y 0.0–0.44
      xaxis2: {
        ...logAxis,
        anchor: "y2",
        title: { text: "Frequency (rad/s)", font: { size: 11, color: COLORS.textMuted } },
      },
      yaxis2: {
        domain: [0.0, 0.44],
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
      margin: { l: 72, r: 18, t: 14, b: 44 },
      hovermode: "x unified",
      autosize: true,
    };

    return { data, layout };
  }, [omega, mag, phase, GM, PM]);

  if (!figure) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-300">
          no frequency data
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
