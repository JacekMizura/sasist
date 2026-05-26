/**
 * Client-side preview of CSV label grouping — mirrors backend
 * `label_record_grouping` (merge by row / floor_sets) so the list matches the PDF merge.
 */

export const CSV_GROUPING_PREVIEW_LIMIT = 10;

const MAX_GROUP_SLOTS = 3;

/** Chip UI / in-memory groups → same shape as successful `parseCsvFloorSets` (trimmed; merge uppercases). */
export function sanitizeFloorSetsMatrix(groups: string[][]): string[][] {
  const out: string[][] = [];
  for (const g of groups) {
    if (!Array.isArray(g)) continue;
    const floors = g.map((x) => String(x).trim()).filter((s) => s.length > 0);
    if (floors.length > 0) out.push(floors);
  }
  return out;
}

/** JSON e.g. `[["C","G","H"],["A","B"]]` → non-empty groups (trimmed; uppercasing happens in merge). */
export function parseCsvFloorSets(raw: string): { ok: true; value: string[][] } | { ok: false; message: string } {
  const t = raw.trim();
  if (!t) return { ok: true, value: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(t) as unknown;
  } catch {
    return { ok: false, message: "Zestawy pięter: nieprawidłowy JSON." };
  }
  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      message: 'Zestawy pięter: oczekiwano tablicy tablic (np. [["C","G","H"],["A","B"]]).',
    };
  }
  const out: string[][] = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const g = parsed[i];
    if (!Array.isArray(g)) {
      return { ok: false, message: `Zestawy pięter: element ${i + 1} musi być tablicą.` };
    }
    const floors = g
      .map((x) => String(x).trim())
      .filter((s) => s.length > 0);
    if (floors.length > 0) out.push(floors);
  }
  return { ok: true, value: out };
}

function normalizeFloorSetsParam(raw: string[][]): string[][] {
  const out: string[][] = [];
  for (const grp of raw) {
    const ng = grp.map((f) => String(f).trim().toUpperCase()).filter((f) => f.length > 0);
    if (ng.length > 0) out.push(ng);
  }
  return out;
}

function recordHasRepeaterLocations(rec: Record<string, unknown>): boolean {
  const loc = rec.locations;
  return Array.isArray(loc) && loc.length > 0;
}

function recordFloorKey(rec: Record<string, unknown>): string {
  return String(rec.floor ?? "")
    .trim()
    .toUpperCase();
}

function barcodeForSlot(rec: Record<string, unknown>): string {
  const v =
    rec.barcode_data ?? rec.loc_barcode ?? rec.location_barcode ?? rec.barcode;
  return v != null ? String(v).trim() : "";
}

function locNameForSlot(rec: Record<string, unknown>): string {
  const v = rec.loc_name ?? rec.location_name ?? rec.location_code;
  return v != null ? String(v).trim() : "";
}

function physRowRackKey(
  rec: Record<string, unknown>,
  byRack: boolean,
  missingRowCounter: { n: number },
): string[] {
  let row = String(rec.row ?? "").trim();
  if (!row) {
    missingRowCounter.n += 1;
    row = `__row_missing_${missingRowCounter.n}`;
  }
  if (byRack) {
    const rack = String(rec.rack_name ?? "").trim();
    return [rack, row];
  }
  return [row];
}

function applyRowRackToBase(
  base: Record<string, unknown>,
  key: string[],
  slots: Record<string, unknown>[],
  byRack: boolean,
): void {
  if (byRack && key.length >= 2) {
    base.rack_name = key[0];
    const rowK = key[1];
    base.row = String(rowK).startsWith("__row_missing_")
      ? String(slots[0]?.row ?? "")
      : String(rowK);
  } else if (key.length >= 1) {
    const rk = key[0];
    if (String(rk).startsWith("__row_missing_")) {
      base.row = String(slots[0]?.row ?? "");
    } else {
      base.row = String(rk);
    }
  }
}

function singleUnmatchedMerged(rec: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = { ...rec };
  const bc = barcodeForSlot(rec);
  const ln = locNameForSlot(rec);
  base.floor_set = [];
  base.floor_set_id = null;
  base.set = [];
  base.items = [
    {
      floor: String(rec.floor ?? "").trim() || null,
      barcode_data: bc ? bc : null,
      loc_name: ln ? ln : null,
    },
  ];
  base.floor_1 = String(rec.floor ?? "");
  base.barcode_1 = bc;
  base.loc_name_1 = ln;
  base.floor_2 = null;
  base.barcode_2 = null;
  base.loc_name_2 = null;
  base.floor_3 = null;
  base.barcode_3 = null;
  base.loc_name_3 = null;
  return base;
}

