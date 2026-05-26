import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  createInboundDeliveryFromPurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrder,
  patchPurchaseOrder,
  patchPurchaseOrderStatus,
  postPurchasingFxNbpFetch,
  type PoStatus,
  type PurchaseOrderDetail,
  type PurchaseOrderLine,
} from "../../api/purchasingOrdersApi";
import {
  fmtDate,
  parseLocaleNumber,
  STATUS_LABEL,
  statusBadgeClass,
  toDatetimeLocalValue,
} from "./purchasingPoCommon";
import { PageGutter } from "../../components/layout/PageContainer";

function initialTenantIdFromSearch(sp: URLSearchParams): number {
  const tid = sp.get("tenant_id");
  if (tid != null && tid !== "") {
    const n = Number(tid);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return 1;
}

const thBase =
  "border-b border-slate-200 bg-slate-100 px-3 py-2.5 text-left text-xs font-semibold text-slate-800 whitespace-nowrap";
const thRight = `${thBase} text-right`;
const tdBase = "border-b border-slate-100 px-3 py-2.5 align-top text-sm text-slate-800";
const tdRight = `${tdBase} text-right tabular-nums`;

export default function PurchasingPoDetailPage() {
  const navigate = useNavigate();
  const { id: idParam } = useParams<{ id: string }>();
  const orderId = Number(idParam);
  const [searchParams] = useSearchParams();
  const [tenantId, setTenantId] = useState(() => initialTenantIdFromSearch(searchParams));

  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);

  const [editNotes, setEditNotes] = useState("");
  const [editExpected, setEditExpected] = useState("");
  const [editShipping, setEditShipping] = useState("0");
  const [editInvoiceDate, setEditInvoiceDate] = useState("");
  const [fxBusy, setFxBusy] = useState(false);
  const [lineDraft, setLineDraft] = useState<Record<number, { qty: string; unit_price: string; received_qty: string }>>(
    {},
  );
  const [nextStatus, setNextStatus] = useState<PoStatus | "">("");

  useEffect(() => {
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) setTenantId(n);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const loadDetail = useCallback(async () => {
    if (!Number.isFinite(orderId) || orderId < 1) {
      setErr("Nieprawidłowy numer zamówienia.");
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    setNextStatus("");
    try {
      const d = await getPurchaseOrder(tenantId, orderId);
      setDetail(d);
      setEditNotes(d.notes ?? "");
      setEditExpected(toDatetimeLocalValue(d.expected_date ?? undefined));
      setEditShipping(String(d.shipping_cost ?? 0));
      setEditInvoiceDate(d.invoice_date ? String(d.invoice_date).slice(0, 10) : "");
      const ld: Record<number, { qty: string; unit_price: string; received_qty: string }> = {};
      for (const it of d.items) {
        ld[it.id] = {
          qty: String(it.qty),
          unit_price: it.unit_price != null ? String(it.unit_price) : "",
          received_qty: String(it.received_qty ?? 0),
        };
      }
      setLineDraft(ld);
    } catch {
      setErr("Nie udało się wczytać zamówienia.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, orderId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const saveMeta = async () => {
    if (!detail) return;
    setSaving(true);
    setErr(null);
    try {
      const expected = editExpected.trim() === "" ? null : new Date(editExpected).toISOString();
      const ship = Number(editShipping.replace(",", "."));
      const d = await patchPurchaseOrder(tenantId, orderId, {
        notes: editNotes,
        expected_date: expected,
        shipping_cost: Number.isFinite(ship) ? ship : 0,
        invoice_date: editInvoiceDate.trim() === "" ? null : editInvoiceDate.trim(),
      });
      setDetail(d);
      setToast("Zapisano nagłówek zamówienia.");
    } catch {
      setErr("Zapis nagłówka nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  const saveLines = async () => {
    if (!detail) return;
    setSaving(true);
    setErr(null);
    try {
      const line_updates = detail.items.map((it) => {
        const dr = lineDraft[it.id];
        const base: {
          id: number;
          qty?: number;
          unit_price?: number | null;
          received_qty?: number;
        } = { id: it.id };
        if (detail.status === "Draft") {
          base.qty = dr ? Number(String(dr.qty).replace(",", ".")) : it.qty;
          base.unit_price = dr?.unit_price === "" ? null : Number(String(dr?.unit_price ?? "").replace(",", "."));
        }
        base.received_qty = dr ? Number(String(dr.received_qty).replace(",", ".")) : it.received_qty;
        return base;
      });
      const d = await patchPurchaseOrder(tenantId, orderId, { line_updates });
      setDetail(d);
      setToast("Zapisano pozycje.");
    } catch {
      setErr("Zapis pozycji nie powiódł się (sprawdź status i wartości).");
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = async () => {
    if (!detail || !nextStatus) return;
    setSaving(true);
    setErr(null);
    try {
      const d = await patchPurchaseOrderStatus(tenantId, orderId, nextStatus as PoStatus);
      setDetail(d);
      setNextStatus("");
      setToast("Zaktualizowano status.");
    } catch {
      setErr("Zmiana statusu nie powiodła się.");
    } finally {
      setSaving(false);
    }
  };

  const createDelivery = async () => {
    setDeliveryBusy(true);
    setErr(null);
    try {
      const { delivery_id } = await createInboundDeliveryFromPurchaseOrder(tenantId, orderId);
      setToast(`Utworzono dostawę magazynową #${delivery_id}.`);
      await loadDetail();
    } catch {
      setErr("Nie udało się utworzyć dostawy (możliwy duplikat lub brak ilości).");
    } finally {
      setDeliveryBusy(false);
    }
  };

  const removeOrArchive = async () => {
    if (!detail) return;
    const isDraft = detail.status === "Draft";
    const ok = window.confirm(
      isDraft
        ? "Usunąć zamówienie Draft? (jeśli ma powiązane przyjęcia PZ, zostanie zarchiwizowane)."
        : "Zarchiwizować to zamówienie? (status: Anulowane).",
    );
    if (!ok) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await deletePurchaseOrder(tenantId, orderId);
      const msg =
        res.action === "deleted"
          ? "Zamówienie usunięte."
          : res.blocked_by_pz_receipts
            ? "Zamówienie ma powiązane PZ — wykonano archiwizację."
            : "Zamówienie zarchiwizowane.";
      sessionStorage.setItem("purchasing_po_toast", msg);
      navigate(`/purchasing/orders?tenant_id=${tenantId}`);
    } catch {
      setErr("Nie udało się usunąć / zarchiwizować zamówienia.");
    } finally {
      setSaving(false);
    }
  };

  const orderDraftTotals = useMemo(() => {
    if (!detail) return null;
    const supplierVatFrac = ((detail.supplier_invoice_vat_rate_percent ?? 23) as number) / 100;
    let net = 0;
    let qtyTotal = 0;
    let marginW = 0;
    let marginPieces = 0;
    let covNum = 0;
    let covDen = 0;
    for (const it of detail.items) {
      const dr = lineDraft[it.id];
      const q = dr ? parseLocaleNumber(dr.qty) : it.qty;
      const up = dr && dr.unit_price !== "" ? parseLocaleNumber(dr.unit_price) : (it.unit_price ?? 0);
      net += q * up;
      qtyTotal += q;
      const sell = it.sell_price;
      if (sell != null && sell > 0 && up > 0) {
        marginW += ((sell - up) / sell) * 100 * q;
        marginPieces += q;
      }
      const avgD = it.sales_30d != null ? it.sales_30d / 30 : 0;
      if (avgD > 0 && it.current_stock != null) {
        covNum += it.current_stock + q;
        covDen += avgD;
      }
    }
    const vat = net * supplierVatFrac;
    const gross = net + vat;
    const ship = parseLocaleNumber(editShipping);
    const grandNet = net + ship;
    const grandVat = grandNet * supplierVatFrac;
    const grandGross = grandNet + grandVat;
    const curU = (detail.currency || "PLN").toUpperCase();
    const fx = detail.fx_rate_to_pln;
    const isForeign = curU !== "PLN";
    const plnNetSim =
      isForeign && fx != null && Number.isFinite(fx) ? grandNet * fx : grandNet;
    const plnVatSim = plnNetSim * 0.23;
    const plnGrossSim = plnNetSim + plnVatSim;
    return {
      net,
      vat,
      gross,
      qtyTotal,
      lines: detail.items.length,
      grandNet,
      grandVat,
      grandGross,
      avgMar: marginPieces > 0 ? marginW / marginPieces : null,
      coverDays: covDen > 0 ? covNum / covDen : null,
      currency: detail.currency,
      supplierVatPercent: Math.round(supplierVatFrac * 1000) / 10,
      taxMode: detail.tax_mode ?? "domestic_vat",
      plnNetSim,
      plnVatSim,
      plnGrossSim,
      isForeign,
    };
  }, [detail, lineDraft, editShipping]);

  const supplierVatFrac = (detail?.supplier_invoice_vat_rate_percent ?? 23) / 100;

  const listHref = `/purchasing/orders?tenant_id=${tenantId}`;
  const statusOptions: PoStatus[] = [
    "Draft",
    "Sent",
    "Confirmed",
    "PartiallyReceived",
    "Delivered",
    "Closed",
    "Cancelled",
  ];

  const summaryPanel = orderDraftTotals && detail && (
    <div className="rounded-xl border border-slate-200 bg-slate-50/95 p-4 text-sm shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Podsumowanie (podgląd)</p>
      <dl className="mt-3 space-y-2 text-slate-800">
        <div className="flex justify-between gap-3">
          <dt>Pozycje</dt>
          <dd className="text-right tabular-nums font-medium">{orderDraftTotals.lines}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Sztuki łącznie</dt>
          <dd className="text-right tabular-nums font-medium">
            {orderDraftTotals.qtyTotal.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Netto pozycji</dt>
          <dd className="text-right tabular-nums">
            {orderDraftTotals.net.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            {orderDraftTotals.currency}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>VAT dostawcy ({orderDraftTotals.supplierVatPercent}%)</dt>
          <dd className="text-right tabular-nums">
            {orderDraftTotals.vat.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            {orderDraftTotals.currency}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Brutto pozycji</dt>
          <dd className="text-right tabular-nums font-medium">
            {orderDraftTotals.gross.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            {orderDraftTotals.currency}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-slate-600">
          <dt>+ Wysyłka (netto)</dt>
          <dd className="text-right tabular-nums">{parseLocaleNumber(editShipping).toLocaleString("pl-PL", { minimumFractionDigits: 2 })}</dd>
        </div>
        <div className="flex justify-between gap-3 font-semibold text-slate-900">
          <dt>Razem netto</dt>
          <dd className="text-right tabular-nums">
            {orderDraftTotals.grandNet.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            {orderDraftTotals.currency}
          </dd>
        </div>
        <div className="flex justify-between gap-3 font-semibold text-slate-900">
          <dt>Razem brutto</dt>
          <dd className="text-right tabular-nums">
            {orderDraftTotals.grandGross.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            {orderDraftTotals.currency}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Śr. marża (wg linii)</dt>
          <dd className="text-right tabular-nums">{orderDraftTotals.avgMar != null ? `${orderDraftTotals.avgMar.toFixed(1)}%` : "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Pokrycie po zamówieniu</dt>
          <dd className="text-right tabular-nums">
            {orderDraftTotals.coverDays != null ? `${orderDraftTotals.coverDays.toFixed(0)} dni` : "—"}
          </dd>
        </div>
        {orderDraftTotals.isForeign ? (
          <>
            <div className="border-t border-slate-200 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Symulacja PL (23%)
            </div>
            <div className="flex justify-between gap-3 text-slate-800">
              <dt>Netto PLN</dt>
              <dd className="text-right tabular-nums font-medium">
                {orderDraftTotals.plnNetSim.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                PLN
              </dd>
            </div>
            <div className="flex justify-between gap-3 text-slate-800">
              <dt>VAT 23%</dt>
              <dd className="text-right tabular-nums">
                {orderDraftTotals.plnVatSim.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                PLN
              </dd>
            </div>
            <div className="flex justify-between gap-3 font-semibold text-slate-900">
              <dt>Brutto PLN</dt>
              <dd className="text-right tabular-nums">
                {orderDraftTotals.plnGrossSim.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                PLN
              </dd>
            </div>
            <p className="text-[11px] leading-snug text-slate-500">
              Kurs: {detail.fx_rate_to_pln != null ? `${detail.fx_rate_to_pln} PLN/${detail.currency}` : "brak — pobierz NBP"}{" "}
              {detail.fx_rate_effective_date ? `· data ${detail.fx_rate_effective_date}` : ""}
              {detail.fx_source_used ? ` · ${detail.fx_source_used}` : ""}
              {detail.fx_basis_date ? ` · baza ${detail.fx_basis_date}` : ""}
            </p>
          </>
        ) : null}
      </dl>
      <p className="mt-3 text-[11px] leading-snug text-slate-500">
        W dokumencie: netto {detail.subtotal.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} + koszty →{" "}
        {detail.total_value.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} {detail.currency}.
      </p>
    </div>
  );

  return (
    <PageGutter>
      <div className="w-full min-w-0 pb-10">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to={listHref}
          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          ← Lista zamówień
        </Link>
        {detail ? (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(detail.status)}`}>
            {STATUS_LABEL[detail.status]}
          </span>
        ) : null}
      </div>

      {toast ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{toast}</div> : null}
      {err ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie zamówienia…</p>
      ) : !detail ? (
        <p className="text-sm text-slate-600">Brak danych.</p>
      ) : (
        <>
          <header className="mb-6 flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Zamówienie {detail.order_number}</h1>
              <p className="mt-1 text-sm text-slate-600">
                Utworzono {fmtDate(detail.created_at)} · Dostawca:{" "}
                <span className="font-medium text-slate-800">{detail.supplier_name}</span>
                {" · "}
                <span className="font-medium text-slate-800">{detail.currency}</span>
              </p>
              {detail.tax_mode === "intra_eu_reverse_charge" ? (
                <p className="mt-2 text-xs text-slate-600">
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-900">
                    UE — reverse charge (faktura 0% VAT)
                  </span>
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void removeOrArchive()}
              className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
            >
              {detail.status === "Draft" ? "Usuń / archiwizuj" : "Archiwizuj"}
            </button>
          </header>

          {orderDraftTotals ? (
            <div className="mb-6 grid grid-cols-2 gap-3 lg:hidden">
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs text-slate-500">Razem netto</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                  {orderDraftTotals.grandNet.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{" "}
                  {orderDraftTotals.currency}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs text-slate-500">Razem brutto</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                  {orderDraftTotals.grandGross.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{" "}
                  {orderDraftTotals.currency}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs text-slate-500">Pozycje</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{orderDraftTotals.lines}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs text-slate-500">Sztuki</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {orderDraftTotals.qtyTotal.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1 space-y-6">
              {detail.supplier ? (
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-semibold text-slate-900">Dostawca</h2>
                  <p className="mt-1 font-medium text-slate-800">{detail.supplier.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {[detail.supplier.email, detail.supplier.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </section>
              ) : null}

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">Nagłówek zamówienia</h2>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Notatki</label>
                    <textarea
                      className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      disabled={detail.status === "Closed" || detail.status === "Cancelled"}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-slate-600">Oczekiwana data</label>
                      <input
                        type="datetime-local"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={editExpected}
                        onChange={(e) => setEditExpected(e.target.value)}
                        disabled={detail.status === "Closed" || detail.status === "Cancelled"}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Koszt wysyłki (netto)</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                        value={editShipping}
                        onChange={(e) => setEditShipping(e.target.value)}
                        disabled={detail.status === "Closed" || detail.status === "Cancelled"}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Data faktury / kursu (opcjonalnie)</label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={editInvoiceDate}
                        onChange={(e) => setEditInvoiceDate(e.target.value)}
                        disabled={detail.status === "Closed" || detail.status === "Cancelled"}
                      />
                    </div>
                  </div>
                  {detail.currency && detail.currency.toUpperCase() !== "PLN" && !detail.fx_rate_to_pln ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={fxBusy || detail.status === "Closed" || detail.status === "Cancelled"}
                        className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-40"
                        onClick={async () => {
                          setFxBusy(true);
                          setErr(null);
                          try {
                            const basis = editInvoiceDate.trim() || detail.fx_basis_date?.slice(0, 10);
                            await postPurchasingFxNbpFetch({
                              tenant_id: tenantId,
                              currency: detail.currency!,
                              rate_date: basis || undefined,
                            });
                            await loadDetail();
                            setToast("Pobrano kurs NBP.");
                          } catch {
                            setErr("Nie udało się pobrać kursu NBP (sprawdź datę i walutę).");
                          } finally {
                            setFxBusy(false);
                          }
                        }}
                      >
                        {fxBusy ? "Pobieranie…" : "Pobierz kurs NBP"}
                      </button>
                      <span className="text-xs text-slate-500">Zapisuje tabelę A NBP dla wybranej daty.</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={saving || detail.status === "Closed" || detail.status === "Cancelled"}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
                    onClick={() => void saveMeta()}
                  >
                    Zapisz nagłówek
                  </button>
                </div>
              </section>

              <section className="min-w-0">
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Pozycje</h2>
                    <p className="text-xs text-slate-500">
                      Cena jednostkowa netto; VAT dostawcy {Math.round(supplierVatFrac * 100)}% — podgląd.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={saving || detail.status === "Closed" || detail.status === "Cancelled"}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                    onClick={() => void saveLines()}
                  >
                    Zapisz pozycje
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="max-h-[min(70vh,calc(100vh-14rem))] overflow-auto">
                    <table className="min-w-[1200px] w-full border-collapse text-sm">
                      <thead className="sticky top-0 z-20 border-b border-slate-200 shadow-sm">
                        <tr>
                          <th className={`${thBase} w-[72px]`} aria-label="Miniatura" />
                          <th className={`${thBase} min-w-[320px] max-w-md`}>Produkt</th>
                          <th className={`${thBase} min-w-[140px]`}>SKU / EAN</th>
                          <th className={thRight}>Stan</th>
                          <th className={thRight}>Sprzedaż 30 dni</th>
                          <th className={thRight}>Sugestia</th>
                          <th className={thRight}>Ilość</th>
                          <th className={thRight}>Cena netto</th>
                          <th className={thRight}>VAT %</th>
                          <th className={thRight}>Cena brutto</th>
                          <th className={thRight}>Wartość netto</th>
                          <th className={thRight}>Wartość brutto</th>
                          <th className={thRight}>Marża %</th>
                          <th className={`${thBase} min-w-[7rem]`}>Dostawca</th>
                          <th className={thRight}>Realizacja</th>
                          <th className={thRight}>Przyjęto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((it: PurchaseOrderLine) => {
                          const dr = lineDraft[it.id];
                          const q = dr ? parseLocaleNumber(dr.qty) : it.qty;
                          const upNet = dr && dr.unit_price !== "" ? parseLocaleNumber(dr.unit_price) : (it.unit_price ?? 0);
                          const lineNet = q * upNet;
                          const vatAmt = lineNet * supplierVatFrac;
                          const lineGross = lineNet + vatAmt;
                          const upGross = upNet * (1 + supplierVatFrac);
                          const mar =
                            it.sell_price != null && it.sell_price > 0 && upNet > 0
                              ? ((it.sell_price - upNet) / it.sell_price) * 100
                              : null;
                          return (
                            <tr key={it.id} className="hover:bg-slate-50/80">
                              <td className={`${tdBase} w-[72px]`}>
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                  {it.image_url ? (
                                    <img src={it.image_url} alt="" className="max-h-16 max-w-16 object-contain" />
                                  ) : (
                                    <span className="text-[10px] text-slate-400">brak</span>
                                  )}
                                </div>
                              </td>
                              <td className={`${tdBase} min-w-[320px] max-w-md`}>
                                <div className="line-clamp-2 min-w-[320px] font-medium leading-snug text-slate-900">
                                  {it.product_name ?? `Produkt #${it.product_id}`}
                                </div>
                              </td>
                              <td className={`${tdBase} min-w-[140px] text-slate-600`}>
                                {it.sku ? (
                                  <div className="break-all">
                                    <span className="text-slate-400">SKU:</span> {it.sku}
                                  </div>
                                ) : null}
                                {it.ean ? (
                                  <div className="mt-0.5 break-all">
                                    <span className="text-slate-400">EAN:</span> {it.ean}
                                  </div>
                                ) : null}
                                {!it.sku && !it.ean ? <span className="text-slate-400">—</span> : null}
                              </td>
                              <td className={tdRight}>{it.current_stock ?? "—"}</td>
                              <td className={tdRight}>{it.sales_30d ?? "—"}</td>
                              <td className={tdRight}>{it.suggested_qty ?? "—"}</td>
                              <td className={tdRight}>
                                <input
                                  className="w-24 rounded-md border border-slate-200 px-2 py-1 text-right tabular-nums"
                                  value={dr?.qty ?? String(it.qty)}
                                  onChange={(e) =>
                                    setLineDraft((m) => ({
                                      ...m,
                                      [it.id]: { ...(m[it.id] ?? { qty: "", unit_price: "", received_qty: "" }), qty: e.target.value },
                                    }))
                                  }
                                  disabled={detail.status !== "Draft"}
                                />
                              </td>
                              <td className={tdRight}>
                                <input
                                  className="w-24 rounded-md border border-slate-200 px-2 py-1 text-right tabular-nums"
                                  value={dr?.unit_price ?? (it.unit_price != null ? String(it.unit_price) : "")}
                                  onChange={(e) =>
                                    setLineDraft((m) => ({
                                      ...m,
                                      [it.id]: {
                                        ...(m[it.id] ?? { qty: "", unit_price: "", received_qty: "" }),
                                        unit_price: e.target.value,
                                      },
                                    }))
                                  }
                                  disabled={detail.status !== "Draft"}
                                />
                              </td>
                              <td className={tdRight}>{Math.round(supplierVatFrac * 100)}</td>
                              <td className={`${tdRight} text-slate-700`}>
                                {upNet > 0 ? upGross.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                              </td>
                              <td className={`${tdRight} font-medium`}>
                                {lineNet.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className={`${tdRight} font-medium text-slate-800`}>
                                {lineGross.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className={tdRight}>{mar != null ? `${mar.toFixed(1)}%` : "—"}</td>
                              <td className={`${tdBase} min-w-[7rem] max-w-[10rem] break-words text-slate-700`}>
                                {it.supplier_name ?? "—"}
                              </td>
                              <td className={`${tdRight} text-slate-600`}>
                                {it.lead_time_days != null ? `${it.lead_time_days} d` : "—"}
                              </td>
                              <td className={tdRight}>
                                <input
                                  className="w-20 rounded-md border border-slate-200 px-2 py-1 text-right tabular-nums"
                                  value={dr?.received_qty ?? String(it.received_qty ?? 0)}
                                  onChange={(e) =>
                                    setLineDraft((m) => ({
                                      ...m,
                                      [it.id]: {
                                        ...(m[it.id] ?? { qty: "", unit_price: "", received_qty: "" }),
                                        received_qty: e.target.value,
                                      },
                                    }))
                                  }
                                  disabled={detail.status === "Closed" || detail.status === "Cancelled"}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">Status dokumentu</h2>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <select
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as PoStatus | "")}
                  >
                    <option value="">Wybierz nowy status</option>
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!nextStatus || saving}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
                    onClick={() => void applyStatus()}
                  >
                    Zmień status
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">Dostawa magazynowa</h2>
                {detail.inbound_delivery_id ? (
                  <p className="mt-2 text-sm text-slate-700">
                    Powiązana dostawa:{" "}
                    <Link
                      className="font-medium text-sky-700 underline"
                      to={`/goods-orders?tenant_id=${tenantId}&highlight=${detail.inbound_delivery_id}`}
                    >
                      #{detail.inbound_delivery_id}
                    </Link>
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={deliveryBusy || detail.status === "Cancelled" || detail.status === "Closed" || saving}
                    className="mt-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                    onClick={() => void createDelivery()}
                  >
                    {deliveryBusy ? "Tworzenie…" : "Utwórz dostawę magazynową"}
                  </button>
                )}
              </section>
            </div>

            {orderDraftTotals ? (
              <aside className="hidden w-full shrink-0 lg:block lg:w-80 lg:max-w-[min(100%,20rem)]">
                <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">{summaryPanel}</div>
              </aside>
            ) : null}
          </div>
        </>
      )}
      </div>
    </PageGutter>
  );
}
