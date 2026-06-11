import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { getStockDocument } from "../../api/stockDocumentsApi";
import { useWarehouse } from "../../context/WarehouseContext";
import type { ActiveZPzRead } from "../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WMS_ROUTES } from "./wmsRoutes";
import { WmsActiveZPzLabelView } from "./WmsActiveZPzPanel";

function summarizeStockDocument(doc: Awaited<ReturnType<typeof getStockDocument>>): ActiveZPzRead {
  const items = doc.items ?? [];
  let unitSum = 0;
  for (const row of items) {
    const q = Number(row.received_quantity ?? row.quantity ?? row.ordered_quantity ?? 0);
    if (Number.isFinite(q)) unitSum += q;
  }
  const id = doc.id;
  return {
    stock_document_id: id,
    document_number: doc.document_number?.trim() || `Z-PZ #${id}`,
    document_type: doc.document_type,
    status: doc.status,
    line_count: items.length,
    unit_sum: unitSum,
    created_at: doc.created_at ?? null,
    warehouse_id: doc.warehouse_id ?? null,
    barcode_value: `ZPZ-${id}`,
    detail_path: `/documents/warehouse/wz?id=${id}`,
  };
}

export default function WmsActiveZPzLabelPage() {
  const { stockDocumentId } = useParams<{ stockDocumentId: string }>();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [doc, setDoc] = useState<ActiveZPzRead | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const parsedId = useMemo(() => {
    const id = Number(stockDocumentId);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [stockDocumentId]);

  useEffect(() => {
    if (parsedId == null) {
      setErr("Nieprawidłowy identyfikator dokumentu.");
      return;
    }
    void (async () => {
      try {
        const row = await getStockDocument(DAMAGE_TENANT_ID, parsedId);
        if (row.document_type !== "Z_PZ") {
          setErr("Ten dokument nie jest Z-PZ.");
          return;
        }
        if (warehouseId != null && warehouseId > 0 && row.warehouse_id != null && row.warehouse_id !== warehouseId) {
          setErr("Dokument należy do innego magazynu.");
          return;
        }
        setDoc(summarizeStockDocument(row));
      } catch {
        setErr("Nie udało się wczytać danych etykiety.");
      }
    })();
  }, [parsedId, warehouseId]);

  if (err) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-rose-700">
        {err}
        <button
          type="button"
          className="ml-4 text-blue-600 underline"
          onClick={() => navigate(WMS_ROUTES.returns)}
        >
          Wróć
        </button>
      </div>
    );
  }

  if (!doc) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Ładowanie…</div>;
  }

  return <WmsActiveZPzLabelView doc={doc} />;
}
