import { complex, Complex, abs as cabs } from "mathjs";
import { TransferFunction } from "./TransferFunction";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FrequencyResponseResult {
  omega:     number[];   // input frequency array (rad/s)
  magnitude: number[];   // |H(jω)| in dB: 20·log10(|H|)
  phase:     number[];   // ∠H(jω) in degrees, unwrapped
}

// ─── Phase unwrapping ────────────────────────────────────────────────────────
//
// atan2 returns values in (-π, π]. As ω increases, the phase can jump by ±2π
// at wrap boundaries. Unwrapping removes those discontinuities so the phase
// curve is continuous — essential for reading phase margin off a Bode plot.
//
// Algorithm: scan consecutive differences; if |diff| > π, add a cumulative
// correction of ∓2π. This is the standard 1-D unwrap used by MATLAB/NumPy.

function unwrapDegrees(phases: number[]): number[] {
  const unwrapped = [...phases];
  let correction = 0;

  for (let i = 1; i < unwrapped.length; i++) {
    const diff = unwrapped[i] + correction - unwrapped[i - 1] - correction;
    // Normalise diff to (-180, 180]
    const wrapped = ((diff + 180) % 360 + 360) % 360 - 180;
    correction += wrapped - diff;
    unwrapped[i] += correction;
  }

  return unwrapped;
}

// ─── Main function ────────────────────────────────────────────────────────────

// Evaluate the frequency response of a TransferFunction at each ω in the array.
//
// For each ω:
//   s = jω
//   H(jω) = N(jω) / D(jω)   (evaluated as complex arithmetic)
//   magnitude = 20·log10(|H(jω)|)   [dB]
//   phase = atan2(Im(H), Re(H))      [degrees, then unwrapped]
//
// Notes:
//   - ω = 0 is allowed; phase is 0° for a system with real DC gain
//   - Magnitude of exactly 0 gives -Infinity dB (zero of H on imaginary axis)
//   - omega array need not be uniform (logspace is typical for Bode plots)

export function frequencyResponse(
  tf: TransferFunction,
  omega: number[]
): FrequencyResponseResult {
  const magnitudeLinear: number[] = [];
  const phaseRaw: number[] = [];

  for (const w of omega) {
    const s = complex(0, w);                           // s = jω
    const H = tf.evaluate(s);                          // complex H(jω)
    const mag = cabs(H) as number;                     // |H(jω)|
    const ph  = Math.atan2(H.im, H.re) * (180 / Math.PI); // degrees

    magnitudeLinear.push(mag);
    phaseRaw.push(ph);
  }

  const magnitude = magnitudeLinear.map(m =>
    m === 0 ? -Infinity : 20 * Math.log10(m)
  );
  const phase = unwrapDegrees(phaseRaw);

  return { omega, magnitude, phase };
}

// ─── Convenience: logspace ────────────────────────────────────────────────────
// Generate n points logarithmically spaced between 10^start and 10^end.
// Usage: logspace(-2, 3, 500) → 0.01 to 1000 rad/s, 500 points.

export function logspace(start: number, end: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) =>
    Math.pow(10, start + (i / (n - 1)) * (end - start))
  );
}
