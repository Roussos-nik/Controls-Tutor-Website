import { TransferFunction } from "./TransferFunction";
import { frequencyResponse, logspace } from "./FrequencyResponse";
import { stabilityMargins } from "./StabilityMargins";

// Dense grid so interpolated crossings are accurate
const omega = logspace(-3, 4, 5000);

function marginsOf(tf: TransferFunction) {
  return stabilityMargins(frequencyResponse(tf, omega));
}

// ─── Integrator 1/s — the clean reference case ────────────────────────────────

describe("stabilityMargins() — G = 1/s", () => {
  const m = marginsOf(new TransferFunction([1], [1, 0]));

  test("gain crossover at ω=1 (|1/jω|=1/ω=1)", () => {
    expect(m.gainCrossoverFreq).not.toBeNull();
    expect(Math.abs(m.gainCrossoverFreq! - 1)).toBeLessThan(0.01);
  });

  test("phase crossover is null (phase = -90° always, never -180°)", () => {
    expect(m.phaseCrossoverFreq).toBeNull();
  });

  test("gain margin is null (infinite — phase never reaches -180°)", () => {
    expect(m.gainMargin).toBeNull();
  });

  test("phase margin = 90° (180 + (-90))", () => {
    expect(m.phaseMargin).not.toBeNull();
    expect(Math.abs(m.phaseMargin! - 90)).toBeLessThan(0.1);
  });

  test("closed-loop bandwidth ≈ 1 rad/s (T=1/(s+1), -3dB at ω=1)", () => {
    expect(m.bandwidth).not.toBeNull();
    expect(Math.abs(m.bandwidth! - 1)).toBeLessThan(0.01);
  });
});

// ─── Third order with finite gain margin ──────────────────────────────────────

describe("stabilityMargins() — G = 1/(s(s+1)(s+2))", () => {
  // Phase reaches -180° at ω=√2; |G(j√2)| = 1/(√2·√3·√6) = 1/6
  const tf = new TransferFunction([1], [1, 0])
    .series(new TransferFunction([1], [1, 1]))
    .series(new TransferFunction([1], [1, 2]));
  const m = marginsOf(tf);

  test("phase crossover at ω = √2 ≈ 1.414", () => {
    expect(m.phaseCrossoverFreq).not.toBeNull();
    expect(Math.abs(m.phaseCrossoverFreq! - Math.SQRT2)).toBeLessThan(0.01);
  });

  test("gain margin = 20·log10(6) ≈ 15.56 dB", () => {
    // At ω=√2, |G|=1/6, so GM = -20log10(1/6) = 20log10(6)
    expect(m.gainMargin).not.toBeNull();
    expect(Math.abs(m.gainMargin! - 20 * Math.log10(6))).toBeLessThan(0.05);
  });

  test("gain margin is positive (system is stable closed-loop)", () => {
    expect(m.gainMargin!).toBeGreaterThan(0);
  });

  test("phase margin exists and is positive", () => {
    expect(m.phaseMargin).not.toBeNull();
    expect(m.phaseMargin!).toBeGreaterThan(0);
  });

  test("gain crossover is below phase crossover (stable system)", () => {
    // For a stable system, ω_gc < ω_pc
    expect(m.gainCrossoverFreq!).toBeLessThan(m.phaseCrossoverFreq!);
  });
});

// ─── Edge case: |G| < 1 everywhere → no gain crossover ────────────────────────

describe("stabilityMargins() — G = 0.1/(s+1) (low gain)", () => {
  const m = marginsOf(new TransferFunction([0.1], [1, 1]));

  test("gain crossover is null (magnitude never reaches 0 dB)", () => {
    expect(m.gainCrossoverFreq).toBeNull();
  });

  test("phase margin is null (no gain crossover to measure at)", () => {
    expect(m.phaseMargin).toBeNull();
  });

  test("phase crossover is null (first-order phase max -90°)", () => {
    expect(m.phaseCrossoverFreq).toBeNull();
  });

  test("gain margin is null (no phase crossover)", () => {
    expect(m.gainMargin).toBeNull();
  });
});

// ─── Edge case: first-order never crosses -180° ───────────────────────────────

describe("stabilityMargins() — G = 10/(s+1) (high gain, 1st order)", () => {
  const m = marginsOf(new TransferFunction([10], [1, 1]));

  test("gain crossover exists (|G| starts at 10, crosses 0 dB)", () => {
    // |G|=1 when 10/√(1+ω²)=1 → ω=√99 ≈ 9.95
    expect(m.gainCrossoverFreq).not.toBeNull();
    expect(Math.abs(m.gainCrossoverFreq! - Math.sqrt(99))).toBeLessThan(0.1);
  });

  test("phase crossover null, gain margin null (1st order can't reach -180°)", () => {
    expect(m.phaseCrossoverFreq).toBeNull();
    expect(m.gainMargin).toBeNull();
  });

  test("phase margin exists and is positive (always stable, 1st order)", () => {
    expect(m.phaseMargin).not.toBeNull();
    expect(m.phaseMargin!).toBeGreaterThan(0);
  });
});

// ─── Bandwidth on a second-order closed loop ──────────────────────────────────

describe("stabilityMargins() — bandwidth of G = 1/(s(s+1))", () => {
  // Closed loop T = 1/(s²+s+1), wn=1, ζ=0.5
  // Bandwidth for this T is ≈ 1.272 rad/s (standard 2nd-order formula)
  const tf = new TransferFunction([1], [1, 0]).series(
    new TransferFunction([1], [1, 1])
  );
  const m = marginsOf(tf);

  test("bandwidth exists and is in a sensible range", () => {
    expect(m.bandwidth).not.toBeNull();
    // wn=1, ζ=0.5 → ω_bw = wn·√(1-2ζ²+√(2-4ζ²+4ζ⁴)) ≈ 1.272
    expect(Math.abs(m.bandwidth! - 1.272)).toBeLessThan(0.05);
  });

  test("phase margin matches known result (~51.8° for this loop)", () => {
    // Classic textbook value for 1/(s(s+1)): PM ≈ 51.8° at ω_gc ≈ 0.786
    expect(m.phaseMargin).not.toBeNull();
    expect(Math.abs(m.phaseMargin! - 51.8)).toBeLessThan(1);
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe("stabilityMargins() — return shape", () => {
  test("returns all five keys, never throws on edge cases", () => {
    const m = marginsOf(new TransferFunction([1], [1, 1]));
    expect(m).toHaveProperty("gainCrossoverFreq");
    expect(m).toHaveProperty("phaseCrossoverFreq");
    expect(m).toHaveProperty("gainMargin");
    expect(m).toHaveProperty("phaseMargin");
    expect(m).toHaveProperty("bandwidth");
  });
});
