import {
  activeBinsForRack,
  binVolumeDm3,
  buildRackOrderMap,
  getRackDisplayId,
} from "../components/warehouse/warehouseUtils";
import { normalizeInventoryLocationUuid } from "../pages/WarehouseDesigner/inventoryMaps";
import type { BinState, CustomRackTemplate, LayoutState, NormalizedStorageType, RackState } from "../types/warehouse";
import { normalizeStorageType } from "../utils/storageTypes";
import { resolvedLocationLabel } from "../utils/resolvedWarehouseLocation";

function normalizeBinLocationUuid(bin: BinState): string {
  const raw = (bin as { location_uuid?: string }).location_uuid ?? bin.locationUUID;
  return normalizeInventoryLocationUuid(raw);
}

function templateGroupKey(rack: RackState): string {
  return rack.templateId != null && String(rack.templateId).trim() !== ""
    ? String(rack.templateId).trim()
    : "__preset__";
}

type ReportBucket = "PRIMARY" | "RESERVE" | "DAMAGED" | "SHOP";

function bucketForStorageType(n: NormalizedStorageType): ReportBucket {
  if (n === "reserve") return "RESERVE";
  if (n === "damaged") return "DAMAGED";
  if (n === "pick") return "SHOP";
  if (n === "primary" || n === "buffer" || n === "unknown") return "PRIMARY";
  return "PRIMARY";
}

/**
 * Jedna ścieżka po wszystkich skrytkach: unikalne UUID (pierwsze wystąpienie), wolumen z binVolumeDm3,
 * typ magazynowania z pierwszego wystąpienia UUID, liczniki pominięć i duplikatów.
 */
function analyzeBins(layout: LayoutState): {
  lacznaObjetosc_dm3: number;
  iloscLokalizacji: number;
  pominieteSkrytkiBezUuid: number;
  zduplikowaneUuid: number;
  wedlugTypu: {
    PRIMARY: { liczba: number; objetosc_dm3: number };
    RESERVE: { liczba: number; objetosc_dm3: number };
    DAMAGED: { liczba: number; objetosc_dm3: number };
    SHOP: { liczba: number };
  };
} {
  const seenUuid = new Set<string>();
  let pominieteSkrytkiBezUuid = 0;
  let zduplikowaneUuid = 0;
  let lacznaObjetosc_dm3 = 0;

  const agg = {
    PRIMARY: { liczba: 0, objetosc_dm3: 0 },
    RESERVE: { liczba: 0, objetosc_dm3: 0 },
    DAMAGED: { liczba: 0, objetosc_dm3: 0 },
    SHOP: { liczba: 0 },
  };

  for (const rack of layout.racks ?? []) {
    for (const bin of activeBinsForRack(rack)) {
      const u = normalizeBinLocationUuid(bin);
      if (!u) {
        pominieteSkrytkiBezUuid += 1;
        continue;
      }
      if (seenUuid.has(u)) {
        zduplikowaneUuid += 1;
        continue;
      }
      seenUuid.add(u);

      const vol = binVolumeDm3(bin, rack);
      lacznaObjetosc_dm3 += vol;

      const bucket = bucketForStorageType(normalizeStorageType(bin.storage_type));
      if (bucket === "SHOP") {
        agg.SHOP.liczba += 1;
      } else {
        const b = agg[bucket];
        b.liczba += 1;
        b.objetosc_dm3 += vol;
      }
    }
  }

  const round2 = (x: number) => Number(x.toFixed(2));

  return {
    lacznaObjetosc_dm3: round2(lacznaObjetosc_dm3),
    iloscLokalizacji: seenUuid.size,
    pominieteSkrytkiBezUuid,
    zduplikowaneUuid,
    wedlugTypu: {
      PRIMARY: { liczba: agg.PRIMARY.liczba, objetosc_dm3: round2(agg.PRIMARY.objetosc_dm3) },
      RESERVE: { liczba: agg.RESERVE.liczba, objetosc_dm3: round2(agg.RESERVE.objetosc_dm3) },
      DAMAGED: { liczba: agg.DAMAGED.liczba, objetosc_dm3: round2(agg.DAMAGED.objetosc_dm3) },
      SHOP: { liczba: agg.SHOP.liczba },
    },
  };
}

function countRacksWithoutTemplate(layout: LayoutState): number {
  let n = 0;
  for (const rack of layout.racks ?? []) {
    const tid = rack.templateId;
    if (tid == null || String(tid).trim() === "") n += 1;
  }
  return n;
}

/**
 * Sumuje objętości skrytek (unikalne UUID, pierwsze wystąpienie) dla podanych regałów — wyłącznie binVolumeDm3, bez wzorów na poziomie regału.
 */
