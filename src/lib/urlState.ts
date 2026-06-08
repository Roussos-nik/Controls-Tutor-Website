import {
  dcMotorDefaults, massSpringDamperDefaults,
  invertedPendulumDefaults, cruiseControlDefaults,
} from "./plants";
import { pidDefaults, leadLagDefaults } from "./controllers";
import type {
  PlantConfig, ControllerConfig, PlantType, ControllerType,
} from "./controlsStore";

// ─────────────────────────────────────────────────────────────────────────────
// urlState.ts — compact, positional encoding of plant + controller config for
// the URL hash. Format:
//
//   <plantCode>:<v1>,<v2>...;<ctrlCode>:<v1>,<v2>...
//   e.g.  dm:1,0.5;pid:2,1,0.5,100
//
// Values are written in each type's fixed parameter order (taken from the
// defaults objects), so decoding maps them straight back to the right keys.
// No JSON, no key names — just type codes and ordered numbers.
// ─────────────────────────────────────────────────────────────────────────────

const PLANT_CODE: Record<PlantType, string> = {
  dcMotor: "dm",
  massSpringDamper: "msd",
  invertedPendulum: "ip",
  cruiseControl: "cc",
};
const CTRL_CODE: Record<ControllerType, string> = {
  pid: "pid",
  leadLag: "ll",
};

const PLANT_BY_CODE = Object.fromEntries(
  Object.entries(PLANT_CODE).map(([k, v]) => [v, k])
) as Record<string, PlantType>;
const CTRL_BY_CODE = Object.fromEntries(
  Object.entries(CTRL_CODE).map(([k, v]) => [v, k])
) as Record<string, ControllerType>;

// Fixed parameter order per type (insertion order of the defaults).
const PLANT_KEYS: Record<PlantType, string[]> = {
  dcMotor: Object.keys(dcMotorDefaults),
  massSpringDamper: Object.keys(massSpringDamperDefaults),
  invertedPendulum: Object.keys(invertedPendulumDefaults),
  cruiseControl: Object.keys(cruiseControlDefaults),
};
const CTRL_KEYS: Record<ControllerType, string[]> = {
  pid: Object.keys(pidDefaults),
  leadLag: Object.keys(leadLagDefaults),
};

// Compact number: round to 4 dp and drop trailing zeros ("0.5", "100", "9.81").
function num(n: number): string {
  return String(Math.round(n * 1e4) / 1e4);
}

export function encodeState(
  plant: PlantConfig,
  ctrl: ControllerConfig
): string {
  const p = plant.params as unknown as Record<string, number>;
  const c = ctrl.params as unknown as Record<string, number>;
  const pVals = PLANT_KEYS[plant.type].map((k) => num(p[k])).join(",");
  const cVals = CTRL_KEYS[ctrl.type].map((k) => num(c[k])).join(",");
  return `${PLANT_CODE[plant.type]}:${pVals};${CTRL_CODE[ctrl.type]}:${cVals}`;
}

export function decodeState(
  s: string
): { plantConfig: PlantConfig; controllerConfig: ControllerConfig } | null {
  try {
    const [pPart, cPart] = s.split(";");
    if (!pPart || !cPart) return null;

    const [pCode, pValsStr] = pPart.split(":");
    const [cCode, cValsStr] = cPart.split(":");

    const plantType = PLANT_BY_CODE[pCode];
    const ctrlType = CTRL_BY_CODE[cCode];
    if (!plantType || !ctrlType) return null;

    const pKeys = PLANT_KEYS[plantType];
    const cKeys = CTRL_KEYS[ctrlType];
    const pVals = pValsStr.split(",").map(Number);
    const cVals = cValsStr.split(",").map(Number);

    if (pVals.length !== pKeys.length || cVals.length !== cKeys.length) return null;
    if (pVals.some(Number.isNaN) || cVals.some(Number.isNaN)) return null;

    const pParams: Record<string, number> = {};
    pKeys.forEach((k, i) => (pParams[k] = pVals[i]));
    const cParams: Record<string, number> = {};
    cKeys.forEach((k, i) => (cParams[k] = cVals[i]));

    return {
      plantConfig: { type: plantType, params: pParams } as unknown as PlantConfig,
      controllerConfig: { type: ctrlType, params: cParams } as unknown as ControllerConfig,
    };
  } catch {
    return null;
  }
}

// ── Hash read/write (client-only) ─────────────────────────────────────────────

export function readHash(): string | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.replace(/^#/, "");
  return h.startsWith("s=") ? decodeURIComponent(h.slice(2)) : null;
}

export function writeHash(encoded: string): void {
  if (typeof window === "undefined") return;
  // replaceState avoids polluting browser history and avoids scroll jumps.
  const url = `${window.location.pathname}${window.location.search}#s=${encoded}`;
  window.history.replaceState(null, "", url);
}
