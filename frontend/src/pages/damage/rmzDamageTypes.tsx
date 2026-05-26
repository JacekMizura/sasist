import type { ReactNode } from "react";

/** Wiersz z API konfiguracji zwrotów (`damage_reasons`). */
export type RmzDamageReasonRow = { class_code: string; code: string; label: string };

/** Stable codes for analytics (prefix = class). */
export const RMZ_DAMAGE_TYPE_B_IDS = [
  "b_scratches",
  "b_soiling",
  "b_no_packaging",
  "b_no_label",
  "b_missing_small",
] as const;

export const RMZ_DAMAGE_TYPE_C_IDS = [
  "c_damaged",
  "c_destroyed",
  "c_flood_stain",
  "c_incomplete_main",
  "c_odor_hygiene",
] as const;

export type RmzDamageTypeIdB = (typeof RMZ_DAMAGE_TYPE_B_IDS)[number];
export type RmzDamageTypeIdC = (typeof RMZ_DAMAGE_TYPE_C_IDS)[number];
export type RmzDamageTypeId = RmzDamageTypeIdB | RmzDamageTypeIdC;

export const RMZ_DAMAGE_CLASS_B_TOOLTIP =
  "Klasa B: produkt nadaje się do outletu — kosmetyczne lub drobne ubytki, bez utraty funkcji głównej.";

export const RMZ_DAMAGE_CLASS_C_TOOLTIP =
  "Klasa C: poważne uszkodzenie lub brak kluczowej części — naprawa, utylizacja lub zwrot do dostawcy.";

const B_OPTIONS: { id: RmzDamageTypeIdB; label: string }[] = [
  { id: "b_scratches", label: "Rysy / zadrapania" },
  { id: "b_soiling", label: "Zabrudzenia" },
  { id: "b_no_packaging", label: "Brak opakowania" },
  { id: "b_no_label", label: "Brak metki" },
  { id: "b_missing_small", label: "Brak drobnego elementu" },
];

const C_OPTIONS: { id: RmzDamageTypeIdC; label: string }[] = [
  { id: "c_damaged", label: "Produkt uszkodzony" },
  { id: "c_destroyed", label: "Produkt zniszczony" },
  { id: "c_flood_stain", label: "Zalany / trwałe zabrudzenie" },
  { id: "c_incomplete_main", label: "Niekompletny (brak głównego elementu)" },
  { id: "c_odor_hygiene", label: "Zapach / higiena" },
];

const ALL_KNOWN = new Set<string>([...RMZ_DAMAGE_TYPE_B_IDS, ...RMZ_DAMAGE_TYPE_C_IDS]);

function effectiveDamageTypeAllowlist(reasonRows?: RmzDamageReasonRow[] | null): Set<string> {
  const s = new Set<string>(ALL_KNOWN);
  if (reasonRows?.length) {
    for (const r of reasonRows) {
      const c = String(r.code ?? "").trim();
      if (c) s.add(c);
    }
  }
  return s;
}

function dynamicOptionsForClass(cls: "B" | "C", reasonRows?: RmzDamageReasonRow[] | null): { id: string; label: string }[] | null {
  if (!reasonRows?.length) return null;
  const rows = reasonRows
    .filter((r) => String(r.class_code).trim() === cls)
    .map((r) => ({ id: String(r.code).trim(), label: String(r.label ?? "").trim() || String(r.code).trim() }))
    .filter((r) => r.id.length > 0);
  return rows.length ? rows : null;
}

export function rmzDamageTypeLabel(id: string, reasonRows?: RmzDamageReasonRow[] | null): string {
  if (reasonRows?.length) {
    const hit = reasonRows.find((r) => String(r.code).trim() === String(id).trim());
    if (hit?.label?.trim()) return hit.label.trim();
  }
  const b = B_OPTIONS.find((o) => o.id === id);
  if (b) return b.label;
  const c = C_OPTIONS.find((o) => o.id === id);
  if (c) return c.label;
  return id;
}

