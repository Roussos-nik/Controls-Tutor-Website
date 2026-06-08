"use client";

import {
  useControlsStore,
  useSimulation,
  type PlantType,
} from "./controlsStore";

// ─────────────────────────────────────────────────────────────────────────────
// Example consumer. Shows the three ways you'll touch the store:
//   1. Read a config slice            → useControlsStore(s => s.plantConfig)
//   2. Call an action                 → useControlsStore(s => s.updatePlantParams)
//   3. Read derived simulation state  → useSimulation()
// ─────────────────────────────────────────────────────────────────────────────

function fmt(v: number | null, digits = 2): string {
  return v === null ? "—" : v.toFixed(digits);
}

export default function SimulatorPanel() {
  // 1. Read config slices. Selecting narrow slices means this component only
  //    re-renders when THAT slice changes, not on every store update.
  const plantConfig = useControlsStore((s) => s.plantConfig);
  const controllerConfig = useControlsStore((s) => s.controllerConfig);

  // 2. Pull actions (stable references — won't cause re-renders).
  const setPlantType = useControlsStore((s) => s.setPlantType);
  const updatePlantParams = useControlsStore((s) => s.updatePlantParams);
  const updateControllerParams = useControlsStore((s) => s.updateControllerParams);

  // 3. Derived state. Recomputes only when plantConfig/controllerConfig change.
  const sim = useSimulation();

  return (
    <div className="flex flex-col gap-6 p-6 font-mono text-sm">
      {/* ── Plant selector ───────────────────────────────────────────── */}
      <section>
        <h3 className="mb-2 font-semibold">Plant: {plantConfig.type}</h3>
        <div className="flex gap-2">
          {(["dcMotor", "massSpringDamper", "invertedPendulum", "cruiseControl"] as PlantType[])
            .map((t) => (
              <button
                key={t}
                onClick={() => setPlantType(t)}
                className={`rounded border px-2 py-1 text-xs ${
                  plantConfig.type === t
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                {t}
              </button>
            ))}
        </div>

        {/* Editable params — render one slider per numeric field in params */}
        <div className="mt-3 flex flex-col gap-2">
          {Object.entries(plantConfig.params).map(([key, value]) => (
            <label key={key} className="flex items-center gap-3">
              <span className="w-24 text-xs text-slate-500">{key}</span>
              <input
                type="range"
                min={0.1}
                max={20}
                step={0.1}
                value={value as number}
                onChange={(e) =>
                  updatePlantParams({ [key]: parseFloat(e.target.value) })
                }
                className="flex-1"
              />
              <span className="w-12 text-right text-xs tabular-nums">
                {(value as number).toFixed(2)}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* ── Controller params (PID example) ──────────────────────────── */}
      <section>
        <h3 className="mb-2 font-semibold">Controller: {controllerConfig.type}</h3>
        <div className="flex flex-col gap-2">
          {Object.entries(controllerConfig.params).map(([key, value]) => (
            <label key={key} className="flex items-center gap-3">
              <span className="w-24 text-xs text-slate-500">{key}</span>
              <input
                type="range"
                min={0}
                max={key === "N" ? 200 : 50}
                step={0.1}
                value={value as number}
                onChange={(e) =>
                  updateControllerParams({ [key]: parseFloat(e.target.value) })
                }
                className="flex-1"
              />
              <span className="w-12 text-right text-xs tabular-nums">
                {(value as number).toFixed(2)}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* ── Derived metrics ──────────────────────────────────────────── */}
      <section>
        <h3 className="mb-2 font-semibold">
          Metrics{" "}
          <span className={sim.stable ? "text-emerald-600" : "text-red-600"}>
            ({sim.stable ? "stable" : "UNSTABLE"})
          </span>
        </h3>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <Metric label="Phase Margin" value={fmt(sim.metrics.PM)} unit="°" />
          <Metric label="Gain Margin" value={fmt(sim.metrics.GM)} unit="dB" />
          <Metric label="Bandwidth" value={fmt(sim.metrics.bandwidth)} unit="rad/s" />
          <Metric label="Overshoot" value={fmt(sim.metrics.overshoot)} unit="%" />
          <Metric label="Settling" value={fmt(sim.metrics.settlingTime)} unit="s" />
          <Metric label="SS Error" value={fmt(sim.metrics.ss_error, 4)} unit="" />
        </div>
      </section>

      {/* ── Proof the response arrays are populated ──────────────────── */}
      <section className="text-xs text-slate-500">
        step response: {sim.stepResponse.y.length} pts · bode:{" "}
        {sim.freqResponse.omega.length} pts · poles: {sim.poles.length} · zeros:{" "}
        {sim.zeros.length}
      </section>
    </div>
  );
}

function Metric({
  label, value, unit,
}: { label: string; value: string; unit: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded border border-slate-200 p-2">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="tabular-nums">
        {value}
        {unit && <span className="ml-1 text-slate-400">{unit}</span>}
      </span>
    </div>
  );
}
