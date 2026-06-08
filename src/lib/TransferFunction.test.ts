import { complex, Complex } from "mathjs";
import { TransferFunction, polyMul, polyAdd } from "./TransferFunction";

const TOLS = 1e-6;
const TOLD = 1e-10;

function expectComplexClose(
  actual: Complex,
  realExpected: number,
  imagExpected: number,
  tol = TOLS
) {
  expect(Math.abs(actual.re - realExpected)).toBeLessThan(tol);
  expect(Math.abs(actual.im - imagExpected)).toBeLessThan(tol);
}

function sortComplex(arr: Complex[]): Complex[] {
  return [...arr].sort((a, b) => {
    const rDiff = a.re - b.re;
    if (Math.abs(rDiff) > 1e-10) return rDiff;
    return a.im - b.im;
  });
}

function expectPolyClose(actual: number[], expected: number[], tol = TOLD) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) =>
    expect(Math.abs(v - expected[i])).toBeLessThan(tol)
  );
}

// ─── polyMul / polyAdd ────────────────────────────────────────────────────────

describe("polyMul", () => {
  test("(s+2)(s+3) = s²+5s+6", () => {
    expectPolyClose(polyMul([1, 2], [1, 3]), [1, 5, 6]);
  });

  test("multiplying by constant [2] scales coefficients", () => {
    expectPolyClose(polyMul([1, 3, 2], [2]), [2, 6, 4]);
  });

  test("(s)(s) = s²", () => {
    expectPolyClose(polyMul([1, 0], [1, 0]), [1, 0, 0]);
  });
});

describe("polyAdd", () => {
  test("(s+2) + (s+3) = 2s+5", () => {
    expectPolyClose(polyAdd([1, 2], [1, 3]), [2, 5]);
  });

  test("different degrees: (s²+1) + (s+2) = s²+s+3", () => {
    expectPolyClose(polyAdd([1, 0, 1], [1, 2]), [1, 1, 3]);
  });

  test("(s) + (s²) = s²+s", () => {
    expectPolyClose(polyAdd([1, 0], [1, 0, 0]), [1, 1, 0]);
  });
});

// ─── series ───────────────────────────────────────────────────────────────────

describe("TransferFunction.series()", () => {
  test("1/s · 1/(s+1) = 1/(s²+s)", () => {
    // G = 1/s, H = 1/(s+1)
    // G·H = 1 / s(s+1) = 1/(s²+s)
    const G = new TransferFunction([1], [1, 0]);
    const H = new TransferFunction([1], [1, 1]);
    const GH = G.series(H);

    expectPolyClose(GH.num, [1]);
    expectPolyClose(GH.den, [1, 1, 0]);
  });

  test("series is commutative at evaluation point s=2j", () => {
    const G = new TransferFunction([1, 1], [1, 3, 2]);
    const H = new TransferFunction([2], [1, 4]);
    const s = complex(0, 2);

    const GH = G.series(H).evaluate(s);
    const HG = H.series(G).evaluate(s);

    expectComplexClose(GH, HG.re, HG.im, TOLD);
  });

  test("series evaluate matches manual multiplication at s=1", () => {
    // G(1) = 2/4 = 0.5, H(1) = 1/2 = 0.5, G·H = 0.25
    const G = new TransferFunction([1, 1], [1, 3]);   // (s+1)/(s+3)
    const H = new TransferFunction([1], [1, 1]);       // 1/(s+1)
    const s = complex(1, 0);

    const via_series = G.series(H).evaluate(s);
    const manual = G.evaluate(s).re * H.evaluate(s).re; // both real at s=1

    expect(Math.abs(via_series.re - manual)).toBeLessThan(TOLD);
  });
});

// ─── parallel ─────────────────────────────────────────────────────────────────

describe("TransferFunction.parallel()", () => {
  test("1/s + 1/(s+1) = (2s+1)/(s²+s)", () => {
    // Common denominator s(s+1): num = (s+1) + s = 2s+1
    const G = new TransferFunction([1], [1, 0]);
    const H = new TransferFunction([1], [1, 1]);
    const sum = G.parallel(H);

    // Evaluate at s=2 to verify rather than checking raw coefficients
    // (parallel may produce equivalent but not minimal polynomial)
    const s = complex(2, 0);
    const via_parallel = sum.evaluate(s).re;
    const manual = G.evaluate(s).re + H.evaluate(s).re; // 0.5 + 0.333 = 0.833

    expect(Math.abs(via_parallel - manual)).toBeLessThan(TOLD);
  });

  test("parallel evaluate matches G(s)+H(s) at s=2j", () => {
    const G = new TransferFunction([1, 2], [1, 3, 2]);
    const H = new TransferFunction([1], [1, 5]);
    const s = complex(0, 2);

    const via_parallel = G.parallel(H).evaluate(s);
    const gVal = G.evaluate(s);
    const hVal = H.evaluate(s);

    expectComplexClose(
      via_parallel,
      gVal.re + hVal.re,
      gVal.im + hVal.im,
      TOLD
    );
  });
});

