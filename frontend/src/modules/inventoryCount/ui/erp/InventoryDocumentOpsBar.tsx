import type { InventoryDocumentRead, InventoryPostingPreview } from "@/api/inventoryCountApi";
import {
  inventoryCountModeLabel,
  inventoryDocumentStatusLabel,
  inventoryMovementPolicyLabel,
  inventoryResultPolicyLabel,
  inventoryTypeLabel,
} from "../../inventoryCountUiLabels";

type Props = {
  doc: InventoryDocumentRead;
  preview: InventoryPostingPreview | null;
  warehouseName?: string;
};

function fmtDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function InventoryDocumentOpsBar({ doc, preview, warehouseName }: Props) {
  const movement = doc.movement_policy ?? doc.lock_mode;
  const result = doc.result_policy ?? (doc.strategy?.result_policy as string) ?? "update_stock";

  const chips: Array<{ label: string; value: string }> = [
    { label: "Typ", value: inventoryTypeLabel(doc.inventory_type) },
    { label: "Magazyn", value: warehouseName ?? `#${doc.warehouse_id}` },
    { label: "Liczenie", value: inventoryCountModeLabel(doc.count_mode) },
    { label: "Ruchy", value: inventoryMovementPolicyLabel(movement) },
    { label: "Wynik", value: inventoryResultPolicyLabel(result) },
    { label: "Status", value: inventoryDocumentStatusLabel(doc.status) },
    { label: "Operatorzy", value: String(preview?.operator_count ?? "—") },
    { label: "Rozpoczęto", value: fmtDt(doc.started_at) },
    { label: "Ostatnia aktywność", value: fmtDt(doc.updated_at) },
  ];

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-2">
      {chips.map((c) => (
        <div key={c.label} className="rounded border border-slate-200 bg-white px-2 py-1">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{c.label}</p>
          <p className="text-[11px] font-semibold text-slate-800">{c.value}</p>
        </div>
      ))}
    </div>
  );
}
