import type { ReturnDamageClassDto, ReturnProductDecisionDto } from "../../../types/returnModuleConfig";
import type { ReturnStatusType } from "../../../types/wmsReturn";

const DAMAGE_CODE_FALLBACK: Record<string, string> = {
  b: "Lekkie uszkodzenia",
  c: "Poważne uszkodzenia",
  a: "Uszkodzenia minimalne",
};

export function damageClassDisplayLabel(cls: ReturnDamageClassDto): string {
  const code = cls.code.trim().toLowerCase();
  if (DAMAGE_CODE_FALLBACK[code]) return DAMAGE_CODE_FALLBACK[code];
  const label = cls.label.trim();
  if (/^klasa\s+[a-z]$/i.test(label)) return DAMAGE_CODE_FALLBACK[code] ?? label;
  return label || cls.code;
}

export function productDecisionEffects(row: ReturnProductDecisionDto): string[] {
  const lines: string[] = [];
  if (row.is_active) {
    lines.push(row.visible_wms ? "✓ Widoczna dla magazyniera" : "✕ Ukryta przed magazynem");
  } else {
    lines.push("✕ Decyzja nieaktywna");
    return lines;
  }
  if (row.category === "REJECTED") {
    lines.push(
      row.creates_stock_document
        ? "✓ Przyjmij produkt na magazyn (PZ ze zwrotu)"
        : "✕ Nie przyjmuje produktu na stan",
    );
  } else {
    lines.push("✓ Przyjmuje produkt w procesie zwrotu");
  }
  return lines;
}

export const RMZ_COLOR_OPTIONS = [
  { value: "blue", label: "Niebieski", badge: "bg-blue-100 text-blue-800 ring-blue-200" },
  { value: "green", label: "Zielony", badge: "bg-green-100 text-green-800 ring-green-200" },
  { value: "emerald", label: "Szmaragdowy", badge: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  { value: "amber", label: "Bursztynowy", badge: "bg-amber-100 text-amber-900 ring-amber-200" },
  { value: "orange", label: "Pomarańczowy", badge: "bg-orange-100 text-orange-900 ring-orange-200" },
  { value: "red", label: "Czerwony", badge: "bg-red-100 text-red-800 ring-red-200" },
  { value: "rose", label: "Różowy", badge: "bg-rose-100 text-rose-800 ring-rose-200" },
  { value: "violet", label: "Fioletowy", badge: "bg-violet-100 text-violet-800 ring-violet-200" },
  { value: "cyan", label: "Cyjan", badge: "bg-cyan-100 text-cyan-900 ring-cyan-200" },
  { value: "lime", label: "Limonkowy", badge: "bg-lime-100 text-lime-900 ring-lime-200" },
  { value: "slate", label: "Szary", badge: "bg-slate-100 text-slate-800 ring-slate-200" },
  { value: "fuchsia", label: "Fuksja", badge: "bg-fuchsia-100 text-fuchsia-900 ring-fuchsia-200" },
] as const;

export function rmzColorBadgeClass(color: string): string {
  return RMZ_COLOR_OPTIONS.find((c) => c.value === color)?.badge ?? "bg-slate-100 text-slate-800 ring-slate-200";
}

export function rmzColorLabelPl(color: string): string {
  return RMZ_COLOR_OPTIONS.find((c) => c.value === color)?.label ?? color;
}

export const RMZ_TYPE_OPTIONS: { value: ReturnStatusType; label: string; hint: string }[] = [
  { value: "in_progress", label: "Etap w trakcie", hint: "Zwrot jest nadal obsługiwany." },
  { value: "done_success", label: "Zakończony pomyślnie", hint: "Proces zakończony — rozliczenie OK." },
  { value: "done_rejected", label: "Odrzucony / zamknięty negatywnie", hint: "Zwrot zamknięty bez pełnego przyjęcia." },
];

export function rmzTypeLabelPl(type: ReturnStatusType): string {
  return RMZ_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}
