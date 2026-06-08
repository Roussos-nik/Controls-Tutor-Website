import type { SimulationState } from "./controlsStore";
import type { PlantType } from "./controlsStore";

// ─────────────────────────────────────────────────────────────────────────────
// exercises.ts — guided challenges. Each locks a target plant; the student tunes
// the controller until every success criterion passes. Criteria are predicates
// over the live SimulationState, so they double as a live pass/fail checklist.
// (All five were verified to have at least one solving PID controller.)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExerciseCriterion {
  label: string;
  test: (sim: SimulationState) => boolean;
}

export interface Exercise {
  id: string;
  title: string;
  description: string;
  plant: { type: PlantType; params: Record<string, number> };
  criteria: ExerciseCriterion[];
}

// Helpers that treat null metrics (unstable / undefined) as failing.
const lt = (v: number | null, x: number) => v !== null && Number.isFinite(v) && v < x;
const gt = (v: number | null, x: number) => v !== null && Number.isFinite(v) && v > x;

export const EXERCISES: Exercise[] = [
  {
    id: "dc-tame",
    title: "Tame the DC Motor",
    description:
      "Position-control the DC motor with a snappy but clean response. Tune the PID so the step response barely overshoots and the loop stays robust.",
    plant: { type: "dcMotor", params: {} },
    criteria: [
      { label: "Overshoot < 10%", test: (s) => lt(s.metrics.overshoot, 10) },
      { label: "Phase margin > 40°", test: (s) => gt(s.metrics.PM, 40) },
      { label: "Stable", test: (s) => s.stable },
    ],
  },
  {
    id: "cruise-speed",
    title: "Speed Up Cruise Control",
    description:
      "The cruise plant is sluggish. Tune the controller to make it noticeably faster while eliminating steady-state error — the car should reach the set speed exactly.",
    plant: { type: "cruiseControl", params: {} },
    criteria: [
      { label: "Bandwidth > 1 rad/s", test: (s) => gt(s.metrics.bandwidth, 1) },
      { label: "Steady-state error < 0.02", test: (s) => lt(s.metrics.ss_error, 0.02) },
      { label: "Stable", test: (s) => s.stable },
    ],
  },
  {
    id: "pendulum-balance",
    title: "Balance the Inverted Pendulum",
    description:
      "The pendulum is open-loop unstable — there's a pole in the right-half plane. Find gains that pull it into the stable region and keep the response from overshooting wildly.",
    plant: { type: "invertedPendulum", params: {} },
    criteria: [
      { label: "Closed loop is STABLE", test: (s) => s.stable },
      { label: "Overshoot < 20%", test: (s) => lt(s.metrics.overshoot, 20) },
    ],
  },
  {
    id: "msd-damp",
    title: "Damp the Mass-Spring-Damper",
    description:
      "This system rings — it's very lightly damped. Add enough damping through your controller to kill the oscillation and settle reasonably quickly.",
    plant: { type: "massSpringDamper", params: {} },
    criteria: [
      { label: "Overshoot < 10%", test: (s) => lt(s.metrics.overshoot, 10) },
      { label: "Settling time < 12 s", test: (s) => lt(s.metrics.settlingTime, 12) },
      { label: "Stable", test: (s) => s.stable },
    ],
  },
  {
    id: "dc-robust",
    title: "Design for Robustness",
    description:
      "Re-tune the DC motor, but this time prioritise robustness: a generous phase margin, modest overshoot, and zero steady-state error. A robust loop tolerates modelling error and delay.",
    plant: { type: "dcMotor", params: {} },
    criteria: [
      { label: "Phase margin > 60°", test: (s) => gt(s.metrics.PM, 60) },
      { label: "Overshoot < 15%", test: (s) => lt(s.metrics.overshoot, 15) },
      { label: "Steady-state error < 0.02", test: (s) => lt(s.metrics.ss_error, 0.02) },
    ],
  },
];

export function getExercise(id: string | null): Exercise | undefined {
  return id ? EXERCISES.find((e) => e.id === id) : undefined;
}

// All criteria pass?
export function meetsCriteria(ex: Exercise, sim: SimulationState): boolean {
  return ex.criteria.every((c) => c.test(sim));
}
