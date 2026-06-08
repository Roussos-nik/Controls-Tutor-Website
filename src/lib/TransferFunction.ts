import { complex, Complex, add, multiply, divide, subtract, abs } from "mathjs";

// Durand-Kerner (Weierstrass) method for finding all polynomial roots simultaneously.
//
// Why Durand-Kerner over alternatives:
//   - Jenkins-Traub: more robust for ill-conditioned polys, but significantly more
//     complex to implement correctly in a from-scratch setting.
//   - Companion matrix + eigenvalue: clean but pulls in a full linear algebra
//     dependency; overkill here and eigensolvers have their own numerical issues.
//   - Newton's method per root: needs deflation, which accumulates error badly
//     for repeated or near-repeated roots.
//   - Durand-Kerner: finds all roots simultaneously, straightforward to implement,
//     converges quadratically for simple roots, well-suited for low-to-medium
//     order systems typical in controls (2nd–6th order). Main weakness is
//     sensitivity to repeated roots, but those are degenerate in practice.

const MAX_ITER = 1000;
const TOL = 1e-12;

function durandKerner(coeffs: number[]): Complex[] {
  const n = coeffs.length - 1;

  if (n === 0) return [];
  if (n === 1) {
    return [complex(-coeffs[1] / coeffs[0], 0)];
  }

  const a = coeffs.map((c) => c / coeffs[0]);

  function evalPoly(_roots: Complex[], x: Complex): Complex {
    let val: Complex = complex(a[0] as number, 0);
    for (let i = 1; i <= n; i++) {
      val = add(multiply(val, x), complex(a[i] as number, 0)) as Complex;
    }
    return val;
  }

  const maxCoeff = Math.max(...a.slice(1).map(Math.abs));
  const r = 1 + Math.pow(maxCoeff, 1 / n);

  let roots: Complex[] = Array.from({ length: n }, (_, k) => {
    const angle = (2 * Math.PI * k) / n + 0.1;
    return complex(r * Math.cos(angle), r * Math.sin(angle));
  });

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const newRoots: Complex[] = [...roots];
    let maxDelta = 0;

    for (let i = 0; i < n; i++) {
      let denom: Complex = complex(1, 0);
      for (let j = 0; j < n; j++) {
        if (j !== i) {
          denom = multiply(denom, subtract(roots[i], roots[j])) as Complex;
        }
      }

      const pVal = evalPoly(roots, roots[i]);
      const delta = divide(pVal, denom) as Complex;
      newRoots[i] = subtract(roots[i], delta) as Complex;
      maxDelta = Math.max(maxDelta, abs(delta) as number);
    }

    roots = newRoots;
    if (maxDelta < TOL) break;
  }

  return roots;
}

// ─── Polynomial arithmetic (coefficients in descending power order) ───────────

// Multiply two polynomials: convolution of coefficient arrays.
// [1, 2] * [1, 3] = [1, 5, 6]  (i.e. (s+2)(s+3) = s²+5s+6)
export function polyMul(a: number[], b: number[]): number[] {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] += a[i] * b[j];
    }
  }
  return result;
}

// Add two polynomials, padding the shorter one with leading zeros.
// [1, 2] + [1, 0, 3] = [1, 1, 5]  (i.e. (s+2) + (s²+3) = s²+s+5)
export function polyAdd(a: number[], b: number[]): number[] {
  const len = Math.max(a.length, b.length);
  const pa = [...new Array(len - a.length).fill(0), ...a];
  const pb = [...new Array(len - b.length).fill(0), ...b];
  return pa.map((v, i) => v + pb[i]);
}

// ─── TransferFunction class ───────────────────────────────────────────────────

export class TransferFunction {
  // Coefficients in descending power order.
  // num = [1, 3] means s + 3
  // den = [1, 3, 2] means s² + 3s + 2
  constructor(
    public readonly num: number[],
    public readonly den: number[]
  ) {
    if (num.length === 0 || den.length === 0) {
      throw new Error("Numerator and denominator must be non-empty");
    }
    if (den.every((c) => c === 0)) {
      throw new Error("Denominator cannot be all zeros");
    }
  }

  // ── Interconnections ────────────────────────────────────────────────────────

  // Series (cascade): G·H
  // Num = Ng·Nh, Den = Dg·Dh
  series(other: TransferFunction): TransferFunction {
    return new TransferFunction(
      polyMul(this.num, other.num),
      polyMul(this.den, other.den)
    );
  }

  // Parallel (sum): G + H
  // Num = Ng·Dh + Nh·Dg, Den = Dg·Dh
  parallel(other: TransferFunction): TransferFunction {
    return new TransferFunction(
      polyAdd(polyMul(this.num, other.den), polyMul(other.num, this.den)),
      polyMul(this.den, other.den)
    );
  }

  // Feedback: G/(1 ± G·H)
  //   Negative feedback (default, sign = -1): G/(1 + G·H)
  //   Positive feedback           (sign = +1): G/(1 - G·H)
  //
  // Derivation:
  //   Closed-loop = G / (1 + G·H)
  //   Num = Ng·Dh
  //   Den = Dg·Dh + sign·Ng·Nh   (sign=+1 for negative feedback, -1 for positive)
  //
  // Note: "negative feedback" means the loop subtracts, giving +GH in denominator.
  feedback(
    sensor: TransferFunction,
    type: "negative" | "positive" = "negative"
  ): TransferFunction {
    const sign = type === "negative" ? 1 : -1;

    const num = polyMul(this.num, sensor.den);
    const openLoopNum = polyMul(this.num, sensor.num); // G·H numerator product
    const openLoopDen = polyMul(this.den, sensor.den); // G·H denominator product

    // Den = Dg·Dh + sign·Ng·Nh
    const scaledLoop = openLoopNum.map((c) => sign * c);
    const den = polyAdd(openLoopDen, scaledLoop);

    return new TransferFunction(num, den);
  }

  // ── Analysis ────────────────────────────────────────────────────────────────

  evaluate(s: Complex): Complex {
    const evalPoly = (coeffs: number[], s: Complex): Complex => {
      let result: Complex = complex(0, 0);
      for (const c of coeffs) {
        result = add(multiply(result, s), complex(c, 0)) as Complex;
      }
      return result;
    };

    const num = evalPoly(this.num, s);
    const den = evalPoly(this.den, s);
    return divide(num, den) as Complex;
  }

  poles(): Complex[] {
    return durandKerner(this.den);
  }

  zeros(): Complex[] {
    return durandKerner(this.num);
  }

  dcGain(): number {
    return this.num[this.num.length - 1] / this.den[this.den.length - 1];
  }

  toString(): string {
    const polyStr = (c: number[]) =>
      c
        .map((v, i) => {
          const power = c.length - 1 - i;
          if (power === 0) return `${v}`;
          if (power === 1) return `${v}s`;
          return `${v}s^${power}`;
        })
        .join(" + ");
    return `(${polyStr(this.num)}) / (${polyStr(this.den)})`;
  }
}
