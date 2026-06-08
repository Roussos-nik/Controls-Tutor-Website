"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSimulation } from "@/lib/controlsStore";
import { getSimStateForAI } from "@/lib/aiState";

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300">
      loading plot…
    </div>
  ),
});

const COLORS = {
  pole: "#dc2626",
  zero: "#2563eb",
  lhp: "rgba(16,185,129,0.06)",
  axis: "rgba(15,23,42,0.25)",
  grid: "rgba(15,23,42,0.09)",
  text: "#475569",
  textMuted: "#64748b",  // slate-500 — WCAG AA safe at 11px
};

const FONT_SANS = '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';

// Small stable hash for the client-side cache key.
function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

interface Popover {
  x: number;
  y: number;
  element: "pole" | "zero";
  real: number;
  imag: number;
  loading: boolean;
  text: string;
  error: boolean;
}

export default function PoleZeroPlot() {
  const sim = useSimulation();
  const { poles, zeros } = sim;

  const [popover, setPopover] = useState<Popover | null>(null);
  const cache = useRef<Map<string, string>>(new Map());

  // Close popover on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPopover(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function openExplain(
    element: "pole" | "zero", real: number, imag: number, x: number, y: number
  ) {
    const simState = getSimStateForAI();
    const key =
      `${element}|${real.toFixed(3)},${imag.toFixed(3)}|` +
      hash(JSON.stringify(simState));

    // Clamp popover into the viewport. The card is ~256px wide; height varies
    // with the text, so we reserve a generous estimate and also keep a margin.
    const CARD_W = 256;
    const CARD_H = 200;
    const MARGIN = 12;
    const px = Math.max(MARGIN, Math.min(x + 8, window.innerWidth - CARD_W - MARGIN));
    // Center the card vertically on the click point (midpoint on the cursor),
    // then clamp so it can't run off the top or bottom of the screen.
    const py = Math.max(
      MARGIN,
      Math.min(y - CARD_H / 2, window.innerHeight - CARD_H - MARGIN)
    );

    // Client cache hit → no network call.
    const hit = cache.current.get(key);
    if (hit) {
      setPopover({ x: px, y: py, element, real, imag, loading: false, text: hit, error: false });
      return;
    }

    setPopover({ x: px, y: py, element, real, imag, loading: true, text: "", error: false });
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ element, value: { real, imag }, simState }),
      });
      if (!res.ok) throw new Error(`server ${res.status}`);
      const data = await res.json();
      cache.current.set(key, data.explanation);
      setPopover((p) =>
        p && p.real === real && p.imag === imag
          ? { ...p, loading: false, text: data.explanation }
          : p
      );
    } catch {
      setPopover((p) =>
        p && p.real === real && p.imag === imag ? { ...p, loading: false, error: true } : p
      );
    }
  }

  function handlePlotClick(evData: any) {
    const pt = evData?.points?.[0];
    if (!pt) return;
    const name = pt.data?.name;
    if (name !== "Poles" && name !== "Zeros") return;
    const element = name === "Poles" ? "pole" : "zero";
    const mouse = evData.event;
    openExplain(
      element, pt.x, pt.y,
      mouse?.clientX ?? window.innerWidth / 2,
      mouse?.clientY ?? window.innerHeight / 2
    );
  }

  const figure = useMemo(() => {
    if (!poles) return null;

    const all = [...poles, ...zeros];
    const sortedRe = all.map((p) => Math.abs(p.re)).sort((a, b) => a - b);
    const sortedIm = all.map((p) => Math.abs(p.im)).sort((a, b) => a - b);
    const pick = (arr: number[]) =>
      arr.length ? arr[Math.min(arr.length - 1, Math.ceil(arr.length * 0.75))] : 1;

    let extent = Math.max(pick(sortedRe), pick(sortedIm), 1) * 1.4;
    const nice = Math.pow(10, Math.floor(Math.log10(extent)));
    extent = Math.ceil(extent / nice) * nice;
    const range: [number, number] = [-extent, extent];

    const polesOutCount = poles.filter(
      (p) => Math.abs(p.re) > extent || Math.abs(p.im) > extent
    ).length;

    const data: any[] = [
      {
        x: poles.map((p) => p.re),
        y: poles.map((p) => p.im),
        type: "scatter", mode: "markers", name: "Poles",
        marker: { symbol: "x-thin", size: 11, color: COLORS.pole, line: { width: 2.5, color: COLORS.pole } },
        hovertemplate: "pole<br>%{x:.3f} %{customdata}<br><i>click to explain</i><extra></extra>",
        customdata: poles.map((p) => (p.im >= 0 ? `+ ${p.im.toFixed(3)}j` : `- ${Math.abs(p.im).toFixed(3)}j`)),
      },
      {
        x: zeros.map((z) => z.re),
        y: zeros.map((z) => z.im),
        type: "scatter", mode: "markers", name: "Zeros",
        marker: { symbol: "circle-open", size: 11, color: COLORS.zero, line: { width: 2, color: COLORS.zero } },
        hovertemplate: "zero<br>%{x:.3f} %{customdata}<br><i>click to explain</i><extra></extra>",
        customdata: zeros.map((z) => (z.im >= 0 ? `+ ${z.im.toFixed(3)}j` : `- ${Math.abs(z.im).toFixed(3)}j`)),
      },
    ];

    const shapes: any[] = [
      { type: "rect", xref: "x", yref: "paper", x0: range[0], x1: 0, y0: 0, y1: 1, fillcolor: COLORS.lhp, line: { width: 0 }, layer: "below" },
      { type: "line", xref: "x", yref: "paper", x0: 0, x1: 0, y0: 0, y1: 1, line: { color: COLORS.axis, width: 1.5 } },
      { type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: 0, y1: 0, line: { color: COLORS.axis, width: 1 } },
    ];

    const annotations: any[] = [
      { x: range[0] * 0.92, y: range[1] * 0.9, text: "stable (LHP)", showarrow: false, font: { family: FONT_MONO, size: 9, color: "rgba(16,185,129,0.7)" }, xanchor: "left" },
    ];
    if (polesOutCount > 0) {
      annotations.push({ x: range[1] * 0.96, y: range[0] * 0.9, text: `+${polesOutCount} pole${polesOutCount > 1 ? "s" : ""} off-view`, showarrow: false, font: { family: FONT_MONO, size: 9, color: COLORS.textMuted }, xanchor: "right" });
    }

    const axisCommon = {
      range, gridcolor: COLORS.grid, zeroline: false,
      tickfont: { family: FONT_MONO, size: 11, color: COLORS.textMuted },
      showline: true, linecolor: COLORS.grid,
    };

    const layout = {
      font: { family: FONT_SANS, size: 12, color: COLORS.text },
      xaxis: { ...axisCommon, title: { text: "Real", font: { size: 11, color: COLORS.textMuted } } },
      yaxis: { ...axisCommon, title: { text: "Imaginary", font: { size: 11, color: COLORS.textMuted } }, scaleanchor: "x", scaleratio: 1 },
      shapes, annotations,
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 52, r: 18, t: 14, b: 44 },
      showlegend: true,
      legend: { orientation: "h", x: 1, xanchor: "right", y: 1.02, yanchor: "bottom", font: { family: FONT_MONO, size: 10, color: COLORS.text } },
      hovermode: "closest",
      autosize: true,
    };

    return { data, layout };
  }, [poles, zeros]);

  if (!figure) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300">
        no data
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <Plot
        data={figure.data as any}
        layout={figure.layout as any}
        config={{ displayModeBar: false, responsive: true, doubleClick: "reset", scrollZoom: false } as any}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
        onClick={handlePlotClick}
      />

      {popover && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setPopover(null)} />
          {/* popover card */}
          <div
            className="fixed z-50 w-64 max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
            style={{ left: popover.x, top: popover.y }}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-400">
                {popover.element} at {popover.real.toFixed(2)}
                {popover.imag >= 0 ? "+" : "−"}
                {Math.abs(popover.imag).toFixed(2)}j
              </span>
              <button
                onClick={() => setPopover(null)}
                className="text-slate-300 hover:text-slate-500"
                aria-label="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {popover.loading ? (
              <div className="flex items-center gap-1 py-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            ) : popover.error ? (
              <span className="text-[12px] text-red-500">Couldn&apos;t load an explanation.</span>
            ) : (
              <p className="text-[12px] leading-relaxed text-slate-600">{popover.text}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
