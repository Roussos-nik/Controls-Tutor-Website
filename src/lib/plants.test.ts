import {
  dcMotor, massSpringDamper, invertedPendulum, cruiseControl,
  dcMotorDefaults, massSpringDamperDefaults,
  invertedPendulumDefaults, cruiseControlDefaults,
} from "./plants";

const TOL = 1e-9;

function sortByReal(poles: { re: number; im: number }[]) {
  return [...poles].sort((a, b) => a.re - b.re);
}

describe("dcMotor()", () => {
  test("default G(s) = 1/(0.5s²+s)", () => {
    const tf = dcMotor();
    expect(tf.num).toEqual([1]);
    expect(tf.den).toEqual([0.5, 1, 0]);
  });

  test("has integrator pole at 0 and pole at -1/τ = -2", () => {
    const poles = sortByReal(dcMotor().poles());
    expect(Math.abs(poles[0].re - (-2))).toBeLessThan(1e-6);
    expect(Math.abs(poles[1].re - 0)).toBeLessThan(1e-6);
  });

  test("runtime params override defaults", () => {
    const tf = dcMotor({ K: 5, tau: 0.2 });
    expect(tf.num).toEqual([5]);
    expect(tf.den).toEqual([0.2, 1, 0]);
  });
});

describe("massSpringDamper()", () => {
  test("default G(s) = 1/(s²+0.5s+4)", () => {
    const tf = massSpringDamper();
    expect(tf.den).toEqual([1, 0.5, 4]);
  });

  test("ωn=2, ζ=0.125 → underdamped complex poles", () => {
    const poles = massSpringDamper().poles();
    expect(poles).toHaveLength(2);
    // ζ=0.125 < 1 → complex conjugate pair
    expect(Math.abs(poles[0].im)).toBeGreaterThan(0);
    // Real part = -ζωn = -0.25
    expect(Math.abs(poles[0].re - (-0.25))).toBeLessThan(1e-6);
  });

  test("partial override keeps other defaults", () => {
    const tf = massSpringDamper({ k: 16 });
    expect(tf.den).toEqual([1, 0.5, 16]); // m,b default, k overridden
  });
});

describe("invertedPendulum()", () => {
  test("default G(s) = 1/(s² - 9.81)", () => {
    const tf = invertedPendulum();
    expect(tf.num).toEqual([1]);
    expect(tf.den[0]).toBeCloseTo(1, 9);   // J
    expect(tf.den[1]).toBeCloseTo(0, 9);   // no damping
    expect(tf.den[2]).toBeCloseTo(-9.81, 9); // -m·g·l
  });

  test("has a right-half-plane pole (UNSTABLE)", () => {
    const poles = invertedPendulum().poles();
    const hasRHP = poles.some(p => p.re > 1e-6);
    expect(hasRHP).toBe(true);
    // Poles at ±√(g/l) = ±√9.81 ≈ ±3.132
    const sorted = sortByReal(poles);
    expect(Math.abs(sorted[0].re - (-Math.sqrt(9.81)))).toBeLessThan(1e-5);
    expect(Math.abs(sorted[1].re - Math.sqrt(9.81))).toBeLessThan(1e-5);
  });

  test("J auto-recomputed from m,l when not given explicitly (J=m·l²)", () => {
    const tf = invertedPendulum({ l: 2 }); // J should become 1·2² = 4
    expect(tf.den[0]).toBeCloseTo(4, 9);
    expect(tf.den[2]).toBeCloseTo(-1 * 9.81 * 2, 9); // -m·g·l = -19.62
  });

  test("explicit J overrides the point-mass relation", () => {
    const tf = invertedPendulum({ J: 0.333, m: 1, l: 1 });
    expect(tf.den[0]).toBeCloseTo(0.333, 9);
  });
});

describe("cruiseControl()", () => {
  test("default G(s) = 10/(10s+1)", () => {
    const tf = cruiseControl();
    expect(tf.num).toEqual([10]);
    expect(tf.den).toEqual([10, 1]);
  });

  test("single stable pole at -1/τ = -0.1", () => {
    const poles = cruiseControl().poles();
    expect(poles).toHaveLength(1);
    expect(Math.abs(poles[0].re - (-0.1))).toBeLessThan(1e-9);
  });

  test("DC gain equals K", () => {
    expect(cruiseControl().dcGain()).toBeCloseTo(10, 9);
    expect(cruiseControl({ K: 25 }).dcGain()).toBeCloseTo(25, 9);
  });
});

describe("config defaults are exported and correct", () => {
  test("all default objects match spec", () => {
    expect(dcMotorDefaults).toEqual({ K: 1, tau: 0.5 });
    expect(massSpringDamperDefaults).toEqual({ m: 1, b: 0.5, k: 4 });
    expect(invertedPendulumDefaults).toEqual({ m: 1, l: 1, g: 9.81, J: 1 });
    expect(cruiseControlDefaults).toEqual({ K: 10, tau: 10 });
  });
});
