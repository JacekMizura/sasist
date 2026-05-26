import type { LayoutState } from "../../types/warehouse";
import { activeBinsForRack } from "../../components/warehouse/warehouseUtils";

export function exportCsv(layout: LayoutState): void {
  const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const headers = ["id", "aisle_letter", "rack_index", "x", "y", "width", "height", "width_cm", "length_cm", "height_cm", "levels", "bins_per_level"];
  const rows = layout.racks.map((r) =>
    headers.map((h) => escape(String((r as Record<string, unknown>)[h] ?? ""))).join(",")
  );
  const csv = "\uFEFF" + headers.join(",") + "\r\n" + rows.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `layout-${(layout.name || "export").replace(/\s+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportLocationsMapCsv(layout: LayoutState): void {
  const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const headers = ["locationUUID", "name", "capacity_dm3"];
  const rows: string[] = [];
  for (const rack of layout.racks) {
    for (const bin of activeBinsForRack(rack)) {
      const uuid = (bin as { locationUUID?: string }).locationUUID ?? (bin as { location_uuid?: string }).location_uuid ?? "";
      const name = (bin as { label?: string }).label ?? (bin as { location_id?: string }).location_id ?? uuid;
      const capacity = (bin as { volume_dm3?: number }).volume_dm3 ?? 0;
      rows.push([escape(uuid), escape(String(name)), String(capacity)].join(","));
    }
  }
  const csv = "\uFEFF" + headers.join(",") + "\r\n" + rows.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mapa-lokalizacji-${(layout.name || "export").replace(/\s+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportJson(layout: LayoutState): void {
  const json = JSON.stringify({ ...layout, updatedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `layout-${(layout.name || "export").replace(/\s+/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
