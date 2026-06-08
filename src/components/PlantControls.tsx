"use client";

import { useControlsStore, type PlantType } from "@/lib/controlsStore";
import { Slider, Select } from "./Slider";

// ─────────────────────────────────────────────────────────────────────────────
// Per-plant parameter metadata: which sliders to show, with ranges and labels.
// Iterating this (rather than the params object) guarantees stable order and
// lets us attach proper engineering labels/units/ranges per parameter.
// ─────────────────────────────────────────────────────────────────────────────

interface ParamMeta {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const PLANT_OPTIONS: { value: PlantType; label: string }[] = [
  { value: "dcMotor", label: "DC Motor" },
  { value: "massSpringDamper", label: "Mass–Spring–Damper" },
  { value: "invertedPendulum", label: "Inverted Pendulum" },
  { value: "cruiseControl", label: "Cruise Control" },
];

const PLANT_PARAMS: Record<PlantType, ParamMeta[]> = {
  dcMotor: [
    { key: "K", label: "Gain K", min: 0.1, max: 10, step: 0.1 },
    { key: "tau", label: "Time const τ", min: 0.05, max: 2, step: 0.05, unit: "s" },
  ],
  massSpringDamper: [
    { key: "m", label: "Mass m", min: 0.1, max: 10, step: 0.1, unit: "kg" },
    { key: "b", label: "Damping b", min: 0, max: 10, step: 0.1 },
    { key: "k", label: "Stiffness k", min: 0.1, max: 50, step: 0.5 },
  ],
  // Note: J is intentionally NOT a slider here — it's kept consistent with the
  // point-mass relation J = m·l² whenever m or l changes (see commit() below).
  invertedPendulum: [
    { key: "m", label: "Mass m", min: 0.1, max: 5, step: 0.1, unit: "kg" },
    { key: "l", label: "Length l", min: 0.1, max: 3, step: 0.1, unit: "m" },
    { key: "g", label: "Gravity g", min: 1, max: 20, step: 0.1 },
  ],
  cruiseControl: [
    { key: "K", label: "Gain K", min: 0.1, max: 50, step: 0.5 },
    { key: "tau", label: "Time const τ", min: 0.5, max: 30, step: 0.5, unit: "s" },
  ],
};

export default function PlantControls() {
  const plantConfig = useControlsStore((s) => s.plantConfig);
  const setPlantType = useControlsStore((s) => s.setPlantType);
  const updatePlantParams = useControlsStore((s) => s.updatePlantParams);
  const locked = useControlsStore((s) => s.activeExerciseId !== null);

  const params = plantConfig.params as Record<string, number>;
  const meta = PLANT_PARAMS[plantConfig.type];

  // Commit a single parameter. For the inverted pendulum, dragging m or l also
  // recomputes the moment of inertia J = m·l² so the physics stays consistent
  // (the store always carries an explicit J, so we must update it ourselves).
  const commit = (key: string, v: number) => {
    if (plantConfig.type === "invertedPendulum" && (key === "m" || key === "l")) {
      const m = key === "m" ? v : params.m;
      const l = key === "l" ? v : params.l;
      updatePlantParams({ [key]: v, J: m * l * l });
    } else {
      updatePlantParams({ [key]: v });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {locked && (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-blue-500">
          plant locked for challenge
        </span>
      )}
      <Select
        value={plantConfig.type}
        onChange={setPlantType}
        options={PLANT_OPTIONS}
        disabled={locked}
      />

      <div className="flex flex-col gap-4">
        {meta.map((p) => (
          <Slider
            key={p.key}
            label={p.label}
            value={params[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            unit={p.unit}
            disabled={locked}
            onCommit={(v) => commit(p.key, v)}
          />
        ))}
      </div>
    </div>
  );
}
