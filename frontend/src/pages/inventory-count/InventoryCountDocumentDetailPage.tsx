import { useParams } from "react-router-dom";

import { useInventoryDocumentDetail } from "@/modules/inventoryCount/hooks/useInventoryDocumentDetail";
import InventoryDocumentDetailView from "@/modules/inventoryCount/ui/erp/InventoryDocumentDetailView";
import { useWarehouse } from "@/context/WarehouseContext";

/** ERP document detail — thin route shell. */
export default function InventoryCountDocumentDetailPage() {
  const { documentId } = useParams();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const id = Number(documentId);
  const state = useInventoryDocumentDetail(id, tenantId);

  if (state.err) return <p className="text-xs text-rose-600">{state.err}</p>;
  if (!state.doc) return <p className="text-xs text-slate-500">Wczytywanie…</p>;

  return <InventoryDocumentDetailView state={state} warehouseName={warehouse?.name} />;
}
