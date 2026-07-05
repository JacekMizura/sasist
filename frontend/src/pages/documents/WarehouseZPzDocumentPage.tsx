import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { getStockDocument, type StockDocumentRead } from "../../api/stockDocumentsApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { useDocumentTemplatePrint } from "../../hooks/useDocumentTemplatePrint";
import { stockKindFromType } from "../../utils/documentTemplatePrint";
import { DocumentsSectionShell } from "./DocumentsSectionShell";
import { WarehouseZPzDocumentDetail } from "./WarehouseZPzDocumentDetail";
import { warehouseDocumentListStatus } from "./warehouseDocumentsUi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { displayWarehouseDocumentNumber } from "../../utils/warehouseDocumentNumberDisplay";

type Props = {
  documentId: number;
};

export function WarehouseZPzDocumentPage({ documentId }: Props) {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const { requestPrint, pickerModal } = useDocumentTemplatePrint({ tenantId: DAMAGE_TENANT_ID });
  const [detail, setDetail] = useState<StockDocumentRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setDetail(await getStockDocument(DAMAGE_TENANT_ID, documentId, warehouse?.id ?? undefined));
    } catch {
      setErr("Nie udało się wczytać dokumentu Z-PZ.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [documentId, warehouse?.id]);

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

  const backLink = (
    <Link
      to="/documents/warehouse/z-pz"
      className="inline-flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900"
    >
      ← Lista Z-PZ
    </Link>
  );

  const title =
    displayWarehouseDocumentNumber(detail?.document_number) ||
    (loading ? "Wczytywanie…" : `Z-PZ #${documentId}`);

  return (
    <DocumentsSectionShell
      title={title}
      toolbar={
        detail ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => navigate("/documents/warehouse/z-pz")}
            >
              Zamknij
            </button>
          </div>
        ) : null
      }
    >
      {loading && !detail ? (
        <div className="py-16 text-center text-sm text-slate-500">Wczytywanie dokumentu…</div>
      ) : detail && status ? (
        <WarehouseZPzDocumentDetail
          detail={detail}
          status={status}
          loading={loading}
          error={err}
          layout="page"
          backLink={backLink}
        />
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-900">
          {err ?? "Nie znaleziono dokumentu."}
          <div className="mt-3">{backLink}</div>
        </div>
      )}
      {pickerModal}
    </DocumentsSectionShell>
  );
}

/** Route shell: reads ?id= from query string. */
export default function WarehouseZPzDocumentPageRoute() {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get("id");
  const id = raw ? Number(raw) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    return (
      <DocumentsSectionShell title="Z-PZ">
        <p className="text-sm text-slate-600">Brak identyfikatora dokumentu.</p>
        <Link to="/documents/warehouse/z-pz" className="mt-3 inline-block text-sm font-semibold text-violet-700">
          ← Lista Z-PZ
        </Link>
      </DocumentsSectionShell>
    );
  }
  return <WarehouseZPzDocumentPage documentId={id} />;
}
