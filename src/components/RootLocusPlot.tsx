"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { TransferFunction } from "@/lib/TransferFunction";
import {
  useControlsStore,
  buildPlant,
  buildController,
} from "@/lib/controlsStore";

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300">
      loading plot…
    </div>
  ),
});

const BRANCH_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2",
];

const COLORS = {
  lhp: "rgba(16,185,129,0.06)",
  axis: "rgba(15,23,42,0.25)",
  grid: "rgba(15,23,42,0.09)",
  text: "#475569",
  textMuted: "#64748b",  // slate-500 — WCAG AA safe at 11px
  current: "#0f172a",
};

const FONT_SANS = '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';

const UNITY = new TransferFunction([1], [1]);
const STEPS = 160;

interface Pt { re: number; im: number; }

export default function RootLocusPlot() {
  const plantConfig = useControlsStore((s) => s.plantConfig);
  const controllerConfig = useControlsStore((s) => s.controllerConfig);

  const figure = useMemo(() => {
    // Which gain do we sweep? Kp for PID, K for lead/lag.
    const gainKey = controllerConfig.type === "pid" ? "Kp" : "K";
    const params = controllerConfig.params as Record<string, number>;
    const currentGain = params[gainKey];
    const maxGain = currentGain > 0 ? currentGain * 10 : 10;

    const plant = buildPlant(plantConfig);

    // ── Sweep gain 0 → maxGain, collect closed-loop poles at each step ──────
    let branches: Pt[][] | null = null;
    const gains: number[] = [];

    for (let i = 0; i < STEPS; i++) {
      const g = maxGain * (i / (STEPS - 1));
      gains.push(g);

      let P: Pt[];
      try {
        const ctrl = buildController({
          ...controllerConfig,
          params: { ...params, [gainKey]: g },
        } as typeof controllerConfig);
        const closed = ctrl.series(plant).feedback(UNITY);
        P = closed.poles().map((p) => ({ re: p.re, im: p.im }));
      } catch {
        continue; // skip a degenerate step (e.g. all-zero controller at g=0)
      }

      if (!branches) {
        branches = P.map((p) => [p]);
        continue;
      }
      // Greedy nearest-neighbour: extend each branch with its closest new pole.
      if (P.length === branches.length) {
        const used = new Array(P.length).fill(false);
        for (const br of branches) {
          const last = br[br.length - 1];
          let best = -1, bestD = Infinity;
          for (let j = 0; j < P.length; j++) {
            if (used[j]) continue;
            const d = (P[j].re - last.re) ** 2 + (P[j].im - last.im) ** 2;
            if (d < bestD) { bestD = d; best = j; }
          }
          if (best >= 0) { br.push(P[best]); used[best] = true; }
        }
      }
    }

    if (!branches || branches.length === 0) return null;

    // ── Smart square range focused on the dominant features ─────────────────
    const allPts = branches.flat();
    const sortedRe = allPts.map((p) => Math.abs(p.re)).sort((a, b) => a - b);
    const sortedIm = allPts.map((p) => Math.abs(p.im)).sort((a, b) => a - b);
    const pick = (arr: number[]) =>
      arr.length ? arr[Math.min(arr.length - 1, Math.ceil(arr.length * 0.8))] : 1;
    let extent = Math.max(pick(sortedRe), pick(sortedIm), 1) * 1.4;
    const nice = Math.pow(10, Math.floor(Math.log10(extent)));
    extent = Math.ceil(extent / nice) * nice;
    const range: [number, number] = [-extent, extent];

    // ── Build traces ────────────────────────────────────────────────────────
    const data: any[] = [];

    // One coloured line per branch (the locus paths)
    branches.forEach((br, i) => {
      data.push({
        x: br.map((p) => p.re),
        y: br.map((p) => p.im),
        type: "scatter",
        mode: "lines",
        line: { color: BRANCH_COLORS[i % BRANCH_COLORS.length], width: 1.5 },
        showlegend: false,
        hoverinfo: "skip",
      });
    });

    // Start markers (gain = 0) — hollow circles
    data.push({
      x: branches.map((br) => br[0].re),
      y: branches.map((br) => br[0].im),
      type: "scatter", mode: "markers",
      name: `${gainKey} = 0`,
      marker: { symbol: "circle-open", size: 9, color: COLORS.textMuted, line: { width: 1.5 } },
      hovertemplate: `${gainKey}=0<br>%{x:.2f}, %{y:.2f}j<extra></extra>`,
    });

    // End markers (gain = max) — X
    data.push({
      x: branches.map((br) => br[br.length - 1].re),
      y: branches.map((br) => br[br.length - 1].im),
      type: "scatter", mode: "markers",
      name: `${gainKey} = ${maxGain.toFixed(1)}`,
      marker: { symbol: "x-thin", size: 9, color: COLORS.textMuted, line: { width: 2 } },
      hovertemplate: `${gainKey}=${maxGain.toFixed(1)}<br>%{x:.2f}, %{y:.2f}j<extra></extra>`,
    });

    // Current-gain markers — filled diamonds at the present operating point.
    // The current gain sits at fraction (currentGain/maxGain) along the sweep.
    const curIdx = Math.round((currentGain / maxGain) * (STEPS - 1));
    const idx = Math.max(0, Math.min(STEPS - 1, curIdx));
    data.push({
      x: branches.map((br) => br[Math.min(idx, br.length - 1)].re),
      y: branches.map((br) => br[Math.min(idx, br.length - 1)].im),
      type: "scatter", mode: "markers",
      name: `current ${gainKey} = ${currentGain.toFixed(2)}`,
      marker: { symbol: "diamond", size: 9, color: COLORS.current },
      hovertemplate: `current<br>%{x:.2f}, %{y:.2f}j<extra></extra>`,
    });

    const shapes: any[] = [
      { type: "rect", xref: "x", yref: "paper", x0: range[0], x1: 0, y0: 0, y1: 1, fillcolor: COLORS.lhp, line: { width: 0 }, layer: "below" },
      { type: "line", xref: "x", yref: "paper", x0: 0, x1: 0, y0: 0, y1: 1, line: { color: COLORS.axis, width: 1.5 } },
      { type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: 0, y1: 0, line: { color: COLORS.axis, width: 1 } },
    ];

    const axisCommon = {
      range,
      gridcolor: COLORS.grid,
      zeroline: false,
      tickfont: { family: FONT_MONO, size: 11, color: COLORS.textMuted },
      showline: true,
      linecolor: COLORS.grid,
    };

    const layout = {
      font: { family: FONT_SANS, size: 12, color: COLORS.text },
      xaxis: { ...axisCommon, title: { text: "Real", font: { size: 11, color: COLORS.textMuted } } },
      yaxis: {
        ...axisCommon,
        title: { text: "Imaginary", font: { size: 11, color: COLORS.textMuted } },
        scaleanchor: "x", scaleratio: 1,
      },
      shapes,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 52, r: 18, t: 14, b: 44 },
      showlegend: true,
      legend: {
        orientation: "h", x: 0.5, xanchor: "center", y: 1.04, yanchor: "bottom",
        font: { family: FONT_MONO, size: 9, color: COLORS.text },
      },
      hovermode: "closest",
      autosize: true,
    };

    return { data, layout };
  }, [plantConfig, controllerConfig]);

  if (!figure) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300">
        no locus
      </div>
    );
  }

  return (
    <Plot
      data={figure.data as any}
      layout={figure.layout as any}
      config={{ displayModeBar: false, responsive: true, doubleClick: "reset", scrollZoom: false } as any}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
    />
  );
}
