import { create } from "zustand";
import { useMemo } from "react";

import { TransferFunction } from "./TransferFunction";
import {
  dcMotor, massSpringDamper, invertedPendulum, cruiseControl,
  dcMotorDefaults, massSpringDamperDefaults,
  invertedPendulumDefaults, cruiseControlDefaults,
  type DCMotorConfig, type MassSpringDamperConfig,
  type InvertedPendulumConfig, type CruiseControlConfig,
} from "./plants";
import {
  PID, leadLag, pidDefaults, leadLagDefaults,
  type PIDConfig, type LeadLagConfig,
} from "./controllers";
import { simulate } from "./Simulator";
import { frequencyResponse, logspace } from "./FrequencyResponse";
import { stabilityMargins } from "./StabilityMargins";

// ─────────────────────────────────────────────────────────────────────────────
// Config types — discriminated unions so each plant/controller carries exactly
// the parameters it needs, and the build step is fully type-checked.
// ─────────────────────────────────────────────────────────────────────────────

export type PlantConfig =
  | { type: "dcMotor"; params: DCMotorConfig }
  | { type: "massSpringDamper"; params: MassSpringDamperConfig }
  | { type: "invertedPendulum"; params: InvertedPendulumConfig }
  | { type: "cruiseControl"; params: CruiseControlConfig };

export type ControllerConfig =
  | { type: "pid"; params: PIDConfig }
  | { type: "leadLag"; params: LeadLagConfig };

export type PlantType = PlantConfig["type"];
export type ControllerType = ControllerConfig["type"];

// Default params for each type — used when switching types.
const PLANT_DEFAULTS = {
  dcMotor: dcMotorDefaults,
  massSpringDamper: massSpringDamperDefaults,
  invertedPendulum: invertedPendulumDefaults,
  cruiseControl: cruiseControlDefaults,
} as const;

