import { TransferFunction } from "./TransferFunction";

// ─────────────────────────────────────────────────────────────────────────────
// controllers.ts — Compensators as parameterised factories.
//
// Same pattern as plants.ts: each factory takes a typed Partial<Config> merged
// over exported defaults, returning a TransferFunction. Gains are the things you
// tune at runtime (sliders), so the config object is the right interface.
// ─────────────────────────────────────────────────────────────────────────────

// ─── (1) PID with filtered derivative ─────────────────────────────────────────
//
// C(s) = Kp + Ki/s + Kd·s/(s/N + 1)
//
// The derivative term is filtered by a first-order lag with corner at N·(rad/s).
// Pure differentiation (Kd·s) is improper and amplifies high-frequency noise
// without bound; the filter 1/(s/N+1) rolls it off above ω=N. Large N → closer
// to ideal derivative; small N → heavier filtering. N=100 is a common default.
//
// COMBINING over the common denominator s(s+N):
//   Rewrite the derivative term: Kd·s/(s/N+1) = Kd·N·s/(s+N)
//
//     Kp            → Kp·s(s+N)  = Kp·s² + Kp·N·s
//     Ki/s          → Ki(s+N)    = Ki·s + Ki·N
//     Kd·N·s/(s+N)  → Kd·N·s²
//
//   Numerator   = (Kp + Kd·N)·s² + (Kp·N + Ki)·s + Ki·N
//   Denominator = s² + N·s = s(s+N)
//
//   num = [Kp + Kd·N,  Kp·N + Ki,  Ki·N]
//   den = [1, N, 0]
//
// Sanity: pure-P collapses to Kp, pure-I to Ki/s, pure-D to the filtered
// derivative (the s(s+N) factor cancels in each degenerate case).
//
// Note: this realization is not minimal for degenerate gains (e.g. pure P leaves
// a cancelling pole/zero at s=0 and s=-N). The transfer function is still exactly
// correct — poles()/zeros() will just report the un-cancelled roots.

export interface PIDConfig {
  Kp: number;  // proportional gain
  Ki: number;  // integral gain
  Kd: number;  // derivative gain
  N: number;   // derivative filter coefficient (filter corner ω = N rad/s)
}

export const pidDefaults: PIDConfig = { Kp: 1, Ki: 0, Kd: 0, N: 100 };

export function PID(config: Partial<PIDConfig> = {}): TransferFunction {
  const { Kp, Ki, Kd, N } = { ...pidDefaults, ...config };

  const num = [
    Kp + Kd * N,    // s²
    Kp * N + Ki,    // s¹
    Ki * N,         // s⁰
  ];
  const den = [1, N, 0]; // s² + N·s = s(s+N)

  return new TransferFunction(num, den);
}

// ─── (2) Lead / Lag compensator ────────────────────────────────────────────────
//
// C(s) = K·(s + z) / (s + p)
//
//   - LEAD  (z < p): zero before the pole. Adds positive phase between z and p,
//     used to improve transient response / phase margin.
//   - LAG   (z > p): pole before the zero. Boosts low-frequency gain to reduce
//     steady-state error, at the cost of a little phase.
//
//   num = [K, K·z]   →   K·s + K·z = K(s + z)
//   den = [1, p]     →   s + p

export interface LeadLagConfig {
  K: number;  // gain
  z: number;  // zero location (compensator zero at s = -z)
  p: number;  // pole location (compensator pole at s = -p)
}

// Default is a lead network (z < p): zero at -1, pole at -10.
export const leadLagDefaults: LeadLagConfig = { K: 1, z: 1, p: 10 };

export function leadLag(config: Partial<LeadLagConfig> = {}): TransferFunction {
  const { K, z, p } = { ...leadLagDefaults, ...config };

  const num = [K, K * z]; // K(s + z)
  const den = [1, p];     // s + p

  return new TransferFunction(num, den);
}
