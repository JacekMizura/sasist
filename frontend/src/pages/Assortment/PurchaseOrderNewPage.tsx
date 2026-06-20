import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { createDelivery } from "../../api/inboundDeliveriesApi";
import { listSuppliers } from "../../api/inboundSuppliersApi";
import {
  ACTIVE_WAREHOUSE_REQUIRED_MESSAGE,
  useActiveWarehouseContext,
} from "../../hooks/useActiveWarehouseContext";
import PageLayout from "../../components/layout/PageLayout";

/** Tworzy szkic zamówienia i przekierowuje na pełną stronę edycji. */
export default function PurchaseOrderNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const startedRef = useRef(false);
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();

  const tenantId = useMemo(() => {
    const tid = Number(searchParams.get("tenant_id"));
    return Number.isFinite(tid) && tid >= 1 ? tid : 1;
  }, [searchParams]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      if (!hasActiveWarehouse || warehouseId == null) {
        window.alert(ACTIVE_WAREHOUSE_REQUIRED_MESSAGE);
        void navigate(`/goods-orders?tenant_id=${tenantId}`, { replace: true });
        return;
      }
      try {
        const suppliers = await listSuppliers(tenantId, { status: "all" });
        if (suppliers.length === 0) {
          window.alert("Najpierw dodaj dostawcę (Asortyment → Dostawcy).");
          void navigate("/suppliers", { replace: true });
          return;
        }
        const d = await createDelivery({
          tenant_id: tenantId,
          supplier_id: suppliers[0].id,
          warehouse_id: warehouseId,
          status: "draft",
        });
        void navigate(`/goods-orders/${d.id}?tenant_id=${tenantId}`, { replace: true });
      } catch {
        window.alert("Nie udało się utworzyć szkicu zamówienia.");
        void navigate(`/goods-orders?tenant_id=${tenantId}`, { replace: true });
      }
    })();
  }, [hasActiveWarehouse, warehouseId, tenantId, navigate]);

  return (
    <PageLayout fullBleed>
      <p className="py-12 text-center text-sm text-slate-500">Tworzenie szkicu zamówienia…</p>
    </PageLayout>
  );
}