// ─── feedback ─────────────────────────────────────────────────────────────────

describe("TransferFunction.feedback()", () => {
  test("feedback(1/s, 1) gives 1/(s+1) — unity negative feedback integrator", () => {
    // G = 1/s, H = 1 (unity sensor)
    // Closed loop = G/(1+GH) = (1/s)/(1 + 1/s) = 1/(s+1)
    // Pole at s=-1, DC gain = 1
    const G = new TransferFunction([1], [1, 0]);     // 1/s
    const H = new TransferFunction([1], [1]);         // 1
    const CL = G.feedback(H);

    // Verify via pole location
    const poles = sortComplex(CL.poles());
    expect(poles).toHaveLength(1);
    expect(Math.abs(poles[0].re - (-1))).toBeLessThan(TOLS);
    expect(Math.abs(poles[0].im)).toBeLessThan(TOLS);

    // Verify DC gain = 1
    expect(Math.abs(CL.dcGain() - 1)).toBeLessThan(TOLD);

    // Verify evaluate matches 1/(s+1) at s=2j
    const s = complex(0, 2);
    const cl_val = CL.evaluate(s);
    const expected = new TransferFunction([1], [1, 1]).evaluate(s);
    expectComplexClose(cl_val, expected.re, expected.im, TOLS);
  });

  test("negative feedback: 2nd order plant with unity feedback", () => {
    // G = 1/(s²+3s+2), H = 1
    // CL = G/(1+G) = 1/(s²+3s+3)
    const G = new TransferFunction([1], [1, 3, 2]);
    const H = new TransferFunction([1], [1]);
    const CL = G.feedback(H);

    const s = complex(0, 1);
    const cl_val = CL.evaluate(s);
    const expected = new TransferFunction([1], [1, 3, 3]).evaluate(s);
    expectComplexClose(cl_val, expected.re, expected.im, TOLS);
  });

  test("positive feedback: G/(1-GH) — pole moves toward instability", () => {
    // G = 1/(s+2), H = 1
    // Negative FB CL pole: s = -3 (stable)
    // Positive FB CL pole: s = -1 (still stable but moved toward origin)
    const G = new TransferFunction([1], [1, 2]);
    const H = new TransferFunction([1], [1]);

    const neg = G.feedback(H, "negative");
    const pos = G.feedback(H, "positive");

    const negPole = neg.poles()[0];
    const posPole = pos.poles()[0];

    expect(Math.abs(negPole.re - (-3))).toBeLessThan(TOLS);
    expect(Math.abs(posPole.re - (-1))).toBeLessThan(TOLS);
  });

  test("feedback evaluate matches formula directly at s=1+j", () => {
    // G = (s+2)/(s²+3s+2), H = 2/(s+5)
    // Verify CL.evaluate(s) == G(s)/(1 + G(s)H(s))
    const G = new TransferFunction([1, 2], [1, 3, 2]);
    const H = new TransferFunction([2], [1, 5]);
    const CL = G.feedback(H);

    const s = complex(1, 1);
    const gVal = G.evaluate(s);
    const hVal = H.evaluate(s);

    // Manual: G/(1+GH)
    const gh_re = gVal.re * hVal.re - gVal.im * hVal.im;
    const gh_im = gVal.re * hVal.im + gVal.im * hVal.re;
    const denom_re = 1 + gh_re;
    const denom_im = gh_im;
    const denom_sq = denom_re ** 2 + denom_im ** 2;
    const manual_re = (gVal.re * denom_re + gVal.im * denom_im) / denom_sq;
    const manual_im = (gVal.im * denom_re - gVal.re * denom_im) / denom_sq;

    const cl_val = CL.evaluate(s);
    expectComplexClose(cl_val, manual_re, manual_im, TOLS);
  });
});

// ─── Original tests (regression) ─────────────────────────────────────────────

describe("TransferFunction — evaluate()", () => {
  test("(a) 2nd order: H(2j) = -0.05 - 0.15j for 1/(s²+3s+2)", () => {
    const tf = new TransferFunction([1], [1, 3, 2]);
    const result = tf.evaluate(complex(0, 2));
    expectComplexClose(result, -0.05, -0.15, TOLD);
  });
});

describe("TransferFunction — poles()", () => {
  test("(b) poles of 1/(s²+3s+2) are at -1 and -2", () => {
    const tf = new TransferFunction([1], [1, 3, 2]);
    const poles = sortComplex(tf.poles());
    expect(poles).toHaveLength(2);
    expectComplexClose(poles[0], -2, 0);
    expectComplexClose(poles[1], -1, 0);
  });
});

describe("TransferFunction — DC gain", () => {
  test("(c) H(0) = 2.5 for 5/(s²+3s+2)", () => {
    const tf = new TransferFunction([5], [1, 3, 2]);
    const dc = tf.evaluate(complex(0, 0));
    expectComplexClose(dc, 2.5, 0, TOLD);
  });
});
