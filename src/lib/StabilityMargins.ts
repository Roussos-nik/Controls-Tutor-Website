import { FrequencyResponseResult } from "./FrequencyResponse";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StabilityMargins {
  gainCrossoverFreq: number | null;   // ω where |G(jω)| = 1 (0 dB), rad/s
  phaseCrossoverFreq: number | null;  // ω where ∠G(jω) = -180°, rad/s
  gainMargin: number | null;          // dB; null if phase never crosses -180°
  phaseMargin: number | null;         // degrees; null if |G| never crosses 0 dB
  bandwidth: number | null;           // ω where closed-loop |T| = DC-3dB, rad/s
}

// ─── Crossing finder with interpolation ───────────────────────────────────────
//
// Finds the FIRST frequency where series `y` crosses `target`, interpolating
// linearly in log-frequency (the natural axis for Bode data). Returns both the
// crossing frequency and the index of the lower bracket so the caller can
// interpolate a second series (e.g. magnitude) at the same frequency.
//
// `direction` filters which crossings count:
//   "any"        — any sign change
//   "falling"    — y goes from above target to below (decreasing through it)
//
// Returns null if no qualifying crossing exists in the data.

interface Crossing {
  freq: number;
  index: number;  // lower bracket index i (crossing is between i and i+1)
  frac: number;   // interpolation fraction within [i, i+1]
}

function findCrossing(
  omega: number[],
  y: number[],
  target: number,
  direction: "any" | "falling" = "any"
): Crossing | null {
  for (let i = 0; i < y.length - 1; i++) {
    const d0 = y[i] - target;
    const d1 = y[i + 1] - target;

    // Need a sign change (straddle). Handle exact hits at the lower point.
    const straddles = d0 === 0 || (d0 < 0) !== (d1 < 0);
    if (!straddles) continue;

    if (direction === "falling" && y[i + 1] > y[i]) continue;

    // Interpolation fraction along the segment (linear in y)
    const frac = d1 === d0 ? 0 : d0 / (d0 - d1);

    // Interpolate frequency in log space when both endpoints are positive,
    // otherwise fall back to linear (guards against ω=0 → log(0)).
    let freq: number;
    if (omega[i] > 0 && omega[i + 1] > 0) {
      const logF = Math.log10(omega[i]) +
        frac * (Math.log10(omega[i + 1]) - Math.log10(omega[i]));
      freq = Math.pow(10, logF);
    } else {
      freq = omega[i] + frac * (omega[i + 1] - omega[i]);
    }

    return { freq, index: i, frac };
  }
  return null;
}

// Interpolate a value from series `y` at the bracket/fraction of a crossing.
function interpAt(y: number[], c: Crossing): number {
  return y[c.index] + c.frac * (y[c.index + 1] - y[c.index]);
}

// ─── Main: compute all stability margins ──────────────────────────────────────
//
// Input: open-loop frequency response (magnitude in dB, phase in degrees).
// Assumes unity negative feedback for bandwidth and margin interpretation.
//
// All five quantities return null rather than throwing when undefined.

export function stabilityMargins(
  openLoop: FrequencyResponseResult
): StabilityMargins {
  const { omega, magnitude, phase } = openLoop;

  // ── Gain crossover: |G| = 1  ⟺  magnitude = 0 dB ────────────────────────────
  const gcCrossing = findCrossing(omega, magnitude, 0);
  const gainCrossoverFreq = gcCrossing ? gcCrossing.freq : null;

  // ── Phase crossover: ∠G = -180° ─────────────────────────────────────────────
  const pcCrossing = findCrossing(omega, phase, -180);
  const phaseCrossoverFreq = pcCrossing ? pcCrossing.freq : null;

  // ── Phase margin: 180° + phase at gain crossover ────────────────────────────
  // null if there's no gain crossover (|G| never reaches unity).
  const phaseMargin = gcCrossing
    ? 180 + interpAt(phase, gcCrossing)
    : null;

  // ── Gain margin: -(magnitude in dB) at phase crossover ──────────────────────
  // null if there's no phase crossover (∠G never reaches -180° → infinite GM).
  const gainMargin = pcCrossing
    ? -interpAt(magnitude, pcCrossing)
    : null;

  // ── Closed-loop bandwidth: |T| = T(0) - 3dB,  T = G/(1+G) ────────────────────
  const bandwidth = computeBandwidth(omega, magnitude, phase);

  return {
    gainCrossoverFreq,
    phaseCrossoverFreq,
    gainMargin,
    phaseMargin,
    bandwidth,
  };
}

// Reconstruct closed-loop |T(jω)| in dB from open-loop magnitude/phase,
// then find where it drops 3 dB below its DC (lowest-frequency) value.
function computeBandwidth(
  omega: number[],
  magnitudeDb: number[],
  phaseDeg: number[]
): number | null {
  const tDb: number[] = magnitudeDb.map((magDb, i) => {
    // Reconstruct complex open-loop G = |G|·e^{jφ}
    const magLin = Math.pow(10, magDb / 20);
    const phRad = (phaseDeg[i] * Math.PI) / 180;
    const gRe = magLin * Math.cos(phRad);
    const gIm = magLin * Math.sin(phRad);

    // Closed loop T = G / (1 + G)
    const denRe = 1 + gRe;
    const denIm = gIm;
    const denMagSq = denRe * denRe + denIm * denIm;

    const tRe = (gRe * denRe + gIm * denIm) / denMagSq;
    const tIm = (gIm * denRe - gRe * denIm) / denMagSq;
    const tMag = Math.sqrt(tRe * tRe + tIm * tIm);

    return tMag === 0 ? -Infinity : 20 * Math.log10(tMag);
  });

  // Bandwidth threshold = DC value - 3 dB
  const dcDb = tDb[0];
  const threshold = dcDb - 3;

  // First falling crossing of the threshold
  const crossing = findCrossing(omega, tDb, threshold, "falling");
  return crossing ? crossing.freq : null;
}
