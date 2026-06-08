import { TransferFunction } from "./TransferFunction";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StateSpace {
  A: number[][];   // n×n system matrix
  B: number[][];   // n×1 input matrix
  C: number[][];   // 1×n output matrix
  D: number[][];   // 1×1 feedthrough matrix
  n: number;       // state dimension
}

export type InputFn = (t: number) => number;

// ─── Matrix helpers (no external deps — all operations are small) ─────────────

// Matrix-vector product: (m×n) · (n×1 col vector) → m×1
function matvec(M: number[][], v: number[]): number[] {
  return M.map(row => row.reduce((sum, mij, j) => sum + mij * v[j], 0));
}

// Vector scale and add: a + scale*b
function vecAddScale(a: number[], scale: number, b: number[]): number[] {
  return a.map((ai, i) => ai + scale * b[i]);
}

// ─── State-space conversion ───────────────────────────────────────────────────

// Convert a TransferFunction to controllable canonical form.
//
// Given H(s) = N(s)/D(s), monic denominator of degree n:
//   D(s) = s^n + a1*s^(n-1) + ... + an
//   N(s) = b0*s^(n-1) + b1*s^(n-2) + ... + b(n-1)   (strictly proper)
//
// A (companion matrix):
//   [ 0    1    0  ...  0  ]
//   [ 0    0    1  ...  0  ]
//   [          ...        ]
//   [-an -a(n-1)...  ... -a1]
//
// B = [0, 0, ..., 1]^T
// C = [b(n-1), b(n-2), ..., b0]   (reversed num, zero-padded to length n)
// D = [0] (strictly proper only — throws if improper)
//
// Why controllable canonical form:
//   - Direct read-off of A, B, C from TF coefficients, no intermediate steps
//   - Numerically fine for low-order systems typical in controls
//   - Observable canonical form is equivalent but CCF is the standard choice
//     when starting from a TF (rows of A are the denominator coefficients)
export function toStateSpace(tf: TransferFunction): StateSpace {
  const n = tf.den.length - 1; // order

  if (n === 0) {
    throw new Error("Transfer function must have order >= 1");
  }

  // Strict properness check: deg(num) must be < deg(den)
  if (tf.num.length > tf.den.length - 1) {
    throw new Error(
      "Only strictly proper transfer functions are supported (deg(num) < deg(den)). " +
      "For improper TFs, extract the D term first."
    );
  }

  // Normalise denominator so leading coefficient is 1
  const d0 = tf.den[0];
  const den = tf.den.map(c => c / d0);  // [1, a1, a2, ..., an]
  const num = tf.num.map(c => c / d0);  // normalise numerator by same factor

  // A: companion matrix in controllable canonical form
  // Last row is [-an, -a(n-1), ..., -a1]
  const A: number[][] = Array.from({ length: n }, (_, i) => {
    const row = new Array(n).fill(0);
    if (i < n - 1) {
      row[i + 1] = 1;           // superdiagonal
    } else {
      // Last row: negative of denominator coefficients (excluding leading 1)
      for (let j = 0; j < n; j++) {
        row[j] = -den[n - j];   // -an, -a(n-1), ..., -a1
      }
    }
    return row;
  });

  // B: input vector — 1 in last position
  const B: number[][] = Array.from({ length: n }, (_, i) =>
    [i === n - 1 ? 1 : 0]
  );

  // C: output row in CCF.
  //
  // CCF states: x1 is the "slowest" integrator (closest to output),
  // xn is the "fastest" (directly driven by input).
  // For H(s) = (b0*s^(n-1) + b1*s^(n-2) + ... + b(n-1)) / D(s):
  //   y = b(n-1)*x1 + b(n-2)*x2 + ... + b0*xn
  // So C = [b(n-1), b(n-2), ..., b1, b0] — reverse of descending-order coefficients.
  //
  // Step: pad num on LEFT to length n (adding leading zeros for low-degree numerators),
  // then REVERSE so constant term comes first.
  const numPadded = [...new Array(n - num.length).fill(0), ...num];
  const C: number[][] = [[...numPadded].reverse()];

  // D: feedthrough — zero for strictly proper TF
  const D: number[][] = [[0]];

  return { A, B, C, D, n };
}

// ─── RK4 integrator ──────────────────────────────────────────────────────────

// Compute ẋ = Ax + Bu given current state and input scalar
function derivative(ss: StateSpace, x: number[], u: number): number[] {
  const Ax = matvec(ss.A, x);
  // B is n×1, so B·u is just B[:,0] * u
  const Bu = ss.B.map(row => row[0] * u);
  return Ax.map((v, i) => v + Bu[i]);
}

// Compute output y = Cx + Du
function output(ss: StateSpace, x: number[], u: number): number {
  const Cx = matvec(ss.C, x)[0];
  const Du = ss.D[0][0] * u;
  return Cx + Du;
}

// Single RK4 step from t to t+h
function rk4Step(
  ss: StateSpace,
  x: number[],
  t: number,
  h: number,
  uFn: InputFn
): number[] {
  const u0 = uFn(t);
  const u_mid = uFn(t + h / 2);
  const u1 = uFn(t + h);

  const k1 = derivative(ss, x, u0);
  const k2 = derivative(ss, vecAddScale(x, h / 2, k1), u_mid);
  const k3 = derivative(ss, vecAddScale(x, h / 2, k2), u_mid);
  const k4 = derivative(ss, vecAddScale(x, h, k3), u1);

  // x_next = x + h/6 * (k1 + 2k2 + 2k3 + k4)
  return x.map((xi, i) =>
    xi + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
  );
}

// ─── Main simulation function ─────────────────────────────────────────────────

// Simulate a TransferFunction's response to an arbitrary input signal.
//
// Parameters:
//   tf    — the transfer function to simulate
//   uFn   — input function u(t), called at arbitrary time points (RK4 needs midpoints)
//   tArr  — time array (need not be uniform, but RK4 accuracy degrades with large steps)
//
// Returns:
//   y     — output array, same length as tArr
//
// Initial conditions: zero state (system at rest at t=tArr[0])
export function simulate(
  tf: TransferFunction,
  uFn: InputFn,
  tArr: number[]
): number[] {
  const ss = toStateSpace(tf);
  let x = new Array(ss.n).fill(0);   // zero initial conditions
  const y: number[] = [];

  for (let i = 0; i < tArr.length; i++) {
    const t = tArr[i];
    const u = uFn(t);

    // Record output at current time
    y.push(output(ss, x, u));

    // Advance state (don't step past the last point)
    if (i < tArr.length - 1) {
      const h = tArr[i + 1] - tArr[i];
      x = rk4Step(ss, x, t, h, uFn);
    }
  }

  return y;
}
