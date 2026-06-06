import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { getSaleDocument } from "../../api/saleDocumentsApi";
import CommercialSaleDocumentView from "../../components/documents/CommercialSaleDocumentView";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import type { SaleDocumentDetail } from "../../types/saleDocument";
import { DocumentsSectionShell } from "./DocumentsSectionShell";

const btnSecondary =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50";

export default function DocumentsSalesDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<SaleDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getSaleDocument({ tenantId: DAMAGE_TENANT_ID, documentId })
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch(() => {
        if (!cancelled) {
          setDoc(null);
          setError("Nie udało się wczytać dokumentu sprzedaży.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const title = doc ? (doc.doc_type === "PA" ? "Paragon" : "Faktura VAT") : "Dokument sprzedaży";

  return (
    <DocumentsSectionShell
      title={loading ? "Dokument sprzedaży" : doc ? `${title}` : "Dokument sprzedaży"}
      subtitle={doc ? doc.document_number : "Szczegóły dokumentu handlowego"}
      actions={
        <button type="button" className={btnSecondary} onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Wróć do listy
        </button>
      }
    >
      {loading ? (
        <p className="px-4 py-12 text-center text-sm text-slate-500">Wczytywanie dokumentu…</p>
      ) : error || !doc ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center text-sm text-red-800">
          {error ?? "Dokument nie istnieje."}
          <div className="mt-4">
            <Link to="/documents/sales/invoices" className={btnSecondary}>
              Lista dokumentów
            </Link>
          </div>
        </div>
      ) : (
        <CommercialSaleDocumentView doc={doc} />
      )}
    </DocumentsSectionShell>
  );
}
