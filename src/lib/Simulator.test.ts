import { complex } from "mathjs";
import { TransferFunction } from "./TransferFunction";
import { toStateSpace, simulate } from "./Simulator";

const TOLA = 1e-4;   // integration accuracy
const TOLB = 1e-10;  // structural checks

function linspace(start: number, end: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => start + (i / (n - 1)) * (end - start));
}

const step: (t: number) => number = () => 1;

// ─── toStateSpace ─────────────────────────────────────────────────────────────

describe("toStateSpace()", () => {
  test("1/(s+1): A=[-1], B=[[1]], C=[[1]], D=[[0]]", () => {
    const ss = toStateSpace(new TransferFunction([1], [1, 1]));
    expect(ss.n).toBe(1);
    expect(ss.A).toEqual([[-1]]);
    expect(ss.B).toEqual([[1]]);
    expect(ss.C).toEqual([[1]]);
    expect(ss.D).toEqual([[0]]);
  });

  test("1/(s²+3s+2): correct 2×2 A, B=[0,1]^T, C=[1,0]", () => {
    // den monic: s²+3s+2 → a1=3, a2=2
    // A = [[0,1],[-2,-3]], C = [1,0] (num=[1] → padded [0,1] → reversed [1,0])
    const ss = toStateSpace(new TransferFunction([1], [1, 3, 2]));
    expect(ss.n).toBe(2);
    expect(ss.A[0]).toEqual([0, 1]);
    expect(ss.A[1][0]).toBeCloseTo(-2, 10);
    expect(ss.A[1][1]).toBeCloseTo(-3, 10);
    expect(ss.B).toEqual([[0], [1]]);
    expect(ss.C[0][0]).toBeCloseTo(1, 10);
    expect(ss.C[0][1]).toBeCloseTo(0, 10);
  });

  test("4/(s²+2s+4): C=[4,0] — constant term of num maps to x1", () => {
    // num padded: [0,4] → reversed: [4,0]
    const ss = toStateSpace(new TransferFunction([4], [1, 2, 4]));
    expect(ss.C[0][0]).toBeCloseTo(4, 10);
    expect(ss.C[0][1]).toBeCloseTo(0, 10);
  });

  test("throws on improper TF (deg num >= deg den)", () => {
    expect(() =>
      toStateSpace(new TransferFunction([1, 1], [1, 1]))
    ).toThrow();
  });

  test("throws on order-0 TF", () => {
    expect(() =>
      toStateSpace(new TransferFunction([1], [1]))
    ).toThrow();
  });
});

// ─── 1st order step response ──────────────────────────────────────────────────

describe("simulate() — 1/(s+1) step response", () => {
  const tf = new TransferFunction([1], [1, 1]);
  const t = linspace(0, 5, 501);   // dt = 0.01
  const y = simulate(tf, step, t);

  test("y(0) = 0 (zero initial conditions)", () => {
    expect(Math.abs(y[0])).toBeLessThan(TOLB);
  });

  test("y(1) ≈ 0.6321 — one time constant (1 - 1/e)", () => {
    // t[100] = 1.0 with linspace(0,5,501)
    expect(Math.abs(y[100] - (1 - Math.exp(-1)))).toBeLessThan(TOLA);
  });

  test("y(5) = 1 - e^{-5} ≈ 0.9933 — not fully settled, exact value", () => {
    // Common mistake: asserting y≈1. It's actually 0.9933. Test the exact value.
    expect(Math.abs(y[500] - (1 - Math.exp(-5)))).toBeLessThan(TOLA);
  });

  test("output is monotonically increasing (no overshoot for 1st order)", () => {
    for (let i = 1; i < y.length; i++) {
      expect(y[i]).toBeGreaterThanOrEqual(y[i - 1] - 1e-10);
    }
  });

  test("matches exact y = 1 - e^{-t} at every point", () => {
    const maxErr = Math.max(...t.map((ti, i) => Math.abs(y[i] - (1 - Math.exp(-ti)))));
    expect(maxErr).toBeLessThan(TOLA);
  });
});

// ─── 2nd order underdamped ────────────────────────────────────────────────────

describe("simulate() — second-order underdamped step response", () => {
  // H(s) = wn² / (s² + 2ζwn·s + wn²), ζ=0.5, wn=2
  // Poles at -1 ± j√3, DC gain = 1
  const wn = 2, zeta = 0.5;
  const tf = new TransferFunction([wn * wn], [1, 2 * zeta * wn, wn * wn]);
  const t = linspace(0, 10, 10001);  // dt = 0.001 — tight for oscillatory
  const y = simulate(tf, step, t);

  test("y(0) = 0", () => {
    expect(Math.abs(y[0])).toBeLessThan(TOLB);
  });

  test("DC gain = 1 (output settles near 1 at t=10)", () => {
    expect(Math.abs(y[y.length - 1] - 1)).toBeLessThan(0.001);
  });

  test("overshoots 1 (underdamped system must overshoot)", () => {
    expect(Math.max(...y)).toBeGreaterThan(1.0);
  });

  test("peak overshoot matches theoretical e^{-πζ/√(1-ζ²)}", () => {
    // For ζ=0.5: overshoot = e^{-π/√3} ≈ 0.1631 → peak ≈ 1.1631
    const theoretical = Math.exp(-Math.PI * zeta / Math.sqrt(1 - zeta ** 2));
    const peak = Math.max(...y);
    expect(Math.abs(peak - (1 + theoretical))).toBeLessThan(0.001);
  });
});

// ─── Sinusoidal steady-state ──────────────────────────────────────────────────

describe("simulate() — sinusoidal steady-state", () => {
  test("1/(s+1) at ω=1: steady-state amplitude = 1/√2 ≈ 0.707", () => {
    // |H(j1)| = 1/|j+1| = 1/√2
    const tf = new TransferFunction([1], [1, 1]);
    const omega = 1;
    const t = linspace(0, 20, 4001);  // dt = 0.005, run long for transient to decay
    const y = simulate(tf, (t) => Math.sin(omega * t), t);

    // Measure amplitude in last cycle
    const lastCycleStart = t.findIndex(ti => ti >= 20 - 2 * Math.PI / omega);
    const amplitude = Math.max(...y.slice(lastCycleStart).map(Math.abs));
    expect(Math.abs(amplitude - 1 / Math.sqrt(2))).toBeLessThan(0.005);
  });
});

// ─── Series connection ────────────────────────────────────────────────────────

describe("simulate() — series TF", () => {
  test("1/s · 1/(s+1) step response = t - 1 + e^{-t}", () => {
    // H(s) = 1/(s(s+1))
    // Step response exact: y(t) = t - 1 + e^{-t}
    const tf = new TransferFunction([1], [1, 0]).series(
      new TransferFunction([1], [1, 1])
    );
    const t = linspace(0, 3, 3001);  // dt = 0.001
    const y = simulate(tf, step, t);

    const exact = (ti: number) => ti - 1 + Math.exp(-ti);
    const maxErr = Math.max(...t.map((ti, i) => Math.abs(y[i] - exact(ti))));
    expect(maxErr).toBeLessThan(TOLA);
  });
});