function sumBinVolumesDm3ForRacks(racks: RackState[]): number {
  const seen = new Set<string>();
  let sum = 0;
  for (const rack of racks) {
    for (const bin of activeBinsForRack(rack)) {
      const u = normalizeBinLocationUuid(bin);
      if (!u || seen.has(u)) continue;
      seen.add(u);
      sum += binVolumeDm3(bin, rack);
    }
  }
  return sum;
}

function countUniqueBinsForRacks(racks: RackState[]): number {
  const seen = new Set<string>();
  for (const rack of racks) {
    for (const bin of activeBinsForRack(rack)) {
      const u = normalizeBinLocationUuid(bin);
      if (u) seen.add(u);
    }
  }
  return seen.size;
}

function resolveTemplateDisplayName(templateKey: string, tplById: Map<string, CustomRackTemplate>): string {
  if (templateKey === "__preset__") return "Własna konfiguracja";
  const tpl = tplById.get(templateKey);
  return tpl?.name?.trim() ? tpl.name.trim() : "Własna konfiguracja";
}

function sortRacksForReport(racks: RackState[], layout: LayoutState): RackState[] {
  const orderMap = buildRackOrderMap(layout);
  return [...racks].sort((a, b) => {
    const ka = String(a.id ?? a.rack_index);
    const kb = String(b.id ?? b.rack_index);
    const oa = orderMap.get(ka);
    const ob = orderMap.get(kb);
    if (oa != null && ob != null && oa !== ob) return oa - ob;
    return getRackDisplayId(a, layout).localeCompare(getRackDisplayId(b, layout), "pl");
  });
}

/**
 * Jedna skrytka reprezentatywna: poziomy od góry, segmenty w poziomie — etykiety jak w aplikacji.
 */
function buildExampleAddressingForRack(
  rack: RackState,
  layout: LayoutState
): Array<{ poziomEtykieta: string; etykiety: string[] }> {
  const byLevel = new Map<number, BinState[]>();
  for (const bin of activeBinsForRack(rack)) {
    const li = bin.level_index;
    const arr = byLevel.get(li);
    if (arr) arr.push(bin);
    else byLevel.set(li, [bin]);
  }
  const levelIndices = [...byLevel.keys()].sort((a, b) => b - a);
  return levelIndices.map((li) => {
    const row = [...(byLevel.get(li) ?? [])].sort((a, b) => a.segment_index - b.segment_index);
    const etykiety = row
      .map((bin) => resolvedLocationLabel(rack, bin, layout).trim())
      .filter((s) => s.length > 0);
    return {
      poziomEtykieta: `Poziom ${li + 1}`,
      etykiety,
    };
  });
}

/** Pierwszy regał w kolejności layoutu — tylko do krótkiej „przykładowej adresacji” w raporcie przeglądowym. */
function buildPrzykladowaAdresacja(
  racks: RackState[],
  layout: LayoutState
): { poziomy: Array<{ poziomEtykieta: string; etykiety: string[] }> } | null {
  const sorted = sortRacksForReport(racks, layout);
  const first = sorted[0];
  if (!first) return null;
  const poziomy = buildExampleAddressingForRack(first, layout);
  return poziomy.length > 0 ? { poziomy } : null;
}

export type WarehouseStructureReportData = {
  /** Nagłówki i identyfikacja — etykiety po polsku (wartości techniczne: nazwy z layoutu). */
  informacjeMagazynu: {
    nazwa: string;
    nazwaLayoutu: string;
  };
  budynek: {
    szerokosc_m: number | null;
    glebokosc_m: number | null;
    wysokosc_m: number | null;
    powierzchnia_m2: number | null;
    objetosc_m3: number | null;
  };
  pojemnosc: {
    /** Ilość lokalizacji (unikalne location_uuid). */
    iloscLokalizacji: number;
    /** Łączna objętość skrytek (dm³). */
    lacznaObjetosc_dm3: number;
    /** Skrytki bez UUID — wyłączone z liczby lokalizacji i sumy objętości. */
    pominieteSkrytkiBezUuid: number;
    wedlugTypuMagazynowania: {
      PRIMARY: { liczba: number; objetosc_dm3: number };
      RESERVE: { liczba: number; objetosc_dm3: number };
      DAMAGED: { liczba: number; objetosc_dm3: number };
      /** Sklepowe (store) — tylko liczba lokalizacji. */
      SHOP: { liczba: number };
    };
  };
  szablony: Array<{
    idSzablonu: string;
    nazwa: string;
    liczbaRegalow: number;
    wymiary_cm: { szerokosc: number; glebokosc: number; wysokosc: number };
    lacznaObjetoscRegalow_dm3: number;
    liczbaPoziomow: number;
    sredniaLokalizacjiNaRegal: number;
    /** Jedna przykładowa siatka etykiet (pierwszy regał grupy), bez pełnej listy magazynu. */
    przykladowaAdresacja: { poziomy: Array<{ poziomEtykieta: string; etykiety: string[] }> } | null;
  }>;
  jakoscDanych: {
    pominieteSkrytkiBezUuid: number;
    zduplikowaneUuid: number;
    regalyBezSzablonu: number;
  };
};

