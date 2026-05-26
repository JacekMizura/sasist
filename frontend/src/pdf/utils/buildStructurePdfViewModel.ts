import { getRackDisplayId } from "../../components/warehouse/warehouseUtils";
import type { CustomRackTemplate, LayoutState, RackState } from "../../types/warehouse";

export type StructurePdfMapRack = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  /** Kolor wypełnienia z regału lub szablonu katalogowego. */
  fillColor: string;
};

/** Legenda: kolor przypisany do nazwy grupy szablonu (jak na mapie). */
export type StructurePdfMapLegendItem = {
  kolor: string;
  nazwaSzablonu: string;
};

export type StructurePdfMapPayload = {
  gridCols: number;
  gridRows: number;
  racks: StructurePdfMapRack[];
  legenda: StructurePdfMapLegendItem[];
};

const DEFAULT_RACK_COLOR = "#94a3b8";

function templateGroupKey(rack: RackState): string {
  return rack.templateId != null && String(rack.templateId).trim() !== ""
    ? String(rack.templateId).trim()
    : "__preset__";
}

function nazwaSzablonuDlaGrupy(klucz: string, tplById: Map<string, CustomRackTemplate>): string {
  if (klucz === "__preset__") return "Własna konfiguracja";
  const tpl = tplById.get(klucz);
  return tpl?.name?.trim() ? tpl.name.trim() : "Własna konfiguracja";
}

/**
 * Dane wyłącznie do rysunku planu w PDF: pozycje regałów w siatce + kolory z szablonów + legenda.
 * Bez zmiany danych magazynowych — tylko odczyt z layoutu.
 */
export function buildStructurePdfMapPayload(
  layout: LayoutState,
  customTemplates: CustomRackTemplate[]
): StructurePdfMapPayload {
  const tplById = new Map(customTemplates.map((t) => [t.id, t]));
  const racks: StructurePdfMapRack[] = (layout.racks ?? []).map((r) => {
    const tid = r.templateId;
    const tpl = tid ? tplById.get(tid) : undefined;
    const fillColor = (typeof r.color === "string" && r.color.trim() ? r.color : tpl?.color) ?? DEFAULT_RACK_COLOR;
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      label: getRackDisplayId(r, layout),
      fillColor,
    };
  });

  const pierwszyKolorGrupy = new Map<string, string>();
  for (const r of layout.racks ?? []) {
    const key = templateGroupKey(r);
    if (pierwszyKolorGrupy.has(key)) continue;
    const tid = r.templateId;
    const tpl = tid ? tplById.get(tid) : undefined;
    const fillColor = (typeof r.color === "string" && r.color.trim() ? r.color : tpl?.color) ?? DEFAULT_RACK_COLOR;
    pierwszyKolorGrupy.set(key, fillColor);
  }

  const legenda: StructurePdfMapLegendItem[] = [...pierwszyKolorGrupy.entries()].map(([klucz, kolor]) => ({
    kolor,
    nazwaSzablonu: nazwaSzablonuDlaGrupy(klucz, tplById),
  }));
  legenda.sort((a, b) => a.nazwaSzablonu.localeCompare(b.nazwaSzablonu, "pl"));

  return {
    gridCols: Math.max(1, layout.grid_cols),
    gridRows: Math.max(1, layout.grid_rows),
    racks,
    legenda,
  };
}
