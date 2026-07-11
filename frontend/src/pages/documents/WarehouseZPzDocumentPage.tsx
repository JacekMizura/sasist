import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { getStockDocument, type StockDocumentRead } from "../../api/stockDocumentsApi";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useDocumentTemplatePrint } from "../../hooks/useDocumentTemplatePrint";
import { stockKindFromType } from "../../utils/documentTemplatePrint";
import { WarehouseZPzDocumentDetail } from "./WarehouseZPzDocumentDetail";
import { warehouseDocumentListStatus } from "./warehouseDocumentsUi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { displayWarehouseDocumentNumber } from "../../utils/warehouseDocumentNumberDisplay";
import { warehouseDocPrimaryBtnClass, warehouseDocSecondaryBtnClass } from "./warehouseDocumentDetailUi";

type Props = {
  documentId: number;
};

export function WarehouseZPzDocumentPage({ documentId }: Props) {
  const navigate = useNavigate();
  const { sessionReady } = useAuth();
  const { warehouse, warehousesLoading } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;
  const { requestPrint, pickerModal } = useDocumentTemplatePrint({ tenantId });
  const [detail, setDetail] = useState<StockDocumentRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    console.log("[stock-document]", {
      sessionReady,
      tenantId,
      warehouseId,
      warehousesLoading,
      documentId,
    });
    if (!sessionReady || warehousesLoading || warehouseId == null) {
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      setDetail(await getStockDocument(tenantId, documentId, warehouseId));
    } catch {
      setErr("Nie udało się wczytać dokumentu Z-PZ.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [documentId, warehouseId, sessionReady, warehousesLoading, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = useMemo(() => {
    if (!detail) return null;
    return warehouseDocumentListStatus({
      status: detail.status,
      document_type: detail.document_type,
      total_received: detail.total_received,
      receiving_status: detail.receiving_status,
      putaway_status: detail.putaway_status,
      relocation_status: detail.relocation_status,
      is_fully_received: detail.is_fully_received,
      is_fully_putaway: detail.is_fully_putaway,
    });
  }, [detail]);

  const title =
    displayWarehouseDocumentNumber(detail?.document_number) ||
    (loading ? "Wczytywanie…" : `Z-PZ #${documentId}`);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 shrink-0">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading && !detail ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Wczytywanie dokumentu…</div>
        ) : detail && status ? (
          <WarehouseZPzDocumentDetail
            detail={detail}
            status={status}
            loading={loading}
            error={err}
            layout="page"
            backLink={
              <Link
                to="/documents/warehouse/z-pz"
                className="inline-flex items-center text-[12px] font-semibold text-slate-600 hover:text-slate-900"
              >
                ← Lista Z-PZ
              </Link>
            }
          />
        ) : (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-900">
            {err ?? "Nie znaleziono dokumentu."}
            <div className="mt-3">
              <Link
                to="/documents/warehouse/z-pz"
                className="inline-flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900"
              >
                ← Lista Z-PZ
              </Link>
            </div>
          </div>
        )}
      </div>

      {detail ? (
        <footer className="sticky bottom-0 z-10 mt-2 flex h-14 shrink-0 items-center justify-end gap-1.5 border-t border-slate-200 bg-white px-1">
          <button type="button" className={warehouseDocSecondaryBtnClass} onClick={() => navigate("/documents/warehouse/z-pz")}>
            Zamknij
          </button>
          <button
            type="button"
            className={warehouseDocPrimaryBtnClass}
            onClick={() =>
              void requestPrint({
                kind: "stock_document",
                documentId,
                kindCode: stockKindFromType(detail.document_type ?? "PZ"),
              })
            }
          >
            Drukuj PDF
          </button>
        </footer>
      ) : null}

      {pickerModal}
    </div>
  );
}

/** Route shell: reads ?id= from query string. */
export default function WarehouseZPzDocumentPageRoute() {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get("id");
  const id = raw ? Number(raw) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Z-PZ</h2>
        <p className="text-sm text-slate-600">Brak identyfikatora dokumentu.</p>
        <Link to="/documents/warehouse/z-pz" className="inline-block text-sm font-semibold text-violet-700">
          ← Lista Z-PZ
        </Link>
      </div>
    );
  }
  return <WarehouseZPzDocumentPage documentId={id} />;
}
