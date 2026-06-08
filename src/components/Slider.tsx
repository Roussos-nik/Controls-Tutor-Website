"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Slider — custom pointer-drag control with two-tier state:
//   • local state updates INSTANTLY on drag (thumb + number feel responsive)
//   • onCommit fires DEBOUNCED (default 30ms) so the expensive store recompute
//     runs at most ~once per frame, not on every pixel of movement.
// On pointer-up the debounce is flushed so the final position always lands.
// Keyboard-accessible (arrows / home / end) and touch-friendly.
// ─────────────────────────────────────────────────────────────────────────────

interface SliderProps {
  label: string;
  value: number;        // authoritative value from the store
  min: number;
  max: number;
  step?: number;
  unit?: string;
  debounceMs?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit,
  debounceMs = 30,
  disabled = false,
  onCommit,
}: SliderProps) {
  const [local, setLocal] = useState(value);
  const dragging = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Number of decimals implied by the step, for clean value display.
  const decimals = (String(step).split(".")[1] || "").length;

  // Sync from external changes (e.g. switching plant type resets params),
  // but never while the user is actively dragging this slider.
  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);

  const clampSnap = useCallback(
    (v: number) => {
      const snapped = Math.round((v - min) / step) * step + min;
      return Math.min(max, Math.max(min, snapped));
    },
    [min, max, step]
  );

  const scheduleCommit = useCallback(
    (v: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onCommit(v), debounceMs);
    },
    [onCommit, debounceMs]
  );

  const flushCommit = useCallback(
    (v: number) => {
      if (timer.current) clearTimeout(timer.current);
      onCommit(v);
    },
    [onCommit]
  );

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current!.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      return clampSnap(min + frac * (max - min));
    },
    [clampSnap, min, max]
  );

  // Clean up any pending timer on unmount.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const v = valueFromClientX(e.clientX);
    setLocal(v);
    scheduleCommit(v);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const v = valueFromClientX(e.clientX);
    setLocal(v);
    scheduleCommit(v);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const v = valueFromClientX(e.clientX);
    setLocal(v);
    flushCommit(v); // ensure the final position is committed immediately
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    let v = local;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp": v = clampSnap(local + step); break;
      case "ArrowLeft":
      case "ArrowDown": v = clampSnap(local - step); break;
      case "Home": v = min; break;
      case "End": v = max; break;
      default: return;
    }
    e.preventDefault();
    setLocal(v);
    flushCommit(v);
  };

  const pct = ((local - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-slate-500">
          {label}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-slate-600">
          {local.toFixed(decimals)}
          {unit && <span className="ml-0.5 text-slate-400">{unit}</span>}
        </span>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`relative flex h-5 touch-none select-none items-center ${disabled ? "pointer-events-none opacity-40" : "cursor-pointer"}`}
      >
        {/* track */}
        <div className="h-1 w-full rounded-full bg-slate-200">
          {/* filled portion */}
          <div
            className="h-full rounded-full bg-blue-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* thumb */}
        <div
          role="slider"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={local}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={onKeyDown}
          className="absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full border border-slate-300 bg-white shadow-sm outline-none transition-shadow hover:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-400"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// Small styled native dropdown used by both control panels.
export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        disabled={disabled}
        className="w-full cursor-pointer appearance-none rounded-md border border-slate-200 bg-white px-3 py-2 pr-8 text-[13px] font-medium text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        width="12" height="12" viewBox="0 0 12 12" fill="none"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
      >
        <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
