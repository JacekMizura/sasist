import type { ChangeEvent } from "react";

import {
  ORIENTATION_OPTIONS,
  SHAPE_OPTIONS,
  STACK_BEHAVIOR_OPTIONS,
  type PatchFieldDef,
  type PatchFieldState,
} from "./patchFieldUtils";
import { pmaInp } from "./uiTokens";

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

/**
 * Compact checkbox-gated field list — no per-option cards.
 */
export function PatchFieldsEditor({ fields, state, onChange, disabled, sectionTitle }: Props) {
  return (
    <div>
      {sectionTitle ? (
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{sectionTitle}</p>
      ) : null}
      <ul className="space-y-1">
        {fields.map((def) => {
          const st = state[def.key] ?? { enabled: false, value: "", boolValue: false };
          return (
            <li key={def.key} className="rounded-md px-0.5 py-1 hover:bg-slate-50/80">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-slate-300"
                  checked={st.enabled}
                  disabled={disabled}
                  aria-label={def.label}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    onChange(setField(state, def.key, { enabled: e.target.checked }))
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-slate-800">{def.label}</span>
                    {def.hint && !st.enabled ? (
                      <span className="text-xs text-slate-400">{def.hint}</span>
                    ) : null}
                    {st.enabled && def.type === "boolean" ? (
                      <select
                        className={`${pmaInp} !mt-0 max-w-[7rem] py-1`}
                        disabled={disabled}
                        value={st.boolValue ? "1" : "0"}
                        onChange={(e) =>
                          onChange(setField(state, def.key, { boolValue: e.target.value === "1" }))
                        }
                      >
                        <option value="1">Tak</option>
                        <option value="0">Nie</option>
                      </select>
                    ) : null}
                    {st.enabled && (def.type === "number" || def.type === "text") ? (
                      <input
                        className={`${pmaInp} !mt-0 max-w-[10rem] py-1`}
                        type="text"
                        inputMode={def.type === "number" ? "decimal" : undefined}
                        disabled={disabled}
                        value={st.value}
                        onChange={(e) => onChange(setField(state, def.key, { value: e.target.value }))}
                      />
                    ) : null}
                    {st.enabled && def.type === "orientation" ? (
                      <select
                        className={`${pmaInp} !mt-0 max-w-[12rem] py-1`}
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
                    ) : null}
                    {st.enabled && def.type === "shape" ? (
                      <select
                        className={`${pmaInp} !mt-0 max-w-[12rem] py-1`}
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
                    ) : null}
                    {st.enabled && def.type === "stack_behavior" ? (
                      <select
                        className={`${pmaInp} !mt-0 max-w-[14rem] py-1`}
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
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