function buildingSection(layout: LayoutState): WarehouseStructureReportData["budynek"] {
  const szerokosc_m = layout.building_width_m ?? null;
  const glebokosc_m = layout.building_depth_m ?? null;
  const wysokosc_m = layout.building_height_m ?? null;
  const powierzchnia_m2 =
    szerokosc_m != null && glebokosc_m != null && szerokosc_m >= 0 && glebokosc_m >= 0
      ? szerokosc_m * glebokosc_m
      : null;
  const objetosc_m3 =
    szerokosc_m != null &&
    glebokosc_m != null &&
    wysokosc_m != null &&
    szerokosc_m >= 0 &&
    glebokosc_m >= 0 &&
    wysokosc_m >= 0
      ? szerokosc_m * glebokosc_m * wysokosc_m
      : null;
  return { szerokosc_m, glebokosc_m, wysokosc_m, powierzchnia_m2, objetosc_m3 };
}

function templatesSection(
  layout: LayoutState,
  customTemplates: CustomRackTemplate[]
): WarehouseStructureReportData["szablony"] {
  const tplById = new Map(customTemplates.map((t) => [t.id, t]));
  const groups = new Map<string, RackState[]>();
  for (const rack of layout.racks ?? []) {
    const key = templateGroupKey(rack);
    const arr = groups.get(key);
    if (arr) arr.push(rack);
    else groups.set(key, [rack]);
  }

  const rows: WarehouseStructureReportData["szablony"] = [];

  for (const [templateKey, racks] of groups) {
    const liczbaRegalow = racks.length;
    const pierwszy = racks[0]!;
    /** Wymiary wyłącznie z instancji regału na mapie (nie z katalogu szablonów). */
    const szerokosc = Math.round(pierwszy.width_cm);
    const glebokosc = Math.round(pierwszy.length_cm);
    const wysokosc = Math.round(pierwszy.height_cm);

    const lacznaObjetoscRegalow_dm3 = Number(sumBinVolumesDm3ForRacks(racks).toFixed(2));
    const unikalneSkrytki = countUniqueBinsForRacks(racks);
    const sredniaLokalizacjiNaRegal =
      liczbaRegalow > 0 ? Number((unikalneSkrytki / liczbaRegalow).toFixed(4)) : 0;

    const liczbaPoziomow = pierwszy.levels;

    const przykladowaAdresacja = buildPrzykladowaAdresacja(racks, layout);

    rows.push({
      idSzablonu: templateKey,
      nazwa: resolveTemplateDisplayName(templateKey, tplById),
      liczbaRegalow,
      wymiary_cm: { szerokosc, glebokosc, wysokosc },
      lacznaObjetoscRegalow_dm3,
      liczbaPoziomow,
      sredniaLokalizacjiNaRegal,
      przykladowaAdresacja,
    });
  }

  rows.sort((a, b) => a.nazwa.localeCompare(b.nazwa, "pl"));
  return rows;
}

export type BuildWarehouseStructureReportDataInput = {
  layout: LayoutState;
  /** Katalog szablonów — wyłącznie do nazwy wyświetlanej, gdy idSzablonu istnieje w mapie. */
  customTemplates?: CustomRackTemplate[];
};

/**
 * Dane pod raport struktury magazynu: layout + szablony, bez stanów magazynowych.
 * Objętość skrytki: `binVolumeDm3` (wymiary skrytki jeśli są, w przeciwnym razie volume_dm3).
 */
export function buildWarehouseStructureReportData(
  input: BuildWarehouseStructureReportDataInput
): WarehouseStructureReportData {
  const { layout } = input;
  const customTemplates = input.customTemplates ?? [];

  const rawWarehouse = layout.warehouse_name ?? "";
  const nazwa = String(rawWarehouse).trim() || String(layout.name ?? "").trim() || "Magazyn";

  const binAnalysis = analyzeBins(layout);
  const regalyBezSzablonu = countRacksWithoutTemplate(layout);

  return {
    informacjeMagazynu: {
      nazwa,
      nazwaLayoutu: String(layout.name ?? "").trim() || nazwa,
    },
    budynek: buildingSection(layout),
    pojemnosc: {
      iloscLokalizacji: binAnalysis.iloscLokalizacji,
      lacznaObjetosc_dm3: binAnalysis.lacznaObjetosc_dm3,
      pominieteSkrytkiBezUuid: binAnalysis.pominieteSkrytkiBezUuid,
      wedlugTypuMagazynowania: binAnalysis.wedlugTypu,
    },
    szablony: templatesSection(layout, customTemplates),
    jakoscDanych: {
      pominieteSkrytkiBezUuid: binAnalysis.pominieteSkrytkiBezUuid,
      zduplikowaneUuid: binAnalysis.zduplikowaneUuid,
      regalyBezSzablonu,
    },
  };
}
