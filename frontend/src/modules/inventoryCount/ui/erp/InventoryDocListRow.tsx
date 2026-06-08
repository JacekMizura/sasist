import { Link } from "react-router-dom";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { inventoryDocumentStatusLabel, inventoryTypeLabel } from "../../inventoryCountUiLabels";
import { InventoryDocumentStatusBadge } from "./InventoryDocumentStatusBadge";

export function InventoryDocListRow({ doc }: { doc: InventoryDocumentRead }) {
  return (
    <Link
      to={erpInventoryCountPaths.document(doc.id)}
      className="flex items-center justify-between gap-2 border-b border-slate-100 px-2 py-1.5 last:border-0 hover:bg-slate-50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{doc.number}</p>
        <p className="text-[10px] text-slate-500">{inventoryTypeLabel(doc.inventory_type)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <InventoryDocumentStatusBadge status={doc.status} />
        <p className="text-[10px] tabular-nums text-slate-600">
          {doc.coverage_percent}% · {doc.counted_lines}/{doc.total_lines}
        </p>
      </div>
    </Link>
  );
}

export function inventoryDocOptionLabel(doc: InventoryDocumentRead): string {
  return `${doc.number} · ${inventoryTypeLabel(doc.inventory_type)} · ${inventoryDocumentStatusLabel(doc.status)}`;
}