const CONTROLLER_DEFAULTS = {
  pid: pidDefaults,
  leadLag: leadLagDefaults,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Store: source-of-truth config only. Derived state lives in a selector below.
// Actions update config IMMUTABLY (new object references) so the memoised
// selector can detect change via reference equality.
// ─────────────────────────────────────────────────────────────────────────────

interface ControlsStore {
  plantConfig: PlantConfig;
  controllerConfig: ControllerConfig;

  // Exercise mode: when an exercise is active, the plant is locked and the
  // tutor switches to Socratic "exercise mode".
  activeExerciseId: string | null;
  exerciseComplete: boolean;

  setPlantType: (type: PlantType) => void;
  updatePlantParams: (partial: Record<string, number>) => void;

  setControllerType: (type: ControllerType) => void;
  updateControllerParams: (partial: Record<string, number>) => void;

  startExercise: (
    id: string,
    plantType: PlantType,
    plantParams: Record<string, number>
  ) => void;
  exitExercise: () => void;
  markExerciseComplete: () => void;
}

export const useControlsStore = create<ControlsStore>((set) => ({
  plantConfig: { type: "dcMotor", params: { ...dcMotorDefaults } },
  controllerConfig: { type: "pid", params: { ...pidDefaults } },

  activeExerciseId: null,
  exerciseComplete: false,

  setPlantType: (type) =>
    set({
      // Reset params to that type's defaults (fresh object).
      plantConfig: { type, params: { ...PLANT_DEFAULTS[type] } } as PlantConfig,
    }),

  updatePlantParams: (partial) =>
    set((s) => ({
      plantConfig: {
        ...s.plantConfig,
        params: { ...s.plantConfig.params, ...partial },
      } as PlantConfig,
    })),

  setControllerType: (type) =>
    set({
      controllerConfig: {
        type,
        params: { ...CONTROLLER_DEFAULTS[type] },
      } as ControllerConfig,
    }),

  updateControllerParams: (partial) =>
    set((s) => ({
      controllerConfig: {
        ...s.controllerConfig,
        params: { ...s.controllerConfig.params, ...partial },
      } as ControllerConfig,
    })),

  // Lock the plant to the exercise target and reset the controller to a neutral
  // PID starting point so the student tunes from scratch.
  startExercise: (id, plantType, plantParams) =>
    set({
      plantConfig: { type: plantType, params: { ...PLANT_DEFAULTS[plantType], ...plantParams } } as PlantConfig,
      controllerConfig: { type: "pid", params: { ...pidDefaults } },
      activeExerciseId: id,
      exerciseComplete: false,
    }),

  exitExercise: () => set({ activeExerciseId: null, exerciseComplete: false }),

  markExerciseComplete: () => set({ exerciseComplete: true }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Building transfer functions from config
// ─────────────────────────────────────────────────────────────────────────────

export function buildPlant(c: PlantConfig): TransferFunction {
  switch (c.type) {
    case "dcMotor": return dcMotor(c.params);
    case "massSpringDamper": return massSpringDamper(c.params);
    case "invertedPendulum": return invertedPendulum(c.params);
    case "cruiseControl": return cruiseControl(c.params);
  }
}

export function buildController(c: ControllerConfig): TransferFunction {
  switch (c.type) {
    case "pid": return PID(c.params);
    case "leadLag": return leadLag(c.params);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived simulation state — the expensive computation
// ─────────────────────────────────────────────────────────────────────────────

export interface Complex2 { re: number; im: number; }

export interface SimulationState {
  tf_closed: TransferFunction;
  stable: boolean;
  stepResponse: { t: number[]; y: number[] };
  freqResponse: { omega: number[]; mag: number[]; phase: number[] };
  poles: Complex2[];
  zeros: Complex2[];
  metrics: {
    GM: number | null;          // gain margin (dB)
    PM: number | null;          // phase margin (deg)
    bandwidth: number | null;   // closed-loop -3dB (rad/s)
    overshoot: number | null;   // percent
    settlingTime: number | null;// seconds (2% band)
    ss_error: number | null;    // steady-state error to a unit step
  };
}

// Simulation grid — fixed for now; could be exposed in config later.
const UNITY = new TransferFunction([1], [1]);
const T_VEC = Array.from({ length: 1000 }, (_, i) => i * 0.02); // 0..20s
const OMEGA = logspace(-2, 3, 600);

// Guard against numerical garbage (e.g. phase grazing -180° gives 1e+73).
function cleanMargin(m: number | null): number | null {
  if (m === null || !Number.isFinite(m) || Math.abs(m) > 1e6) return null;
  return m;
}

function calcOvershoot(y: number[], finalVal: number): number | null {
  if (!Number.isFinite(finalVal) || finalVal === 0) return null;
  const peak = Math.max(...y);
  const os = ((peak - finalVal) / Math.abs(finalVal)) * 100;
  return os > 0 ? os : 0;
}

// Settling time = first time after which the response stays within ±tol of final.
function calcSettlingTime(
  t: number[], y: number[], finalVal: number, tol = 0.02
): number | null {
  if (!Number.isFinite(finalVal)) return null;
  const band = Math.abs(finalVal) * tol;
  let lastOutside = -1;
  for (let i = 0; i < y.length; i++) {
    if (Math.abs(y[i] - finalVal) > band) lastOutside = i;
  }
  if (lastOutside === -1) return t[0];            // never leaves band
  if (lastOutside === y.length - 1) return null;  // still outside at end
  return t[lastOutside + 1];
}

const toComplex2 = (arr: { re: number; im: number }[]): Complex2[] =>
  arr.map((p) => ({ re: p.re, im: p.im }));

// The core derivation. Pure function of the two configs.
function deriveSimulation(
  plantConfig: PlantConfig,
  controllerConfig: ControllerConfig
): SimulationState {
  const plant = buildPlant(plantConfig);
  const controller = buildController(controllerConfig);

  const openLoop = controller.series(plant);
  const closed = openLoop.feedback(UNITY);

  const poles = closed.poles();
  const zeros = closed.zeros();
  const stable = poles.every((p) => p.re < 0);

  // Time-domain step response (guard improper/edge cases).
  let stepY: number[] = [];
  try {
    stepY = simulate(closed, () => 1, T_VEC);
  } catch {
    stepY = [];
  }

  // Frequency response of the OPEN loop (the curve you read margins off).
  const fr = frequencyResponse(openLoop, OMEGA);
  const margins = stabilityMargins(fr);

  // Steady-state value of the closed loop to a unit step = its DC gain.
  const finalVal = closed.dcGain();

  // Time-domain metrics are only meaningful for a stable, simulable system.
  const canTimeMetrics = stable && stepY.length > 0 && Number.isFinite(finalVal);

  return {
    tf_closed: closed,
    stable,
    stepResponse: { t: T_VEC, y: stepY },
    freqResponse: { omega: fr.omega, mag: fr.magnitude, phase: fr.phase },
    poles: toComplex2(poles),
    zeros: toComplex2(zeros),
    metrics: {
      GM: cleanMargin(margins.gainMargin),
      PM: cleanMargin(margins.phaseMargin),
      bandwidth: cleanMargin(margins.bandwidth),
      overshoot: canTimeMetrics ? calcOvershoot(stepY, finalVal) : null,
      settlingTime: canTimeMetrics ? calcSettlingTime(T_VEC, stepY, finalVal) : null,
      ss_error: stable && Number.isFinite(finalVal) ? 1 - finalVal : null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Memoisation — module-level "memoize-one". Because store actions produce new
// config object references only when something actually changes, we can cache
// on reference equality of the two configs. Repeated calls with the same
// references (re-renders, multiple components) return the SAME cached object,
// so the heavy pipeline runs exactly once per config change, shared app-wide.
// ─────────────────────────────────────────────────────────────────────────────

let _cache: {
  plant: PlantConfig;
  controller: ControllerConfig;
  result: SimulationState;
} | null = null;

export function computeSimulation(
  plantConfig: PlantConfig,
  controllerConfig: ControllerConfig
): SimulationState {
  if (
    _cache &&
    _cache.plant === plantConfig &&
    _cache.controller === controllerConfig
  ) {
    return _cache.result; // cache hit — no recompute
  }
  const result = deriveSimulation(plantConfig, controllerConfig);
  _cache = { plant: plantConfig, controller: controllerConfig, result };
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// The selector hook — this is how components read derived state.
//   const sim = useSimulation();
// useMemo keys on the config references; combined with the module cache above,
// the computation is memoised and only reruns when a config actually changes.
// ─────────────────────────────────────────────────────────────────────────────

export function useSimulation(): SimulationState {
  const plantConfig = useControlsStore((s) => s.plantConfig);
  const controllerConfig = useControlsStore((s) => s.controllerConfig);

  return useMemo(
    () => computeSimulation(plantConfig, controllerConfig),
    [plantConfig, controllerConfig]
  );
}
