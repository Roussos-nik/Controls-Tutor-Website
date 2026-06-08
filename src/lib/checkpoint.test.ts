// ─────────────────────────────────────────────────────────────────────────────
// checkpoint.test.ts — Phase 1 integration test.
// Proves the full pipeline composes: plant → controller → series → feedback →
// simulate, producing a sensible step response. This is the gate to Phase 2.
//
// Uses the built API directly (no helpers wrapper):
//   controller.series(plant) , loop.feedback(sensorTF) , PID({...})
// ─────────────────────────────────────────────────────────────────────────────

import { TransferFunction } from "./TransferFunction";
import { dcMotor, massSpringDamper } from "./plants";
import { PID, leadLag } from "./controllers";
import { simulate } from "./Simulator";
import { frequencyResponse, logspace } from "./FrequencyResponse";
import { stabilityMargins } from "./StabilityMargins";

// Unity feedback sensor: H(s) = 1
const UNITY = new TransferFunction([1], [1]);

// Local time-vector builder (0 to end, exclusive, fixed step) — no drift.
function timeVector(end: number, step: number): number[] {
  const n = Math.round(end / step);
  return Array.from({ length: n }, (_, i) => i * step);
}

describe("PHASE 1 CHECKPOINT — DC motor + PID closed-loop step", () => {
  const plant = dcMotor();
  const controller = PID({ Kp: 2, Ki: 1, Kd: 0.5 });
  const loop = controller.series(plant);
  const closed = loop.feedback(UNITY);
  const t = timeVector(10, 0.01);            // 1000 points, 0 → 9.99
  const y = simulate(closed, () => 1, t);

  test("time vector has 1000 points", () => {
    expect(t).toHaveLength(1000);
    expect(t[0]).toBeCloseTo(0, 12);
    expect(t[999]).toBeCloseTo(9.99, 6);
  });

  test("simulation returns an array matching the time vector length", () => {
    expect(y).toHaveLength(t.length);
  });

  test("every output sample is finite (no NaN/Inf blow-up)", () => {
    expect(y.every(v => Number.isFinite(v))).toBe(true);
  });

  test("starts from rest: y(0) = 0", () => {
    expect(Math.abs(y[0])).toBeLessThan(1e-9);
  });

  test("closed loop is stable (all poles in left-half plane)", () => {
    expect(closed.poles().every(p => p.re < 0)).toBe(true);
  });

  test("zero steady-state error: settles to 1.0 (integral action)", () => {
    expect(closed.dcGain()).toBeCloseTo(1, 6);
    expect(Math.abs(y[y.length - 1] - 1)).toBeLessThan(0.01);
  });

  test("response overshoots then settles (under-damped but bounded)", () => {
    const peak = Math.max(...y);
    expect(peak).toBeGreaterThan(1.0);
    expect(peak).toBeLessThan(2.0);
  });

  test("output is bounded throughout (BIBO stable response)", () => {
    expect(y.every(v => Math.abs(v) < 5)).toBe(true);
  });
});

describe("PHASE 1 CHECKPOINT — analysis tools run on the loop", () => {
  const plant = dcMotor();
  const controller = PID({ Kp: 2, Ki: 1, Kd: 0.5 });
  const openLoop = controller.series(plant);

  test("frequencyResponse runs on the open loop and returns matching arrays", () => {
    const omega = logspace(-2, 3, 500);
    const fr = frequencyResponse(openLoop, omega);
    expect(fr.magnitude).toHaveLength(omega.length);
    expect(fr.phase).toHaveLength(omega.length);
    expect(fr.magnitude.every(v => Number.isFinite(v) || v === -Infinity)).toBe(true);
  });

  test("stabilityMargins returns the expected shape", () => {
    const omega = logspace(-2, 3, 2000);
    const m = stabilityMargins(frequencyResponse(openLoop, omega));
    expect(m).toHaveProperty("gainCrossoverFreq");
    expect(m).toHaveProperty("phaseMargin");
    expect(typeof m.phaseMargin === "number" || m.phaseMargin === null).toBe(true);
  });
});

describe("PHASE 1 CHECKPOINT — second plant + lead compensator", () => {
  // Sanity that the API is general, not hard-wired to one example.
  const plant = massSpringDamper();
  const comp = leadLag({ K: 5, z: 1, p: 10 });    // lead network
  const closed = comp.series(plant).feedback(UNITY);
  const t = timeVector(20, 0.01);
  const y = simulate(closed, () => 1, t);

  test("mass-spring-damper + lead closed loop is stable and finite", () => {
    expect(closed.poles().every(p => p.re < 0)).toBe(true);
    expect(y.every(v => Number.isFinite(v))).toBe(true);
  });

  test("reaches a bounded steady state", () => {
    const tail = y.slice(-100);
    const spread = Math.max(...tail) - Math.min(...tail);
    expect(spread).toBeLessThan(0.01);
  });
});
