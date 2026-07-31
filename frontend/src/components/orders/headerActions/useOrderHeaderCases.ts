import { useCallback, useEffect, useState } from "react";

import { listComplaints } from "../../../api/complaintsApi";
import { listWmsReturnsForOrder } from "../../../api/wmsReturnsApi";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import type { ComplaintListItem } from "../../../types/complaint";
import type { WmsReturnListItem } from "../../../types/wmsReturn";

export type OrderHeaderCaseRow = {
  kind: "return" | "complaint";
  id: number;
  number: string;
  status: string;
  date: string | null;
  owner: string | null;
  openPath: string;
};

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function returnStatusLabel(row: WmsReturnListItem): string {
  return (row.ui_status?.name || row.status?.name || "—").trim() || "—";
}

function mapReturn(row: WmsReturnListItem): OrderHeaderCaseRow {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return {
    kind: "return",
    id: row.id,
    number: row.rmz_number || `ZW-${row.id}`,
    status: returnStatusLabel(row),
    date: fmtDate(row.created_at),
    owner: name || null,
    openPath: `/wms/returns/process/${row.id}`,
  };
}

function mapComplaint(row: ComplaintListItem): OrderHeaderCaseRow {
  return {
    kind: "complaint",
    id: row.id,
    number: row.reference_code || `RK-${row.id}`,
    status: String(row.status || "—"),
    date: fmtDate(row.created_at),
    owner: (row.customer_name || "").trim() || null,
    openPath: `/orders/complaints/${row.id}`,
  };
}

/**
 * Active returns + complaints for the order header badge/panel.
 * Complaints: list by order number query, then filter by order_id.
 */
export function useOrderHeaderCases(orderId: number | null, orderNumber: string | null, warehouseId: number | null) {
  const [loading, setLoading] = useState(false);
  const [returns, setReturns] = useState<OrderHeaderCaseRow[]>([]);
  const [complaints, setComplaints] = useState<OrderHeaderCaseRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (orderId == null || orderId <= 0) {
      setReturns([]);
      setComplaints([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const retPromise = listWmsReturnsForOrder(orderId, DAMAGE_TENANT_ID);
      const q = (orderNumber || String(orderId)).trim();
      const cmpPromise = listComplaints({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId ?? undefined,
        q,
        limit: 50,
        sort_by: "created_at",
        sort_dir: "desc",
      });
      const [retRows, cmpRes] = await Promise.all([retPromise, cmpPromise]);
      setReturns((retRows ?? []).map(mapReturn));
      setComplaints(
        (cmpRes.items ?? [])
          .filter((c) => c.order_id == null || Number(c.order_id) === orderId)
          .map(mapComplaint),
      );
    } catch {
      setError("Nie udało się wczytać zgłoszeń.");
      setReturns([]);
      setComplaints([]);
    } finally {
      setLoading(false);
    }
  }, [orderId, orderNumber, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activeCount = returns.length + complaints.length;

  return { loading, error, returns, complaints, activeCount, reload };
}
