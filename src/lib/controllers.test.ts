import { complex } from "mathjs";
import { PID, leadLag, pidDefaults, leadLagDefaults } from "./controllers";

const TOL = 1e-9;

// Term-by-term reference for PID = Kp + Ki/s + Kd·s/(s/N+1)
function pidReference(
  Kp: number, Ki: number, Kd: number, N: number,
  s: { re: number; im: number }
): { re: number; im: number } {
  const inv = (re: number, im: number) => {
    const d = re * re + im * im;
    return { re: re / d, im: -im / d };
  };
  const invS = inv(s.re, s.im);                     // 1/s
  const I = { re: Ki * invS.re, im: Ki * invS.im }; // Ki/s
  const dn = { re: s.re / N + 1, im: s.im / N };     // s/N + 1
  const idn = inv(dn.re, dn.im);
  const sn = {                                       // s/(s/N+1)
    re: s.re * idn.re - s.im * idn.im,
    im: s.re * idn.im + s.im * idn.re,
  };
  const D = { re: Kd * sn.re, im: Kd * sn.im };
  return { re: Kp + I.re + D.re, im: I.im + D.im };
}

const samplePoints = [
  complex(0, 1), complex(0, 10), complex(1, 1), complex(0.5, 3), complex(0, 0.1),
];

// ─── PID ──────────────────────────────────────────────────────────────────────

describe("PID()", () => {
  test("default config is Kp=1, Ki=0, Kd=0, N=100", () => {
    expect(pidDefaults).toEqual({ Kp: 1, Ki: 0, Kd: 0, N: 100 });
  });

  test("assembled TF matches Kp + Ki/s + Kd·s/(s/N+1) term-by-term", () => {
    const configs = [
      { Kp: 2, Ki: 3, Kd: 0.5, N: 100 },
      { Kp: 5, Ki: 1, Kd: 0.1, N: 20 },
      { Kp: 0, Ki: 0, Kd: 1, N: 50 },
    ];
    for (const c of configs) {
      const tf = PID(c);
      for (const s of samplePoints) {
        const got = tf.evaluate(s);
        const ref = pidReference(c.Kp, c.Ki, c.Kd, c.N, s);
        expect(Math.abs(got.re - ref.re)).toBeLessThan(TOL);
        expect(Math.abs(got.im - ref.im)).toBeLessThan(TOL);
      }
    }
  });

  test("coefficients: num=[Kp+Kd·N, Kp·N+Ki, Ki·N], den=[1,N,0]", () => {
    const tf = PID({ Kp: 2, Ki: 3, Kd: 0.5, N: 100 });
    expect(tf.num).toEqual([2 + 0.5 * 100, 2 * 100 + 3, 3 * 100]); // [52, 203, 300]
    expect(tf.den).toEqual([1, 100, 0]);
  });

  test("pure P: C(s) evaluates to Kp at all frequencies", () => {
    const tf = PID({ Kp: 4, Ki: 0, Kd: 0 });
    for (const s of samplePoints) {
      const v = tf.evaluate(s);
      expect(Math.abs(v.re - 4)).toBeLessThan(TOL);
      expect(Math.abs(v.im)).toBeLessThan(TOL);
    }
  });

  test("pure I: C(s) = Ki/s (phase = -90°)", () => {
    const tf = PID({ Kp: 0, Ki: 5, Kd: 0 });
    // At s=j1: Ki/j1 = -5j → magnitude 5, phase -90°
    const v = tf.evaluate(complex(0, 1));
    expect(Math.abs(v.re)).toBeLessThan(TOL);
    expect(Math.abs(v.im - (-5))).toBeLessThan(TOL);
  });

  test("pure D filtered: high-freq gain approaches Kd·N (not infinite)", () => {
    // Kd·s/(s/N+1) → Kd·N as ω→∞ (the filter caps the gain)
    const Kd = 0.2, N = 50;
    const tf = PID({ Kp: 0, Ki: 0, Kd, N });
    const vHigh = tf.evaluate(complex(0, 1e6));
    expect(Math.abs(Math.hypot(vHigh.re, vHigh.im) - Kd * N)).toBeLessThan(1e-3);
  });

  test("derivative filter pole sits at s = -N", () => {
    const tf = PID({ Kp: 1, Ki: 1, Kd: 1, N: 30 });
    const poles = tf.poles().map(p => p.re).sort((a, b) => a - b);
    // Poles at 0 and -N = -30
    expect(Math.abs(poles[0] - (-30))).toBeLessThan(1e-5);
    expect(Math.abs(poles[1] - 0)).toBeLessThan(1e-5);
  });
});

// ─── Lead / Lag ─────────────────────────────────────────────────────────────

describe("leadLag()", () => {
  test("default config is K=1, z=1, p=10 (a lead network)", () => {
    expect(leadLagDefaults).toEqual({ K: 1, z: 1, p: 10 });
  });

  test("C(s) = K(s+z)/(s+p): num=[K, K·z], den=[1, p]", () => {
    const tf = leadLag({ K: 2, z: 1, p: 10 });
    expect(tf.num).toEqual([2, 2]);
    expect(tf.den).toEqual([1, 10]);
  });

  test("zero at -z, pole at -p", () => {
    const tf = leadLag({ K: 3, z: 2, p: 20 });
    expect(Math.abs(tf.zeros()[0].re - (-2))).toBeLessThan(1e-9);
    expect(Math.abs(tf.poles()[0].re - (-20))).toBeLessThan(1e-9);
  });

  test("DC gain = K·z/p", () => {
    const tf = leadLag({ K: 2, z: 1, p: 10 });
    expect(tf.dcGain()).toBeCloseTo(0.2, 9);
  });

  test("lead (z<p) adds positive phase at mid frequencies", () => {
    // Lead network z=1, p=10: phase is positive between the corners
    const tf = leadLag({ K: 1, z: 1, p: 10 });
    // At ω=√(z·p)=√10≈3.16 (geometric mean), phase is maximum and positive
    const s = complex(0, Math.sqrt(10));
    const v = tf.evaluate(s);
    const phase = Math.atan2(v.im, v.re);
    expect(phase).toBeGreaterThan(0); // lead → positive phase
  });

  test("lag (z>p) adds negative phase at mid frequencies", () => {
    // Lag network z=10, p=1: phase is negative between corners
    const tf = leadLag({ K: 1, z: 10, p: 1 });
    const s = complex(0, Math.sqrt(10));
    const v = tf.evaluate(s);
    const phase = Math.atan2(v.im, v.re);
    expect(phase).toBeLessThan(0); // lag → negative phase
  });

  test("high-frequency gain approaches K", () => {
    // As ω→∞, K(s+z)/(s+p) → K
    const tf = leadLag({ K: 5, z: 1, p: 10 });
    const v = tf.evaluate(complex(0, 1e6));
    expect(Math.abs(Math.hypot(v.re, v.im) - 5)).toBeLessThan(1e-3);
  });
});
