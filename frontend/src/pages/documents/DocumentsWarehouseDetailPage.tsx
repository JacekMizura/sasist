import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardList } from "lucide-react";

import { WarehouseStockDocumentDetailView } from "../../components/documents/warehouse/WarehouseStockDocumentDetailView";
import { fetchTenantsList } from "../../api/tenantsApi";
import { useWarehouse } from "../../context/WarehouseContext";
import DocumentsEmptyState from "./DocumentsEmptyState";
import { DocumentsSectionShell } from "./DocumentsSectionShell";
import { useWarehouseStockDocumentDetail } from "./hooks/useWarehouseStockDocumentDetail";
import { useOperationalDocumentSeries } from "./OperationalDocumentSeriesContext";
import { Z_WAREHOUSE_DOC_CONFIRM } from "./warehouseDocumentOverlayLayers";
import { listPath } from "./warehouseDocumentRoutePaths";
import {
  normalizeWarehouseDocType,
  type WarehouseDocumentType,
} from "./warehouseDocumentsUi";

const btnSecondary =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50";

function WarehouseStockDocumentDetailBody({
  documentId,
  tenantId,
  warehouseId,
  docTypeFallback,
  listUrl,
}: {
  documentId: number;
  tenantId: number;
  warehouseId: number;
  docTypeFallback: WarehouseDocumentType;
  listUrl: string;
}) {
  const navigate = useNavigate();
  const { viewProps, actions, state, pickerModal } = useWarehouseStockDocumentDetail({
    documentId,
    tenantId,
    warehouseId,
    docTypeFallback,
    onClose: () => navigate(listUrl),
  });

  return (
    <>
      <WarehouseStockDocumentDetailView {...viewProps} />
      {state.deleteConfirmOpen
        ? createPortal(
            <div
              className="fixed inset-0 flex items-center justify-center bg-slate-900/50 p-4"
              style={{ zIndex: Z_WAREHOUSE_DOC_CONFIRM }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-doc-detail-title"
            >
              <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                <h3 id="delete-doc-detail-title" className="text-lg font-bold text-slate-900">
                  Usunąć dokument?
                </h3>
                <p className="mt-2 text-sm text-slate-600">Dokument zostanie trwale usunięty.</p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={state.deleteBusy}
                    onClick={() => {
                      if (!state.deleteBusy) actions.closeDeleteConfirm();
                    }}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Anuluj
                  </button>
                  <button
                    type="button"
                    disabled={state.deleteBusy}
                    onClick={() => void actions.confirmDelete()}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {state.deleteBusy ? "Usuwanie…" : "Usuń"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {pickerModal}
    </>
  );
}

export default function DocumentsWarehouseDetailPage() {
  const { docSegment, documentId: documentIdParam } = useParams<{
    docSegment: string;
    documentId: string;
  }>();
  const navigate = useNavigate();
  const { warehouse, warehousesLoading } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { warehouseTypes, loading: seriesLoading, hasWarehouseType } = useOperationalDocumentSeries();
  const [tenantId, setTenantId] = useState<number>(1);

  useEffect(() => {
    void fetchTenantsList()
      .then((list) => {
        if (list.length > 0) setTenantId(list[0].id);
      })
      .catch(() => setTenantId(1));
  }, []);

  const routeType = useMemo((): WarehouseDocumentType | null => {
    const seg = String(docSegment ?? "").trim().toLowerCase();
    if (!seg) return null;
    const hit = warehouseTypes.find((t) => (t.route_segment || "").toLowerCase() === seg);
    if (!hit?.stock_document_type) return null;
    return normalizeWarehouseDocType(hit.stock_document_type);
  }, [docSegment, warehouseTypes]);

  const documentId = useMemo(() => {
    const n = Number(documentIdParam);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [documentIdParam]);

  const docTypeTitle = useMemo(() => {
    const seg = String(docSegment ?? "").trim().toLowerCase();
    const hit = warehouseTypes.find((t) => (t.route_segment || "").toLowerCase() === seg);
    if (hit?.operational_code) return hit.operational_code;
    return routeType ?? docSegment?.toUpperCase() ?? "Dokument";
  }, [docSegment, warehouseTypes, routeType]);

  const listUrl = docSegment ? listPath(docSegment) : "/documents/warehouse/pz";

  if (routeType === "Z_PZ" && documentId != null && docSegment) {
    return <Navigate to={`${listPath(docSegment)}?id=${documentId}`} replace />;
  }

  if (seriesLoading || warehousesLoading) {
    return (
      <DocumentsSectionShell title={`Dokument magazynowy — ${docTypeTitle}`} subtitle="Wczytywanie…">
        <p className="px-4 py-12 text-center text-sm text-slate-500">Wczytywanie…</p>
      </DocumentsSectionShell>
    );
  }

  if (routeType == null || !docSegment) {
    return (
      <DocumentsSectionShell title="Dokument magazynowy">
        <DocumentsEmptyState
          icon={ClipboardList}
          title="Nieznany typ dokumentu"
          description="Wróć do listy dokumentów magazynowych."
        />
        <div className="mt-4">
          <Link to="/documents/warehouse/pz" className={btnSecondary}>
            Lista dokumentów
          </Link>
        </div>
      </DocumentsSectionShell>
    );
  }

  if (!hasWarehouseType(routeType)) {
    return (
      <DocumentsSectionShell title={`Dokument magazynowy — ${docTypeTitle}`}>
        <DocumentsEmptyState
          icon={ClipboardList}
          title="Brak aktywnej serii"
          description={`Brak aktywnej serii dokumentów ${docTypeTitle} dla tego magazynu.`}
        />
        <div className="mt-4">
          <Link to={listUrl} className={btnSecondary}>
            Wróć do listy
          </Link>
        </div>
      </DocumentsSectionShell>
    );
  }

  if (documentId == null) {
    return (
      <DocumentsSectionShell title={`Dokument magazynowy — ${docTypeTitle}`}>
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center text-sm text-red-800">
          Niepoprawny identyfikator dokumentu.
          <div className="mt-4">
            <Link to={listUrl} className={btnSecondary}>
              Wróć do listy
            </Link>
          </div>
        </div>
      </DocumentsSectionShell>
    );
  }

  if (warehouseId == null) {
    return (
      <DocumentsSectionShell title={`Dokument magazynowy — ${docTypeTitle}`}>
        <p className="px-4 py-12 text-center text-sm text-slate-500">Wybierz magazyn, aby wczytać dokument.</p>
      </DocumentsSectionShell>
    );
  }

  return (
    <DocumentsSectionShell
      title={`Dokument magazynowy — ${docTypeTitle}`}
      subtitle={`Dokument #${documentId}`}
      actions={
        <button type="button" className={btnSecondary} onClick={() => navigate(listUrl)}>
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Wróć do listy
        </button>
      }
    >
      <WarehouseStockDocumentDetailBody
        documentId={documentId}
        tenantId={tenantId}
        warehouseId={warehouseId}
        docTypeFallback={routeType}
        listUrl={listUrl}
      />
    </DocumentsSectionShell>
  );
}
