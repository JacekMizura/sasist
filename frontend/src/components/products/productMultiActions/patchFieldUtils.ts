/** Shared field-patch UI for logistics / WMS multi-action cards. */

export type PatchFieldType =
  | "boolean"
  | "number"
  | "text"
  | "orientation"
  | "shape"
  | "stack_behavior";

export type PatchFieldDef = {
  key: string;
  label: string;
  hint?: string;
  type: PatchFieldType;
  min?: number;
  step?: number;
};

export type PatchFieldState = {
  enabled: boolean;
  value: string;
  boolValue: boolean;
};

export const ORIENTATION_OPTIONS = [
  { value: "any", label: "Dowolna" },
  { value: "upright", label: "Pionowo" },
  { value: "no_stack", label: "Bez stosowania" },
] as const;

export const SHAPE_OPTIONS = [
  { value: "box", label: "Prostopadłościan" },
  { value: "cylinder", label: "Walec" },
] as const;

export const STACK_BEHAVIOR_OPTIONS = [
  { value: "stackable", label: "Można układać w stos" },
  { value: "no_stack", label: "Nie układać w stos" },
] as const;

export function initialPatchFieldState(def: PatchFieldDef): PatchFieldState {
  if (def.type === "boolean") return { enabled: false, value: "", boolValue: true };
  if (def.type === "orientation") return { enabled: false, value: "any", boolValue: false };
  if (def.type === "shape") return { enabled: false, value: "box", boolValue: false };
  if (def.type === "stack_behavior") return { enabled: false, value: "stackable", boolValue: false };
  return { enabled: false, value: "", boolValue: false };
}

export function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function buildPatchSet(
  fields: PatchFieldDef[],
  state: Record<string, PatchFieldState>,
): { set: Record<string, unknown> } | { error: string } {
  const set: Record<string, unknown> = {};
  for (const def of fields) {
    const st = state[def.key];
    if (!st?.enabled) continue;
    if (def.type === "boolean") {
      set[def.key] = st.boolValue;
      continue;
    }
    if (def.type === "orientation" || def.type === "shape" || def.type === "stack_behavior") {
      set[def.key] = st.value;
      continue;
    }
    if (def.type === "text") {
      set[def.key] = st.value.trim();
      continue;
    }
    const num = parseDecimal(st.value);
    if (num == null) return { error: `Podaj wartość dla: ${def.label}` };
    if (def.min != null && num < def.min) return { error: `${def.label}: wartość musi być ≥ ${def.min}` };
    set[def.key] = num;
  }
  if (Object.keys(set).length === 0) return { error: "Zaznacz co najmniej jedno pole do aktualizacji." };
  return { set };
}

export function emptyPatchState(fields: PatchFieldDef[]): Record<string, PatchFieldState> {
  const init: Record<string, PatchFieldState> = {};
  for (const f of fields) init[f.key] = initialPatchFieldState(f);
  return init;
}
