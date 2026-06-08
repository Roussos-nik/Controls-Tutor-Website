import { TransferFunction } from "./TransferFunction";

// ─────────────────────────────────────────────────────────────────────────────
// plants.ts — Standard control-systems plants as parameterised factories.
//
// Each factory takes a typed, fully-optional config object (defaults applied via
// spread) and returns a TransferFunction. Exposing the merged config lets a UI
// edit parameters at runtime and re-build the plant.
// ─────────────────────────────────────────────────────────────────────────────

// ─── (1) DC motor ─────────────────────────────────────────────────────────────
//
// Angular position from input voltage, modelled as G(s) = K / (s(τs+1)).
//   - The free integrator (1/s) maps motor speed → shaft position.
//   - The first-order lag (1/(τs+1)) is the electromechanical time constant.
// Denominator: s(τs+1) = τs² + s  →  [τ, 1, 0]
// One pole at the origin (integrator) and one at s = -1/τ.

export interface DCMotorConfig {
  K: number;    // DC gain
  tau: number;  // time constant τ (s)
}

export const dcMotorDefaults: DCMotorConfig = { K: 1, tau: 0.5 };

export function dcMotor(config: Partial<DCMotorConfig> = {}): TransferFunction {
  const { K, tau } = { ...dcMotorDefaults, ...config };
  // G(s) = K / (τs² + s)
  return new TransferFunction([K], [tau, 1, 0]);
}

// ─── (2) Mass-spring-damper ───────────────────────────────────────────────────
//
// Displacement from applied force: mẍ + bẋ + kx = F.
// Laplace (zero IC): (ms² + bs + k)X = F  →  G(s) = X/F = 1/(ms² + bs + k).
//   m — mass, b — damping coefficient, k — spring stiffness.
// Natural frequency ωn = √(k/m), damping ratio ζ = b / (2√(km)).

export interface MassSpringDamperConfig {
  m: number;  // mass (kg)
  b: number;  // damping (N·s/m)
  k: number;  // stiffness (N/m)
}

export const massSpringDamperDefaults: MassSpringDamperConfig = { m: 1, b: 0.5, k: 4 };

export function massSpringDamper(
  config: Partial<MassSpringDamperConfig> = {}
): TransferFunction {
  const { m, b, k } = { ...massSpringDamperDefaults, ...config };
  // G(s) = 1 / (ms² + bs + k)
  return new TransferFunction([1], [m, b, k]);
}

// ─── (3) Inverted pendulum (linearised about the upright equilibrium) ─────────
//
// DERIVATION (single rigid pendulum, torque-driven, pivot at base):
//
//   Let θ be the angle measured FROM the upright vertical (θ = 0 is straight up).
//   The pendulum has mass m with centre of mass at distance l from the pivot,
//   and moment of inertia J about the pivot. A control torque τ is applied at
//   the pivot. We neglect friction.
//
//   Rotational Newton's second law about the pivot:
//
//       J·θ̈ = (torque from gravity) + (control torque)
//
//   Gravity acts at the CoM. When the pendulum tilts by θ from vertical, the
//   gravitational torque about the pivot is m·g·l·sin(θ), and — crucially —
//   because θ is measured from the UPRIGHT, this torque acts to INCREASE θ
//   (it tips the pendulum further over). So it enters with a POSITIVE sign:
//
//       J·θ̈ = m·g·l·sin(θ) + τ
//
//   Linearise about θ = 0 using sin(θ) ≈ θ:
//
//       J·θ̈ = m·g·l·θ + τ
//
//   Take the Laplace transform (zero initial conditions):
//
//       J·s²·Θ(s) = m·g·l·Θ(s) + T(s)
//       (J·s² − m·g·l)·Θ(s) = T(s)
//
//   Transfer function from torque T to angle Θ:
//
//       G(s) = Θ(s) / T(s) = 1 / (J·s² − m·g·l)
//
//   POLES:  s² = m·g·l / J  →  s = ± √(m·g·l / J).
//   The "+" root is in the right-half plane → the open-loop system is UNSTABLE,
//   which is the defining feature of the inverted pendulum.
//
//   Point-mass assumption: for a point mass at distance l, J = m·l².
//   Then poles sit at s = ±√(g/l). This factory uses J = m·l² but exposes J
//   so a distributed-mass body (e.g. uniform rod, J = (1/3)mL²) can override it.
//
//   Denominator [J, 0, −m·g·l], numerator [1].

export interface InvertedPendulumConfig {
  m: number;  // pendulum mass (kg)
  l: number;  // distance pivot → centre of mass (m)
  g: number;  // gravitational acceleration (m/s²)
  J: number;  // moment of inertia about the pivot (kg·m²)
}

// Defaults: 1 kg point mass on a 1 m massless rod, standard gravity.
// J = m·l² = 1·1² = 1.  Poles at ±√(9.81) ≈ ±3.13 rad/s.
export const invertedPendulumDefaults: InvertedPendulumConfig = {
  m: 1,
  l: 1,
  g: 9.81,
  J: 1, // = m·l² for the default point mass
};

export function invertedPendulum(
  config: Partial<InvertedPendulumConfig> = {}
): TransferFunction {
  // Merge, then recompute J from m,l if the caller supplied m or l but not J,
  // so the point-mass relation J = m·l² stays consistent unless J is explicit.
  const merged = { ...invertedPendulumDefaults, ...config };
  const J =
    config.J !== undefined ? config.J : merged.m * merged.l * merged.l;

  // G(s) = 1 / (J·s² − m·g·l)
  return new TransferFunction([1], [J, 0, -merged.m * merged.g * merged.l]);
}

// ─── (4) Cruise control ───────────────────────────────────────────────────────
//
// Vehicle speed from throttle/force input, first-order lag: G(s) = K/(τs+1).
//   - K is the steady-state speed gain.
//   - τ is the time constant set by vehicle mass and drag (m/b).
// Single stable pole at s = -1/τ.

export interface CruiseControlConfig {
  K: number;    // DC gain
  tau: number;  // time constant τ (s)
}

export const cruiseControlDefaults: CruiseControlConfig = { K: 10, tau: 10 };

export function cruiseControl(
  config: Partial<CruiseControlConfig> = {}
): TransferFunction {
  const { K, tau } = { ...cruiseControlDefaults, ...config };
  // G(s) = K / (τs + 1)
  return new TransferFunction([K], [tau, 1]);
}
