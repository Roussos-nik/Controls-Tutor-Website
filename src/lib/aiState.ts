import {
  useControlsStore,
  computeSimulation,
  buildPlant,
  buildController,
} from "./controlsStore";
import type { TransferFunction } from "./TransferFunction";

// ─────────────────────────────────────────────────────────────────────────────
// AI state schema — a compact, self-describing snapshot of the simulator for
// sending to Claude. Units are baked into field names; transfer functions are
// human-readable strings; poles/stability come with a textual summary so the
// model can reason without parsing raw coefficient arrays. No plot data.
// ─────────────────────────────────────────────────────────────────────────────

export interface SimStateForAI {
  /** Schema identifier so the model knows the shape/version. */
  schema: "controls-sim/v1";

  plant: {
    type: string;              // machine id, e.g. "dcMotor"
    name: string;              // human label, e.g. "DC Motor"
    params: Record<string, number>;
    transferFunction: string;  // e.g. "1 / (0.5 s^2 + s)"
  };

  controller: {
    type: string;              // e.g. "pid"
    name: string;              // e.g. "PID"
    params: Record<string, number>;
    transferFunction: string;  // e.g. "(52 s^2 + 201 s + 100) / (s^2 + 100 s)"
  };

  closedLoop: {
    transferFunction: string;
    stable: boolean;
    poles: { re: number; im: number }[]; // rounded to 3 dp
    zeros: { re: number; im: number }[];
    summary: string;           // textual description of pole locations + stability
  };

  /** Performance metrics. null = not defined (see notes). */
  metrics: {
    phaseMargin_deg: number | null;
    gainMargin_dB: number | null;
    bandwidth_radps: number | null;
    overshoot_pct: number | null;
    settlingTime_s: number | null;
    steadyStateError: number | null; // fraction, for a unit step
  };

  /** Conventions the model should assume. */
  notes: string;
}

// ── Display-name maps ─────────────────────────────────────────────────────────

const PLANT_NAMES: Record<string, string> = {
  dcMotor: "DC Motor",
  massSpringDamper: "Mass-Spring-Damper",
  invertedPendulum: "Inverted Pendulum",
  cruiseControl: "Cruise Control",
};

const CONTROLLER_NAMES: Record<string, string> = {
  pid: "PID",
  leadLag: "Lead/Lag",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const round = (x: number, d = 3): number => {
  const f = Math.pow(10, d);
  return Math.round(x * f) / f;
};

const roundOrNull = (x: number | null, d = 3): number | null =>
  x === null || !Number.isFinite(x) ? null : round(x, d);

// Render a coefficient array (descending powers) as a readable polynomial.
// [0.5, 1, 0] → "0.5 s^2 + s"
function polyToString(coeffs: number[], v = "s"): string {
  const n = coeffs.length - 1;
  const terms: string[] = [];
  coeffs.forEach((c, i) => {
    if (Math.abs(c) < 1e-12) return;
    const power = n - i;
    const cr = round(c, 4);
    const absc = Math.abs(cr);
    let body: string;
    if (power === 0) body = `${absc}`;
    else if (absc === 1) body = power === 1 ? v : `${v}^${power}`;
    else body = power === 1 ? `${absc} ${v}` : `${absc} ${v}^${power}`;
    terms.push((cr < 0 ? "- " : "+ ") + body);
  });
  if (terms.length === 0) return "0";
  return terms.join(" ").replace(/^\+ /, "").replace(/^- /, "-");
}

function tfString(tf: TransferFunction): string {
  return `(${polyToString(tf.num)}) / (${polyToString(tf.den)})`;
}

// Build the textual pole/stability summary.
function describePoles(
  poles: { re: number; im: number }[],
  stable: boolean
): string {
  const eps = 1e-6;
  const n = poles.length;
  const rhpCount = poles.filter((p) => p.re > eps).length;

  // Process modes dominant-first (largest real part = closest to instability).
  const order = poles.map((_, i) => i).sort((a, b) => poles[b].re - poles[a].re);
  const seen = new Array(n).fill(false);
  const modes: string[] = [];

  for (const i of order) {
    if (seen[i]) continue;
    const p = poles[i];
    seen[i] = true;

    if (Math.abs(p.im) < eps) {
      modes.push(`real pole at ${round(p.re, 2)}`);
    } else {
      // mark the conjugate as seen
      for (let j = 0; j < n; j++) {
        if (!seen[j] && Math.abs(poles[j].re - p.re) < 1e-3 &&
            Math.abs(poles[j].im + p.im) < 1e-3) {
          seen[j] = true;
          break;
        }
      }
      const wn = Math.hypot(p.re, p.im);
      const zeta = -p.re / wn;
      modes.push(
        `complex pair at ${round(p.re, 2)} ± ${round(Math.abs(p.im), 2)}j ` +
        `(ωn≈${round(wn, 2)} rad/s, ζ≈${round(zeta, 2)})`
      );
    }
  }

  const stabilityPhrase = stable
    ? "all in the left-half plane → STABLE"
    : `${rhpCount} in the right-half plane → UNSTABLE`;

  return `${n} closed-loop pole${n > 1 ? "s" : ""}, ${stabilityPhrase}. ${modes.join("; ")}.`;
}

// ── Main builder ────────────────────────────────────────────────────────────────

/**
 * Build a compact, self-describing snapshot of the current simulator state,
 * suitable for sending to Claude. Reads the Zustand store directly, so it can
 * be called from an event handler (not a React hook).
 */
export function getSimStateForAI(): SimStateForAI {
  const { plantConfig, controllerConfig } = useControlsStore.getState();
  const sim = computeSimulation(plantConfig, controllerConfig);

  const plantTF = buildPlant(plantConfig);
  const controllerTF = buildController(controllerConfig);

  const roundPt = (p: { re: number; im: number }) => ({
    re: round(p.re, 3),
    im: round(p.im, 3),
  });

  return {
    schema: "controls-sim/v1",

    plant: {
      type: plantConfig.type,
      name: PLANT_NAMES[plantConfig.type] ?? plantConfig.type,
      params: { ...(plantConfig.params as unknown as Record<string, number>) },
      transferFunction: tfString(plantTF),
    },

    controller: {
      type: controllerConfig.type,
      name: CONTROLLER_NAMES[controllerConfig.type] ?? controllerConfig.type,
      params: { ...(controllerConfig.params as unknown as Record<string, number>) },
      transferFunction: tfString(controllerTF),
    },

    closedLoop: {
      transferFunction: tfString(sim.tf_closed),
      stable: sim.stable,
      poles: sim.poles.map(roundPt),
      zeros: sim.zeros.map(roundPt),
      summary: describePoles(sim.poles, sim.stable),
    },

    metrics: {
      phaseMargin_deg: roundOrNull(sim.metrics.PM, 1),
      gainMargin_dB: roundOrNull(sim.metrics.GM, 1),
      bandwidth_radps: roundOrNull(sim.metrics.bandwidth, 3),
      overshoot_pct: roundOrNull(sim.metrics.overshoot, 1),
      settlingTime_s: roundOrNull(sim.metrics.settlingTime, 2),
      steadyStateError: roundOrNull(sim.metrics.ss_error, 4),
    },

    notes:
      "Unity negative feedback assumed. Closed loop = C·G/(1+C·G). " +
      "A null metric means it is undefined for this system (e.g. infinite gain " +
      "margin when phase never reaches -180°, or time-domain metrics for an " +
      "unstable loop). steadyStateError is the fraction error to a unit step.",
  };
}
