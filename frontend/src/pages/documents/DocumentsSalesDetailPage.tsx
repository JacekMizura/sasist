import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileText, Printer } from "lucide-react";

import { getSaleDocument } from "../../api/saleDocumentsApi";
import { paymentMethodPl } from "../../components/directSales/directSalesTerminology";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { DocumentTypeBadge, PaymentStatusBadge } from "./documentsBadges";
import { DocumentsSectionShell } from "./DocumentsSectionShell";

const btnSecondary =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50";

function money(n: number, currency = "PLN") {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function DocumentsSalesDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Awaited<ReturnType<typeof getSaleDocument>> | null>(null);
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

  const paid = useMemo(() => {
    const st = String(doc?.payment?.status ?? "").toUpperCase();
    return st === "PAID" || st === "SETTLED" || st === "CAPTURED";
  }, [doc?.payment?.status]);

  const title = doc?.doc_type === "PA" ? "Paragon" : "Faktura VAT";

  return (
    <DocumentsSectionShell
      title={loading ? "Dokument sprzedaży" : doc ? `${title} ${doc.document_number}` : "Dokument sprzedaży"}
      subtitle={
        doc
          ? `Zamówienie ${doc.order_number}${doc.warehouse_name ? ` · ${doc.warehouse_name}` : ""}`
          : "Szczegóły dokumentu sprzedaży"
      }
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            Wróć
          </button>
          <button type="button" className={btnSecondary} disabled={!doc} aria-disabled={!doc}>
            <Printer className="h-4 w-4 shrink-0" aria-hidden />
            Drukuj
          </button>
          <button type="button" className={btnSecondary} disabled={!doc} aria-disabled={!doc}>
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            Eksport
          </button>
        </>
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
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <DocumentTypeBadge code={doc.doc_type} />
            <PaymentStatusBadge paid={paid} />
            <span className="text-sm text-slate-600">
              {doc.created_at ? new Date(doc.created_at).toLocaleString("pl-PL") : "—"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Sprzedawca</h3>
              <p className="text-lg font-semibold text-slate-900">{doc.seller.name}</p>
              {doc.seller.nip ? <p className="mt-1 text-sm text-slate-600">NIP: {doc.seller.nip}</p> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Nabywca</h3>
              <p className="text-lg font-semibold text-slate-900">{doc.buyer.name}</p>
              {doc.buyer.nip ? <p className="mt-1 text-sm text-slate-600">NIP: {doc.buyer.nip}</p> : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Pozycje</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Produkt", "Ilość", "Netto j.", "VAT %", "Netto", "VAT", "Brutto"].map((h) => (
                      <th key={h} className="px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((ln) => (
                    <tr key={ln.order_item_id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{ln.name}</div>
                        {ln.sku ? <div className="text-xs text-slate-500">{ln.sku}</div> : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{ln.quantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {ln.unit_net != null ? money(ln.unit_net, doc.currency) : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{ln.vat_percent}%</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(ln.line_net, doc.currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(ln.line_vat, doc.currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {money(ln.line_gross, doc.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Stawki VAT</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="pb-2">Stawka</th>
                    <th className="pb-2 text-right">Netto</th>
                    <th className="pb-2 text-right">VAT</th>
                    <th className="pb-2 text-right">Brutto</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.vat_rows.map((row) => (
                    <tr key={row.vat_percent} className="border-t border-slate-100">
                      <td className="py-2 tabular-nums">{row.vat_percent}%</td>
                      <td className="py-2 text-right tabular-nums">{money(row.net, doc.currency)}</td>
                      <td className="py-2 text-right tabular-nums">{money(row.vat, doc.currency)}</td>
                      <td className="py-2 text-right tabular-nums">{money(row.gross, doc.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Podsumowanie</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Netto</dt>
                  <dd className="font-medium tabular-nums">{money(doc.total_net, doc.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">VAT</dt>
                  <dd className="font-medium tabular-nums">{money(doc.total_vat, doc.currency)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
                  <dt className="font-semibold text-slate-900">Brutto</dt>
                  <dd className="font-bold tabular-nums text-slate-900">{money(doc.total_gross, doc.currency)}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <FileText className="h-4 w-4" aria-hidden />
              Płatność
            </h3>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Metoda</dt>
                <dd className="font-medium text-slate-900">{paymentMethodPl(doc.payment.method)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <PaymentStatusBadge paid={paid} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Kwota</dt>
                <dd className="font-medium tabular-nums">{money(doc.payment.amount, doc.payment.currency)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Data zapłaty</dt>
                <dd className="font-medium">
                  {doc.payment.captured_at ? new Date(doc.payment.captured_at).toLocaleString("pl-PL") : "—"}
                </dd>
              </div>
              {doc.payment.external_transaction_id ? (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">ID transakcji</dt>
                  <dd className="font-mono text-xs text-slate-800">{doc.payment.external_transaction_id}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link to={`/orders/${doc.order_id}`} className={btnSecondary}>
              Otwórz zamówienie #{doc.order_number}
            </Link>
          </div>
        </div>
      )}
    </DocumentsSectionShell>
  );
}
