import type { ChangeEvent } from "react";

import {
  ORIENTATION_OPTIONS,
  SHAPE_OPTIONS,
  STACK_BEHAVIOR_OPTIONS,
  type PatchFieldDef,
  type PatchFieldState,
} from "./patchFieldUtils";
import { pmaCheckRow, pmaInp, pmaLab } from "./uiTokens";

type Props = {
  fields: PatchFieldDef[];
  state: Record<string, PatchFieldState>;
  onChange: (next: Record<string, PatchFieldState>) => void;
  disabled?: boolean;
};

function setField(
  state: Record<string, PatchFieldState>,
  key: string,
  patch: Partial<PatchFieldState>,
): Record<string, PatchFieldState> {
  return { ...state, [key]: { ...state[key]!, ...patch } };
}

/**
 * Checkbox-gated field list — same interaction as former ProductBulkPatchModal.
 */
export function PatchFieldsEditor({ fields, state, onChange, disabled }: Props) {
  return (
    <ul className="space-y-2.5">
      {fields.map((def) => {
        const st = state[def.key] ?? { enabled: false, value: "", boolValue: false };
        return (
          <li key={def.key} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
            <label className={pmaCheckRow}>
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300"
                checked={st.enabled}
                disabled={disabled}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  onChange(setField(state, def.key, { enabled: e.target.checked }))
                }
              />
              <span>
                <span className="font-medium text-slate-800">{def.label}</span>
                {def.hint ? <span className="mt-0.5 block text-xs text-slate-500">{def.hint}</span> : null}
              </span>
            </label>
            {st.enabled ? (
              <div className="mt-2 pl-6">
                {def.type === "boolean" ? (
                  <label className={pmaCheckRow}>
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={st.boolValue}
                      disabled={disabled}
                      onChange={(e) => onChange(setField(state, def.key, { boolValue: e.target.checked }))}
                    />
                    <span>Włącz</span>
                  </label>
                ) : null}
                {def.type === "number" || def.type === "text" ? (
                  <label className={pmaLab}>
                    Wartość
                    <input
                      className={pmaInp}
                      type={def.type === "number" ? "text" : "text"}
                      inputMode={def.type === "number" ? "decimal" : undefined}
                      disabled={disabled}
                      value={st.value}
                      onChange={(e) => onChange(setField(state, def.key, { value: e.target.value }))}
                    />
                  </label>
                ) : null}
                {def.type === "orientation" ? (
                  <label className={pmaLab}>
                    Orientacja
                    <select
                      className={pmaInp}
                      disabled={disabled}
                      value={st.value}
                      onChange={(e) => onChange(setField(state, def.key, { value: e.target.value }))}
                    >
                      {ORIENTATION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {def.type === "shape" ? (
                  <label className={pmaLab}>
                    Kształt
                    <select
                      className={pmaInp}
                      disabled={disabled}
                      value={st.value}
                      onChange={(e) => onChange(setField(state, def.key, { value: e.target.value }))}
                    >
                      {SHAPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {def.type === "stack_behavior" ? (
                  <label className={pmaLab}>
                    Składowanie
                    <select
                      className={pmaInp}
                      disabled={disabled}
                      value={st.value}
                      onChange={(e) => onChange(setField(state, def.key, { value: e.target.value }))}
                    >
                      {STACK_BEHAVIOR_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