function mergeRecordsByFloorSets(
  records: Record<string, unknown>[],
  floorSets: string[][],
  byRack: boolean,
): Record<string, unknown>[] {
  const normSets = normalizeFloorSetsParam(floorSets);
  if (!records.length || !normSets.length) return records;
  if (records.some((r) => typeof r !== "object" || r === null)) return records;
  if (records.some((r) => recordHasRepeaterLocations(r as Record<string, unknown>))) return records;

  const floorToSid = new Map<string, number>();
  normSets.forEach((floors, sid) => {
    for (const fl of floors) {
      if (!floorToSid.has(fl)) floorToSid.set(fl, sid);
    }
  });

  const missingRowCounter = { n: 0 };
  type BucketKey = string;
  const keyStr = (parts: (string | number)[]) => parts.join("\u0000");
  const buckets = new Map<BucketKey, Record<string, unknown>[]>();
  const unmatched: Record<string, unknown>[] = [];

  for (const rec of records) {
    const r = rec as Record<string, unknown>;
    const flk = recordFloorKey(r);
    const sid = floorToSid.get(flk);
    if (sid === undefined) {
      unmatched.push(r);
      continue;
    }
    const pk = physRowRackKey(r, byRack, missingRowCounter);
    const bk = keyStr([...pk, sid]);
    if (!buckets.has(bk)) buckets.set(bk, []);
    buckets.get(bk)!.push(r);
  }

  const sortedKeys = [...buckets.keys()].sort((a, b) => a.localeCompare(b));
  const merged: Record<string, unknown>[] = [];

  for (const bk of sortedKeys) {
    const members = buckets.get(bk)!;
    const sid = Number(bk.split("\u0000").pop());
    const setDef = normSets[sid];
    const byFl = new Map<string, Record<string, unknown>>();
    for (const m of members) {
      byFl.set(recordFloorKey(m), m);
    }
    const firstRec =
      setDef.map((fl) => byFl.get(fl)).find(Boolean) ?? members[0];
    const base: Record<string, unknown> = { ...firstRec };
    const pkParts = bk.split("\u0000").slice(0, -1);
    applyRowRackToBase(base, pkParts, members, byRack);

    const groupItems: Record<string, unknown>[] = [];
    for (const fl of setDef) {
      const rr = byFl.get(fl);
      if (rr) {
        const bc = barcodeForSlot(rr);
        const ln = locNameForSlot(rr);
        groupItems.push({
          floor: String(rr.floor ?? "").trim() || fl,
          barcode_data: bc ? bc : null,
          loc_name: ln ? ln : null,
        });
      } else {
        groupItems.push({ floor: fl, barcode_data: null, loc_name: null });
      }
    }

    base.floor_set = [...setDef];
    base.floor_set_id = sid;
    base.set = [...setDef];
    base.items = groupItems;

    for (let i = 0; i < Math.min(setDef.length, MAX_GROUP_SLOTS); i += 1) {
      const n = i + 1;
      const fl = setDef[i];
      const rr = byFl.get(fl);
      if (rr) {
        base[`floor_${n}`] = String(rr.floor ?? "");
        base[`barcode_${n}`] = barcodeForSlot(rr);
        base[`loc_name_${n}`] = locNameForSlot(rr);
      } else {
        base[`floor_${n}`] = null;
        base[`barcode_${n}`] = null;
        base[`loc_name_${n}`] = null;
      }
    }

    merged.push(base);
  }

  for (const rec of unmatched) {
    merged.push(singleUnmatchedMerged(rec));
  }

  return merged;
}

