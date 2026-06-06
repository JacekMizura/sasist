import { Link } from "react-router-dom";
import { Download, FileText, Package, Printer, ScrollText } from "lucide-react";

import type { SaleDocumentDetail } from "../../types/saleDocument";
import { DocumentTypeBadge, ExternalStatusBadge, PaymentStatusBadge } from "../../pages/documents/documentsBadges";

const btnSecondary =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50";

function money(n: number, currency = "PLN") {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function partyBlock(title: string, party: SaleDocumentDetail["buyer"] | SaleDocumentDetail["seller"]) {
  const lines = [
    party.address,
    [party.zip, party.city].filter(Boolean).join(" "),
    party.country,
    party.nip ? `NIP: ${party.nip}` : null,
    party.email,
    party.phone,
    party.bank,
    party.iban ? `IBAN: ${party.iban}` : null,
  ].filter((x) => x && String(x).trim());

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      <p className="text-lg font-semibold text-slate-900">{party.name}</p>
      {lines.length > 0 ? (
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          {lines.map((line) => (
            <p key={String(line)}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  doc: SaleDocumentDetail;
  onPrint?: () => void;
  onExport?: () => void;
};

export default function CommercialSaleDocumentView({ doc, onPrint, onExport }: Props) {
  const title = doc.doc_type === "PA" ? "Paragon" : "Faktura VAT";
  const legacy = doc.numbering_legacy;

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Dokument sprzedaży</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {title} {doc.document_number}
            </h1>
            {legacy ? (
              <p className="text-sm text-amber-800">
                Numer legacy — wymaga korekty w serii dokumentów (szablon nie został wyrenderowany).
              </p>
            ) : null}
            <p className="text-sm text-slate-600">
              {doc.created_at ? new Date(doc.created_at).toLocaleString("pl-PL") : "—"}
              {doc.warehouse_name ? ` · ${doc.warehouse_name}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DocumentTypeBadge code={doc.doc_type} />
            <PaymentStatusBadge paid={doc.paid} />
            <ExternalStatusBadge status={doc.external_status as "NOWE"} />
            {legacy ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Numer legacy
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} onClick={onPrint} disabled={!doc.print.available}>
            <Printer className="h-4 w-4 shrink-0" aria-hidden />
            Drukuj
          </button>
          <button type="button" className={btnSecondary} onClick={onExport} disabled={!doc.export.available}>
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            Eksport
          </button>
          <Link to={doc.related.order_path} className={btnSecondary}>
            Zamówienie #{doc.order_number}
          </Link>
          {doc.related.warehouse_documents.map((wz) => (
            <Link key={wz.id} to={wz.detail_path} className={btnSecondary}>
              <Package className="h-4 w-4 shrink-0" aria-hidden />
              WZ {wz.document_number}
            </Link>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {partyBlock("Sprzedawca", doc.seller)}
        {partyBlock("Nabywca", doc.buyer)}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Pozycje dokumentu</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                {["Lp.", "Produkt", "Ilość", "Cena netto", "VAT %", "Wartość netto", "VAT", "Wartość brutto"].map(
                  (h) => (
                    <th key={h} className="px-4 py-3">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((ln, idx) => (
                <tr key={ln.order_item_id} className="border-t border-slate-100">
                  <td className="px-4 py-3 tabular-nums text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{ln.name}</div>
                    {ln.sku ? <div className="text-xs text-slate-500">SKU: {ln.sku}</div> : null}
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
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-1">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Podsumowanie VAT</h2>
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
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-1">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Rozliczenie</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Razem netto</dt>
              <dd className="font-medium tabular-nums">{money(doc.total_net, doc.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Razem VAT</dt>
              <dd className="font-medium tabular-nums">{money(doc.total_vat, doc.currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
              <dt className="font-semibold text-slate-900">Razem brutto</dt>
              <dd className="font-bold tabular-nums text-slate-900">{money(doc.total_gross, doc.currency)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-1">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <FileText className="h-4 w-4" aria-hidden />
            Płatność
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Metoda</dt>
              <dd className="font-medium text-slate-900">{doc.payment.payment_label_pl}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd>
                <PaymentStatusBadge paid={doc.paid} />
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
              <div>
                <dt className="text-slate-500">ID transakcji</dt>
                <dd className="font-mono text-xs text-slate-800">{doc.payment.external_transaction_id}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>

      {doc.related.warehouse_documents.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Package className="h-4 w-4" aria-hidden />
            Dokumenty magazynowe (WZ)
          </h2>
          <ul className="flex flex-wrap gap-2">
            {doc.related.warehouse_documents.map((wz) => (
              <li key={wz.id}>
                <Link
                  to={wz.detail_path}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
                >
                  WZ {wz.document_number}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {doc.warehouse_effects.movements.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Package className="h-4 w-4" aria-hidden />
            Ruchy magazynowe (FIFO / WZ)
          </h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {doc.warehouse_effects.movements.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  Wydanie #{m.id} · {m.movement_type} · {m.quantity} szt.
                </span>
                <span className="text-slate-500">
                  {m.created_at ? new Date(m.created_at).toLocaleString("pl-PL") : "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <ScrollText className="h-4 w-4" aria-hidden />
          Historia dokumentu
        </h2>
        <ol className="space-y-3 text-sm">
          {doc.history.map((ev, i) => (
            <li key={`${ev.action}-${i}`} className="flex gap-3 border-l-2 border-slate-200 pl-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{ev.detail}</p>
                <p className="text-xs text-slate-500">
                  {ev.at ? new Date(ev.at).toLocaleString("pl-PL") : "—"} · {ev.source}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