export function rmzDamageTypesForClass(cls: "B" | "C"): { id: RmzDamageTypeId; label: string }[] {
  return cls === "B" ? [...B_OPTIONS] : [...C_OPTIONS];
}

/** Opcje widoczne w WMS — dynamiczne z konfiguracji albo domyślny zestaw. */
export function rmzDamageTypesForClassResolved(cls: "B" | "C", reasonRows?: RmzDamageReasonRow[] | null): { id: string; label: string }[] {
  const dyn = dynamicOptionsForClass(cls, reasonRows);
  return dyn ?? rmzDamageTypesForClass(cls).map((o) => ({ id: o.id, label: o.label }));
}

export function isRmzDamageTypeIdForClass(cls: "B" | "C", id: string): id is RmzDamageTypeId {
  return cls === "B" ? id.startsWith("b_") : id.startsWith("c_");
}

/** Zachowaj identyfikatory przypisane do klasy B lub C (wg konfiguracji lub domyślnie wg prefiksów). */
export function filterRmzDamageTypeIdsForClass(
  cls: "B" | "C",
  ids: string[],
  reasonRows?: RmzDamageReasonRow[] | null,
): RmzDamageTypeId[] {
  const dyn = dynamicOptionsForClass(cls, reasonRows);
  const allowed = new Set<string>((dyn ?? rmzDamageTypesForClass(cls)).map((o) => o.id));
  const out: RmzDamageTypeId[] = [];
  for (const id of ids) {
    if (allowed.has(id)) out.push(id as RmzDamageTypeId);
  }
  return out;
}

export function encodeRmzDamageTypePayload(ids: string[], reasonRows?: RmzDamageReasonRow[] | null): string {
  const allow = effectiveDamageTypeAllowlist(reasonRows);
  const uniq = Array.from(new Set(ids.map((x) => String(x).trim()).filter((x) => allow.has(x))));
  uniq.sort();
  return uniq.join(",");
}

export function decodeRmzDamageTypePayload(raw: string | null | undefined, reasonRows?: RmzDamageReasonRow[] | null): string[] {
  const allow = effectiveDamageTypeAllowlist(reasonRows);
  if (raw == null || String(raw).trim() === "") return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && allow.has(s));
}

export function mergeRmzDamageTypePayloadFromUnits(
  rows: { decision: string | null; damageTypeIds: string[] }[],
  reasonRows?: RmzDamageReasonRow[] | null,
): string {
  const allow = effectiveDamageTypeAllowlist(reasonRows);
  const bag = new Set<string>();
  for (const r of rows) {
    if (r.decision !== "DAMAGED") continue;
    for (const id of r.damageTypeIds) {
      const k = String(id).trim();
      if (allow.has(k)) bag.add(k);
    }
  }
  return encodeRmzDamageTypePayload([...bag], reasonRows);
}

type RmzDamageTypeChipsProps = {
  damageClass: "B" | "C";
  selectedIds: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
  className?: string;
  /** Konfiguracja z `/wms/return-module/config` — kontroluje widoczne typy i etykiety. */
  reasonRows?: RmzDamageReasonRow[] | null;
};

export function RmzDamageTypeChips({
  damageClass,
  selectedIds,
  onToggle,
  disabled,
  className,
  reasonRows,
}: RmzDamageTypeChipsProps): ReactNode {
  const opts = rmzDamageTypesForClassResolved(damageClass, reasonRows);
  const sel = new Set(selectedIds);
  return (
    <div className={className ?? ""}>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">Typ uszkodzenia (wielokrotny wybór)</p>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => {
          const on = sel.has(o.id);
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              title={o.label}
              className={`min-h-[40px] rounded-full border-2 px-3 py-2 text-left text-xs font-semibold leading-snug transition disabled:cursor-not-allowed disabled:opacity-50 ${
                on
                  ? "border-amber-700 bg-amber-600 text-white shadow-sm ring-1 ring-amber-900/30"
                  : "border-slate-200 bg-white text-slate-800 hover:border-amber-300 hover:bg-amber-50"
              }`}
              onClick={() => onToggle(o.id)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
