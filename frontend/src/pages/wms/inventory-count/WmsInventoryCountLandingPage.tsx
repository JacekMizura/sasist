import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchWmsActiveInventoryDocuments, type WmsActiveInventoryDocumentRead } from "@/api/inventoryCountApi";
import WmsInventoryLandingView from "@/modules/inventoryCount/ui/wms/WmsInventoryLandingView";
import { wmsInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import { setActiveInventoryDocumentId } from "@/modules/inventoryCount/wmsActiveDocumentStorage";
import { WMS_INV } from "@/modules/inventoryCount/ui/wms/theme";
import { useAuth } from "@/context/AuthContext";
import { useWarehouse } from "@/context/WarehouseContext";

const TENANT_ID = 1;

function fmtActivity(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function WmsInventoryCountLandingPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { warehouse } = useWarehouse();
  const canCreateDocument = hasPermission("inventory.submit");
  const warehouseId = warehouse?.id;
  const tenantId = TENANT_ID;
  const [docs, setDocs] = useState<WmsActiveInventoryDocumentRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    setErr(null);
    try {
      const items = await fetchWmsActiveInventoryDocuments(tenantId, warehouseId);
      setDocs(items);
    } catch {
      setErr("Nie udało się wczytać aktywnych inwentaryzacji.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDocument = (doc: WmsActiveInventoryDocumentRead) => {
    if (!warehouseId || !doc.can_count) return;
    setActiveInventoryDocumentId(warehouseId, doc.id);
    navigate(wmsInventoryCountPaths.document(doc.id));
  };

  if (!warehouseId) {
    return (
      <div className={WMS_INV.shellWide}>
        <p className={`py-4 text-sm font-bold ${WMS_INV.textMuted}`}>Wybierz magazyn.</p>
      </div>
    );
  }

  return (
    <WmsInventoryLandingView
      docs={docs}
      loading={loading}
      err={err}
      canCreateDocument={canCreateDocument}
      onOpenDocument={openDocument}
      formatActivity={fmtActivity}
    />
  );
}
