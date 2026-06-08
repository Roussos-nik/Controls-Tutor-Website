import { TransferFunction } from "./TransferFunction";
import { frequencyResponse, logspace } from "./FrequencyResponse";

const TOL_DB  = 0.001;   // dB — tight, this is exact arithmetic not integration
const TOL_DEG = 0.001;   // degrees

// ─── 1/(s+1) — the canonical first-order Bode check ─────────────────────────

describe("frequencyResponse() — 1/(s+1)", () => {
  const tf = new TransferFunction([1], [1, 1]);

  test("ω=1: magnitude = -3.0103 dB (the -3dB point)", () => {
    // |H(j1)| = 1/|1+j| = 1/√2  →  20·log10(1/√2) = -10·log10(2) ≈ -3.0103 dB
    const { magnitude } = frequencyResponse(tf, [1]);
    const expected = -10 * Math.log10(2);   // exact: -3.01029...
    expect(Math.abs(magnitude[0] - expected)).toBeLessThan(TOL_DB);
  });

  test("ω=1: phase = -45°", () => {
    // ∠H(j1) = ∠(1/(1+j)) = -atan2(1,1) = -45°
    const { phase } = frequencyResponse(tf, [1]);
    expect(Math.abs(phase[0] - (-45))).toBeLessThan(TOL_DEG);
  });

  test("ω=0: magnitude = 0 dB (DC gain = 1)", () => {
    // H(0) = 1  →  0 dB
    const { magnitude } = frequencyResponse(tf, [0]);
    expect(Math.abs(magnitude[0])).toBeLessThan(TOL_DB);
  });

  test("ω=0: phase = 0°", () => {
    const { phase } = frequencyResponse(tf, [0]);
    expect(Math.abs(phase[0])).toBeLessThan(TOL_DEG);
  });

  test("ω=10: magnitude ≈ -20.04 dB (high-freq rolloff: -20dB/decade)", () => {
    // |H(j10)| = 1/√(1+100) ≈ 1/10.05  →  -20.04 dB
    const { magnitude } = frequencyResponse(tf, [10]);
    const expected = 20 * Math.log10(1 / Math.sqrt(1 + 100));
    expect(Math.abs(magnitude[0] - expected)).toBeLessThan(TOL_DB);
  });

  test("ω=10: phase approaches -90° (high-freq limit)", () => {
    // atan2(-10, 1) → ≈ -84.3°. Limit is -90° as ω→∞
    const { phase } = frequencyResponse(tf, [10]);
    const expected = Math.atan2(-10, 1) * (180 / Math.PI);
    expect(Math.abs(phase[0] - expected)).toBeLessThan(TOL_DEG);
    expect(phase[0]).toBeLessThan(-80);   // well into high-freq rolloff
  });

  test("magnitude rolls off at -20 dB/decade above corner frequency", () => {
    // From ω=10 to ω=100, magnitude should drop by ~20 dB
    const { magnitude } = frequencyResponse(tf, [10, 100]);
    const slope = magnitude[1] - magnitude[0];
    expect(Math.abs(slope - (-20))).toBeLessThan(0.1);
  });

  test("phase is monotonically decreasing across logspace", () => {
    const omega = logspace(-2, 3, 200);
    const { phase } = frequencyResponse(tf, omega);
    for (let i = 1; i < phase.length; i++) {
      expect(phase[i]).toBeLessThanOrEqual(phase[i - 1] + 1e-6);
    }
  });
});

// ─── Second-order system ──────────────────────────────────────────────────────

