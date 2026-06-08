"use client";

import { useControlsStore, type ControllerType } from "@/lib/controlsStore";
import { Slider, Select } from "./Slider";

interface ParamMeta {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const CONTROLLER_OPTIONS: { value: ControllerType; label: string }[] = [
  { value: "pid", label: "PID" },
  { value: "leadLag", label: "Lead / Lag" },
];

const CONTROLLER_PARAMS: Record<ControllerType, ParamMeta[]> = {
  pid: [
    { key: "Kp", label: "Proportional Kp", min: 0, max: 50, step: 0.1 },
    { key: "Ki", label: "Integral Ki", min: 0, max: 20, step: 0.1 },
    { key: "Kd", label: "Derivative Kd", min: 0, max: 20, step: 0.1 },
    { key: "N", label: "Deriv. filter N", min: 1, max: 200, step: 1 },
  ],
  leadLag: [
    { key: "K", label: "Gain K", min: 0.1, max: 20, step: 0.1 },
    { key: "z", label: "Zero z", min: 0.1, max: 20, step: 0.1 },
    { key: "p", label: "Pole p", min: 0.1, max: 20, step: 0.1 },
  ],
};

export default function ControllerControls() {
  const controllerConfig = useControlsStore((s) => s.controllerConfig);
  const setControllerType = useControlsStore((s) => s.setControllerType);
  const updateControllerParams = useControlsStore((s) => s.updateControllerParams);

  const params = controllerConfig.params as Record<string, number>;
  const meta = CONTROLLER_PARAMS[controllerConfig.type];

  return (
    <div className="flex flex-col gap-4">
      <Select
        value={controllerConfig.type}
        onChange={setControllerType}
        options={CONTROLLER_OPTIONS}
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
            onCommit={(v) => updateControllerParams({ [p.key]: v })}
          />
        ))}
      </div>
    </div>
  );
}
