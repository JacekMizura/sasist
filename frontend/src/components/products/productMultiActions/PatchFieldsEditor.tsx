import type { ChangeEvent, ReactNode } from "react";

import {
  ORIENTATION_OPTIONS,
  SHAPE_OPTIONS,
  STACK_BEHAVIOR_OPTIONS,
  type PatchFieldDef,
  type PatchFieldState,
} from "./patchFieldUtils";
import { pmaFieldRowClass, pmaInp } from "./uiTokens";

type Props = {
  fields: PatchFieldDef[];
  state: Record<string, PatchFieldState>;
  onChange: (next: Record<string, PatchFieldState>) => void;
  disabled?: boolean;
  sectionTitle?: string;
};

function setField(
  state: Record<string, PatchFieldState>,
  key: string,
  patch: Partial<PatchFieldState>,
): Record<string, PatchFieldState> {
  return { ...state, [key]: { ...(state[key] ?? { enabled: false, value: "", boolValue: false }), ...patch } };
}

function FieldControl({
  def,
  st,
  disabled,
  onPatch,
}: {
  def: PatchFieldDef;
  st: PatchFieldState;
  disabled?: boolean;
  onPatch: (patch: Partial<PatchFieldState>) => void;
}): ReactNode {
  if (!st.enabled) return <span className="block h-8" aria-hidden />;

  if (def.type === "boolean") {
    return (
      <select
        className={pmaInp}
        disabled={disabled}
        value={st.boolValue ? "1" : "0"}
        onChange={(e) => onPatch({ boolValue: e.target.value === "1" })}
      >
        <option value="1">Tak</option>
        <option value="0">Nie</option>
      </select>
    );
  }
  if (def.type === "number" || def.type === "text") {
    return (
      <input
        className={pmaInp}
        type="text"
        inputMode={def.type === "number" ? "decimal" : undefined}
        disabled={disabled}
        value={st.value}
        onChange={(e) => onPatch({ value: e.target.value })}
      />
    );
  }
  if (def.type === "orientation") {
    return (
      <select
        className={pmaInp}
        disabled={disabled}
        value={st.value}
        onChange={(e) => onPatch({ value: e.target.value })}
      >
        {ORIENTATION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (def.type === "shape") {
    return (
      <select
        className={pmaInp}
        disabled={disabled}
        value={st.value}
        onChange={(e) => onPatch({ value: e.target.value })}
      >
        {SHAPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (def.type === "stack_behavior") {
    return (
      <select
        className={pmaInp}
        disabled={disabled}
        value={st.value}
        onChange={(e) => onPatch({ value: e.target.value })}
      >
        {STACK_BEHAVIOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return null;
}

/**
 * Uniform rows: checkbox | label | control — left-aligned, same columns for every field.
 */
export function PatchFieldsEditor({ fields, state, onChange, disabled, sectionTitle }: Props) {
  return (
    <div>
      {sectionTitle ? (
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{sectionTitle}</p>
      ) : null}
      <ul className="space-y-0.5">
        {fields.map((def) => {
          const st = state[def.key] ?? { enabled: false, value: "", boolValue: false };
          return (
            <li key={def.key} className={pmaFieldRowClass}>
              <input
                type="checkbox"
                className="justify-self-center rounded border-slate-300"
                checked={st.enabled}
                disabled={disabled}
                aria-label={def.label}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  onChange(setField(state, def.key, { enabled: e.target.checked }))
                }
              />
              <div className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{def.label}</span>
                {def.hint && !st.enabled ? (
                  <span className="block truncate text-xs text-slate-400">{def.hint}</span>
                ) : null}
              </div>
              <FieldControl
                def={def}
                st={st}
                disabled={disabled}
                onPatch={(patch) => onChange(setField(state, def.key, patch))}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