describe("frequencyResponse() — 1/(s²+2s+1) critically damped", () => {
  const tf = new TransferFunction([1], [1, 2, 1]);

  test("ω=0: 0 dB, 0°", () => {
    const { magnitude, phase } = frequencyResponse(tf, [0]);
    expect(Math.abs(magnitude[0])).toBeLessThan(TOL_DB);
    expect(Math.abs(phase[0])).toBeLessThan(TOL_DEG);
  });

  test("ω=1 (corner): magnitude = -6.02 dB (two -3dB poles at s=-1)", () => {
    // H(j1) = 1/(j+1)² → |H| = 1/2 → -6.0206 dB
    const { magnitude } = frequencyResponse(tf, [1]);
    const expected = 20 * Math.log10(0.5);
    expect(Math.abs(magnitude[0] - expected)).toBeLessThan(TOL_DB);
  });

  test("ω=1: phase = -90°", () => {
    // ∠(1/(1+j)²) = -2·45° = -90°
    const { phase } = frequencyResponse(tf, [1]);
    expect(Math.abs(phase[0] - (-90))).toBeLessThan(TOL_DEG);
  });

  test("high-freq rolloff: -40 dB/decade (2 poles)", () => {
    // From ω=10 to ω=100: should drop ~40 dB
    const { magnitude } = frequencyResponse(tf, [10, 100]);
    const slope = magnitude[1] - magnitude[0];
    expect(Math.abs(slope - (-40))).toBeLessThan(0.2);
  });

  test("phase approaches -180° as ω→∞", () => {
    const { phase } = frequencyResponse(tf, [1e6]);
    expect(Math.abs(phase[0] - (-180))).toBeLessThan(0.001);
  });
});

// ─── Underdamped second-order — resonance peak ────────────────────────────────

describe("frequencyResponse() — underdamped wn²/(s²+2ζwn·s+wn²)", () => {
  // ζ=0.1, wn=1: sharp resonance peak at ω ≈ wn√(1-2ζ²) ≈ 0.99
  const wn = 1, zeta = 0.1;
  const tf = new TransferFunction(
    [wn * wn],
    [1, 2 * zeta * wn, wn * wn]
  );

  test("resonance peak exists above 0 dB for ζ < 1/√2", () => {
    // For ζ=0.1: peak ≈ 1/(2ζ√(1-ζ²)) ≈ 5.025 → ~14 dB
    const omega = logspace(-1, 1, 1000);
    const { magnitude } = frequencyResponse(tf, omega);
    const peak = Math.max(...magnitude);
    expect(peak).toBeGreaterThan(0);   // above DC (0 dB)

    // Theoretical peak: 20·log10(1/(2ζ√(1-ζ²)))
    const theoreticalPeak = 20 * Math.log10(1 / (2 * zeta * Math.sqrt(1 - zeta ** 2)));
    expect(Math.abs(peak - theoreticalPeak)).toBeLessThan(0.1);
  });
});

// ─── Phase unwrapping ─────────────────────────────────────────────────────────

describe("frequencyResponse() — phase unwrapping", () => {
  test("1/(s+1)² phase reaches below -90° without wrapping back to +90°", () => {
    // Without unwrapping, phase wraps at -180° back to +180°.
    // The unwrapped phase of 1/(s+1)² should smoothly go from 0° to -180°.
    const tf = new TransferFunction([1], [1, 2, 1]);
    const omega = logspace(-2, 4, 500);
    const { phase } = frequencyResponse(tf, omega);

    // Last point should be near -180°, not wrapped to +180°
    expect(phase[phase.length - 1]).toBeLessThan(-150);
    expect(phase[phase.length - 1]).toBeGreaterThan(-190);
  });

  test("integrator 1/s has phase = -90° at all frequencies", () => {
    // H(jω) = 1/(jω) = -j/ω → phase = -90° exactly
    const tf = new TransferFunction([1], [1, 0]);
    const omega = logspace(-2, 3, 100);
    const { phase } = frequencyResponse(tf, omega);
    for (const ph of phase) {
      expect(Math.abs(ph - (-90))).toBeLessThan(TOL_DEG);
    }
  });
});

// ─── logspace helper ──────────────────────────────────────────────────────────

describe("logspace()", () => {
  test("logspace(-1, 2, 4) gives [0.1, 1, 10, 100]", () => {
    const result = logspace(-1, 2, 4);
    [0.1, 1, 10, 100].forEach((expected, i) => {
      expect(Math.abs(result[i] - expected)).toBeLessThan(1e-10);
    });
  });

  test("returns n points", () => {
    expect(logspace(0, 3, 50)).toHaveLength(50);
  });
});
