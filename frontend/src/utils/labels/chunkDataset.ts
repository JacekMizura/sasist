/**
 * Record-generation helper: split a flat list into multiple label payloads for repeater datasets.
 * Does not alter layout / repeater logic — only shapes the `record` passed to renderLabel / PDF.
 *
 * @example
 * const items = Array.from({ length: 27 }, (_, i) => ({ loc_name: `A-${i + 1}` }));
 * const records = chunkDataset(items, 3, "levels");
 * // 9 records; each: { loc_name, levels: [ {...}, {...}, {...} ] }
 */
export function chunkDataset(
  items: Record<string, unknown>[],
  chunkSize: number,
  datasetKey: string
): Record<string, unknown>[] {
  const key = (datasetKey || "locations").trim() || "locations";
  const size = Math.max(1, Math.floor(chunkSize));
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size).map((row) => ({ ...row }));
    const first = slice[0] ?? {};
    out.push({
      ...first,
      [key]: slice,
    });
  }
  return out;
}