function mergeRecordsByRowMultiSlot(
  records: Record<string, unknown>[],
  byRack: boolean,
): Record<string, unknown>[] {
  if (!records.length) return records;
  if (records.some((r) => typeof r !== "object" || r === null)) return records;
  if (records.some((r) => recordHasRepeaterLocations(r as Record<string, unknown>))) return records;

  const missingRowCounter = { n: 0 };
  function groupKey(rec: Record<string, unknown>): string[] {
    let row = String(rec.row ?? "").trim();
    if (!row) {
      missingRowCounter.n += 1;
      row = `__row_missing_${missingRowCounter.n}`;
    }
    if (byRack) {
      const rack = String(rec.rack_name ?? "").trim();
      return [rack, row];
    }
    return [row];
  }

  const keyStr = (parts: string[]) => parts.join("\u0000");
  const buckets = new Map<string, Record<string, unknown>[]>();
  for (const rec of records) {
    const r = rec as Record<string, unknown>;
    const k = keyStr(groupKey(r));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r);
  }

  const merged: Record<string, unknown>[] = [];
  const sortedKeys = [...buckets.keys()].sort((a, b) => a.localeCompare(b));

  for (const k of sortedKeys) {
    const members = buckets.get(k)!;
    members.sort((a, b) => {
      const fa = String(a.floor ?? "").toLowerCase();
      const fb = String(b.floor ?? "").toLowerCase();
      if (fa !== fb) return fa.localeCompare(fb);
      return locNameForSlot(a).toLowerCase().localeCompare(locNameForSlot(b).toLowerCase());
    });
    const slots = members.slice(0, MAX_GROUP_SLOTS);
    const base: Record<string, unknown> = { ...slots[0] };
    const keyParts = k.split("\u0000");

    if (byRack && keyParts.length >= 2) {
      base.rack_name = keyParts[0];
      const rowK = keyParts[1];
      base.row = String(rowK).startsWith("__row_missing_")
        ? String(slots[0]?.row ?? "")
        : String(rowK);
    } else if (keyParts.length >= 1) {
      const rk = keyParts[0];
      if (String(rk).startsWith("__row_missing_")) {
        base.row = String(slots[0]?.row ?? "");
      } else {
        base.row = String(rk);
      }
    }

    for (let i = 0; i < MAX_GROUP_SLOTS; i += 1) {
      const n = i + 1;
      if (i < slots.length) {
        const s = slots[i];
        base[`floor_${n}`] = String(s.floor ?? "");
        base[`barcode_${n}`] = barcodeForSlot(s);
        base[`loc_name_${n}`] = locNameForSlot(s);
      } else {
        base[`floor_${n}`] = null;
        base[`barcode_${n}`] = null;
        base[`loc_name_${n}`] = null;
      }
    }

    merged.push(base);
  }

  return merged;
}

function floorsForPreviewLine(rec: Record<string, unknown>): string[] {
  if (Array.isArray(rec.items)) {
    return (rec.items as { floor?: unknown }[])
      .map((it) => String(it?.floor ?? "").trim())
      .filter((s) => s.length > 0);
  }
  const out: string[] = [];
  for (let n = 1; n <= MAX_GROUP_SLOTS; n += 1) {
    const f = rec[`floor_${n}`];
    if (f != null && String(f).trim()) out.push(String(f).trim());
  }
  return out;
}

export function formatCsvGroupingPreviewLine(rec: Record<string, unknown>, byRack: boolean): string {
  const row = String(rec.row ?? "").trim() || "—";
  const rack = String(rec.rack_name ?? "").trim();
  const floors = floorsForPreviewLine(rec);
  const floorsStr = floors.length > 0 ? floors.join(", ") : "—";
  if (byRack && rack) {
    return `Regał ${rack} — Rząd ${row} → ${floorsStr} (1 etykieta)`;
  }
  return `Rząd ${row} → ${floorsStr} (1 etykieta)`;
}

export type CsvGroupingPreviewResult =
  | { kind: "ok"; lines: string[]; totalLabels: number; truncated: boolean }
  | { kind: "skipped_repeater"; message: string }
  | { kind: "empty"; message: string };

export function getCsvGroupingPreview(
  records: Record<string, unknown>[],
  options: { byRack: boolean; floorSets: string[][] },
): CsvGroupingPreviewResult {
  if (!records.length) {
    return { kind: "empty", message: "Brak wierszy po mapowaniu i filtrach." };
  }
  if (records.some((r) => recordHasRepeaterLocations(r))) {
    return {
      kind: "skipped_repeater",
      message: "Grupowanie zostanie pominięte (rekordy z locations — inna ścieżka PDF).",
    };
  }

  const normSets = normalizeFloorSetsParam(options.floorSets);
  const merged =
    normSets.length > 0
      ? mergeRecordsByFloorSets(records, options.floorSets, options.byRack)
      : mergeRecordsByRowMultiSlot(records, options.byRack);

  const totalLabels = merged.length;
  const slice = merged.slice(0, CSV_GROUPING_PREVIEW_LIMIT);
  const lines = slice.map((rec) => formatCsvGroupingPreviewLine(rec as Record<string, unknown>, options.byRack));
  return {
    kind: "ok",
    lines,
    totalLabels,
    truncated: totalLabels > CSV_GROUPING_PREVIEW_LIMIT,
  };
}
