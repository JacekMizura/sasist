import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { patchOrderItemLine } from "../../api/ordersApi";
import { formatMoney, moneyInputStringFromNumber, roundMoney2 } from "../../utils/formatOrderMoney";

const inp =
  "mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30";

export type OrderEditProductModalItem = {
  id: number;
  quantity: number;
  unit_price?: number | null;
  vat_percent?: number | null;
  unit?: string | null;
  list_price?: number | null;
  line_net_total?: number | null;
  line_gross_total?: number | null;
  line_margin_percent?: number | null;
  product?: { name?: string | null; symbol?: string | null; sku?: string | null; ean?: string | null } | null;
};

type RabatMode = "pct" | "pln_net" | "pln_gross";

type PriceAnchor = "net" | "gross";

function parseDecimalLoose(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

type Props = {
  open: boolean;
  onClose: () => void;
  orderId: number;
  item: OrderEditProductModalItem | null;
  currency: string;
  onSaved: () => void;
  /** Po otwarciu z menu „Rabat” — tylko rabat od ceny katalogowej / bazowej. */
  focusSection?: "main" | "rabat";
};

export default function OrderEditProductModal({
  open,
  onClose,
  orderId,
  item,
  currency,
  onSaved,
  focusSection = "main",
}: Props) {
  const rabatBlockRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [ean, setEan] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [netStr, setNetStr] = useState("");
  const [grossStr, setGrossStr] = useState("");
  const [vatStr, setVatStr] = useState("");
  const [unit, setUnit] = useState("");
  /** Przy zmianie VAT: przelicz drugą cenę względem ostatnio edytowanej netto/brutto (bez pętli). */
  const priceAnchorRef = useRef<PriceAnchor>("net");
  const [rabatMode, setRabatMode] = useState<RabatMode>("pct");
  const [rabat, setRabat] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = useCallback(() => {
    setErr(null);
    setSaving(false);
  }, []);

  useEffect(() => {
    if (!open || !item) {
      reset();
      return;
    }
    reset();
    setName((item.product?.name ?? "").trim() || "—");
    setSku((item.product?.symbol ?? item.product?.sku ?? "").trim());
    setEan((item.product?.ean ?? "").trim());
    setQuantity(String(Math.max(1, Math.floor(Number(item.quantity) || 1))));
    const up = item.unit_price != null && Number.isFinite(Number(item.unit_price)) ? Number(item.unit_price) : null;
    const vp = item.vat_percent != null && Number.isFinite(Number(item.vat_percent)) ? Number(item.vat_percent) : null;
    setNetStr(up != null ? moneyInputStringFromNumber(up) : "");
    setVatStr(vp != null ? String(vp) : "");
    if (up != null && vp != null) {
      setGrossStr(moneyInputStringFromNumber(roundMoney2(up * (1 + vp / 100))));
    } else if (up != null) {
      setGrossStr(moneyInputStringFromNumber(up));
    } else {
      setGrossStr("");
    }
    setUnit((item.unit ?? "").trim());
    priceAnchorRef.current = "net";
    setRabat("");
    setRabatMode("pct");
  }, [open, item, reset]);

  useEffect(() => {
    if (!open || !item || focusSection !== "rabat") return;
    const t = window.setTimeout(() => {
      rabatBlockRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      document.getElementById("order-line-edit-rabat-input")?.focus();
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, item, focusSection]);

  const vatFactor = useCallback(() => {
    const v = parseDecimalLoose(vatStr);
    const vatN = v ?? 0;
    return 1 + vatN / 100;
  }, [vatStr]);

  const onNetChange = (value: string) => {
    priceAnchorRef.current = "net";
    setNetStr(value);
    const n = parseDecimalLoose(value);
    const f = vatFactor();
    if (n != null && f > 0 && Number.isFinite(n)) setGrossStr(moneyInputStringFromNumber(roundMoney2(n * f)));
    else if (value.trim() === "") setGrossStr("");
  };

  const onGrossChange = (value: string) => {
    priceAnchorRef.current = "gross";
    setGrossStr(value);
    const g = parseDecimalLoose(value);
    const f = vatFactor();
    if (g != null && f > 0 && Number.isFinite(g)) setNetStr(moneyInputStringFromNumber(roundMoney2(g / f)));
    else if (value.trim() === "") setNetStr("");
  };

  const onVatChange = (value: string) => {
    setVatStr(value);
    const v = parseDecimalLoose(value);
    const vatN = v ?? 0;
    const f = 1 + vatN / 100;
    if (f <= 0 || !Number.isFinite(f)) return;

    if (priceAnchorRef.current === "gross") {
      const g = parseDecimalLoose(grossStr);
      if (g != null && Number.isFinite(g)) setNetStr(moneyInputStringFromNumber(roundMoney2(g / f)));
    } else {
      const n = parseDecimalLoose(netStr);
      if (n != null && Number.isFinite(n)) setGrossStr(moneyInputStringFromNumber(roundMoney2(n * f)));
      else {
        const g = parseDecimalLoose(grossStr);
        if (g != null && Number.isFinite(g)) setNetStr(moneyInputStringFromNumber(roundMoney2(g / f)));
      }
    }
  };

  const saveMain = async () => {
    if (!item) return;
    const qty = Math.max(1, Math.floor(Number(quantity.replace(",", ".")) || 0));
    if (!Number.isFinite(qty) || qty < 1) {
      setErr("Podaj poprawną ilość.");
      return;
    }
    const netNum = parseDecimalLoose(netStr);
    if (netStr.trim() !== "" && (netNum == null || netNum < 0)) {
      setErr("Podaj poprawną cenę netto lub zostaw puste.");
      return;
    }
    const vatNum = vatStr.trim() === "" ? null : parseDecimalLoose(vatStr);
    if (vatStr.trim() !== "" && (vatNum == null || vatNum < 0 || vatNum > 100)) {
      setErr("VAT musi być w zakresie 0–100 lub pusty.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      await patchOrderItemLine(orderId, item.id, {
        line_edit: {
          quantity: qty,
          unit_price: netNum ?? undefined,
          vat_percent: vatNum ?? undefined,
          unit: unit.trim() || null,
        },
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" &&
        e !== null &&
        "response" in e &&
        typeof (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail === "string"
          ? String((e as { response: { data: { detail: string } } }).response.data.detail)
          : "Nie udało się zapisać pozycji.";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  const saveRabat = async () => {
    if (!item) return;
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const unitNet =
      item.unit_price != null && Number.isFinite(Number(item.unit_price)) ? Number(item.unit_price) : null;
    const vatPct =
      item.vat_percent != null && Number.isFinite(Number(item.vat_percent)) ? Number(item.vat_percent) : 0;
    const lineNet = unitNet != null ? unitNet * qty : null;
    const lineGross =
      lineNet != null && Number.isFinite(vatPct) ? lineNet * (1 + vatPct / 100) : null;

    const catalogBase =
      item.list_price != null && Number.isFinite(Number(item.list_price)) ? Number(item.list_price) : null;
    const pctBase = catalogBase ?? unitNet;

    const rabatRaw = rabat.trim();
    if (rabatRaw === "") {
      setErr("Podaj wartość rabatu.");
      return;
    }
    const r = Number(rabatRaw.replace(",", "."));
    if (Number.isNaN(r) || r < 0) {
      setErr("Podaj poprawny rabat (liczba ≥ 0).");
      return;
    }

    let unitPriceOut: number;

    if (rabatMode === "pct") {
      if (pctBase == null) {
        setErr("Brak ceny katalogowej ani jednostkowej — nie można naliczyć rabatu %.");
        return;
      }
      const p = Math.min(100, r);
      unitPriceOut = pctBase * (1 - p / 100);
    } else if (rabatMode === "pln_net") {
      if (lineNet == null || unitNet == null) {
        setErr("Brak pełnej wartości linii netto — ustaw najpierw cenę jednostkową.");
        return;
      }
      const newLineNet = Math.max(0, lineNet - r);
      unitPriceOut = newLineNet / qty;
    } else {
      if (lineGross == null || lineNet == null || unitNet == null) {
        setErr("Brak danych do rabatu brutto — sprawdź cenę i VAT pozycji.");
        return;
      }
      const newLineGross = Math.max(0, lineGross - r);
      const newLineNet = newLineGross / (1 + vatPct / 100);
      unitPriceOut = newLineNet / qty;
    }

    if (unitPriceOut < 0 || !Number.isFinite(unitPriceOut)) {
      setErr("Rabat jest zbyt duży.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      await patchOrderItemLine(orderId, item.id, {
        line_edit: {
          unit_price: unitPriceOut,
        },
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" &&
        e !== null &&
        "response" in e &&
        typeof (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail === "string"
          ? String((e as { response: { data: { detail: string } } }).response.data.detail)
          : "Nie udało się zapisać pozycji.";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  const rabatLive = useMemo(() => {
    if (!item) return null;
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const unitNet =
      item.unit_price != null && Number.isFinite(Number(item.unit_price)) ? Number(item.unit_price) : null;
    const vatPct =
      item.vat_percent != null && Number.isFinite(Number(item.vat_percent)) ? Number(item.vat_percent) : 0;
    const lineNet = unitNet != null ? unitNet * qty : null;
    const lineGross = lineNet != null ? lineNet * (1 + vatPct / 100) : null;
    const catalogBase =
      item.list_price != null && Number.isFinite(Number(item.list_price)) ? Number(item.list_price) : null;
    const pctBase = catalogBase ?? unitNet;
    const raw = rabat.trim();
    const r = raw === "" ? NaN : Number(raw.replace(",", "."));
    if (raw === "" || Number.isNaN(r) || r < 0) {
      return {
        qty,
        unitNet,
        vatPct,
        lineNet,
        lineGross,
        unitAfter: null as number | null,
        lineNetAfter: null as number | null,
        lineGrossAfter: null as number | null,
        diffLineNet: null as number | null,
      };
    }
    let unitAfter: number | null = null;
    if (rabatMode === "pct") {
      if (pctBase == null) unitAfter = null;
      else unitAfter = pctBase * (1 - Math.min(100, r) / 100);
    } else if (rabatMode === "pln_net") {
      if (lineNet == null) unitAfter = null;
      else unitAfter = Math.max(0, lineNet - r) / qty;
    } else {
      if (lineGross == null || lineNet == null) unitAfter = null;
      else {
        const newLineGross = Math.max(0, lineGross - r);
        const newLineNet = newLineGross / (1 + vatPct / 100);
        unitAfter = newLineNet / qty;
      }
    }
    const lineNetAfter = unitAfter != null ? unitAfter * qty : null;
    const lineGrossAfter =
      lineNetAfter != null ? lineNetAfter * (1 + vatPct / 100) : null;
    const diffLineNet =
      lineNet != null && lineNetAfter != null ? lineNet - lineNetAfter : null;
    const mp = item.line_margin_percent;
    let marginHint: string | null = null;
    if (mp != null && Number.isFinite(Number(mp)) && unitNet != null && unitAfter != null) {
      const delta = unitAfter - unitNet;
      marginHint =
        delta <= 1e-9
          ? `Marża szac.: bez zmian vs poprzednia cena jednostkowa`
          : `Cena jednostkowa netto: ${formatMoney(unitNet, currency)} → ${formatMoney(unitAfter, currency)}`;
    }
    return {
      qty,
      unitNet,
      vatPct,
      lineNet,
      lineGross,
      unitAfter,
      lineNetAfter,
      lineGrossAfter,
      diffLineNet,
      marginHint,
    };
  }, [item, rabat, rabatMode, currency]);

  if (!open || !item) return null;

  const baseLabel =
    item.list_price != null && Number.isFinite(Number(item.list_price))
      ? `Cena katalogowa (bazowa %): ${formatMoney(Number(item.list_price), currency)} netto / szt.`
      : `Bieżąca cena jednostkowa netto: ${
          item.unit_price != null && Number.isFinite(Number(item.unit_price)) ? formatMoney(Number(item.unit_price), currency) : "—"
        }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl ${
          focusSection === "rabat" ? "max-w-2xl p-6 sm:p-8" : "max-w-lg p-5"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            {focusSection === "rabat" ? "Rabat na pozycji" : "Edytuj pozycję"}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
            Zamknij
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Produkt (tylko podgląd) — waluta zamówienia: <span className="font-semibold">{currency}</span>
        </p>

        {focusSection === "main" ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                Nazwa
                <input className={inp} value={name} readOnly disabled />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                SKU
                <input className={inp} value={sku} readOnly disabled />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                EAN
                <input className={inp} value={ean} readOnly disabled />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Ilość
                <input className={inp} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Cena netto ({currency})
                <input className={inp} inputMode="decimal" value={netStr} onChange={(e) => onNetChange(e.target.value)} placeholder="netto jedn." />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Cena brutto ({currency})
                <input className={inp} inputMode="decimal" value={grossStr} onChange={(e) => onGrossChange(e.target.value)} placeholder="brutto jedn." />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                VAT %
                <input className={inp} inputMode="decimal" value={vatStr} onChange={(e) => onVatChange(e.target.value)} placeholder="opcjonalnie" />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Jednostka
                <input className={inp} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="np. szt." />
              </label>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-slate-500">
              Zapis: <span className="font-medium">cena netto</span> i VAT do zamówienia (pole jednostkowej ceny w systemie).
            </p>
          </>
        ) : (
          <div ref={rabatBlockRef} className="mt-6 space-y-6">
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pozycja</p>
              <p className="mt-1 text-lg font-semibold leading-snug text-slate-900">{name}</p>
              {(sku || ean) && (
                <p className="mt-1 text-xs text-slate-500">
                  {[sku, ean].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="mt-3 text-sm text-slate-700">{baseLabel}</p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-white/90 px-3 py-2 shadow-sm ring-1 ring-slate-100">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Ilość</dt>
                  <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{rabatLive?.qty ?? "—"}</dd>
                </div>
                <div className="rounded-lg bg-white/90 px-3 py-2 shadow-sm ring-1 ring-slate-100">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">VAT</dt>
                  <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
                    {rabatLive?.vatPct != null ? `${rabatLive.vatPct}%` : "—"}
                  </dd>
                </div>
                <div className="rounded-lg bg-white/90 px-3 py-2 shadow-sm ring-1 ring-slate-100 sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Wartość linii (netto → brutto)</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                    {rabatLive?.lineNet != null ? formatMoney(rabatLive.lineNet, currency) : "—"}
                    <span className="mx-1.5 font-normal text-slate-400">→</span>
                    {rabatLive?.lineGross != null ? formatMoney(rabatLive.lineGross, currency) : "—"}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Typ rabatu</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRabatMode("pct")}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                    rabatMode === "pct" ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Procent (%)
                </button>
                <button
                  type="button"
                  onClick={() => setRabatMode("pln_net")}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                    rabatMode === "pln_net" ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {currency} netto (linia)
                </button>
                <button
                  type="button"
                  onClick={() => setRabatMode("pln_gross")}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                    rabatMode === "pln_gross" ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {currency} brutto (linia)
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Zapisuje nową <span className="font-medium text-slate-700">cenę jednostkową netto</span> pozycji (przeliczenie jak w panelu zamówień).
              </p>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              {rabatMode === "pct"
                ? "Rabat procentowy od ceny katalogowej (lub jednostkowej, gdy brak katalogu)"
                : rabatMode === "pln_net"
                  ? `Kwota rabatu netto od całej linii (${currency})`
                  : `Kwota rabatu brutto od całej linii (${currency})`}
              <input
                id="order-line-edit-rabat-input"
                className={`${inp} mt-2 text-base`}
                inputMode="decimal"
                value={rabat}
                onChange={(e) => setRabat(e.target.value)}
                placeholder={rabatMode === "pct" ? "np. 10" : "np. 25,00"}
              />
            </label>

            {rabatLive &&
            (rabatLive.unitAfter != null || rabatLive.diffLineNet != null || rabatLive.marginHint) ? (
              <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/50 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/90">Podgląd po rabacie</p>
                <ul className="mt-3 space-y-2 text-sm text-emerald-950">
                  {rabatLive.unitNet != null && rabatLive.unitAfter != null ? (
                    <li className="flex flex-wrap justify-between gap-2 border-b border-emerald-100/80 pb-2">
                      <span className="text-slate-600">Cena jednostkowa netto</span>
                      <span className="font-semibold tabular-nums">
                        {formatMoney(rabatLive.unitNet, currency)} → {formatMoney(rabatLive.unitAfter, currency)}
                      </span>
                    </li>
                  ) : null}
                  {rabatLive.lineNet != null && rabatLive.lineNetAfter != null ? (
                    <li className="flex flex-wrap justify-between gap-2 border-b border-emerald-100/80 pb-2">
                      <span className="text-slate-600">Wartość linii netto</span>
                      <span className="font-semibold tabular-nums">
                        {formatMoney(rabatLive.lineNet, currency)} → {formatMoney(rabatLive.lineNetAfter, currency)}
                      </span>
                    </li>
                  ) : null}
                  {rabatLive.lineGross != null && rabatLive.lineGrossAfter != null ? (
                    <li className="flex flex-wrap justify-between gap-2 border-b border-emerald-100/80 pb-2">
                      <span className="text-slate-600">Wartość linii brutto</span>
                      <span className="font-semibold tabular-nums">
                        {formatMoney(rabatLive.lineGross, currency)} → {formatMoney(rabatLive.lineGrossAfter, currency)}
                      </span>
                    </li>
                  ) : null}
                  {rabatLive.diffLineNet != null && rabatLive.diffLineNet > 1e-9 ? (
                    <li className="flex flex-wrap justify-between gap-2">
                      <span className="text-slate-600">Oszczędność netto na linii</span>
                      <span className="font-bold tabular-nums text-emerald-800">
                        −{formatMoney(rabatLive.diffLineNet, currency)}
                      </span>
                    </li>
                  ) : null}
                  {rabatLive.marginHint ? (
                    <li className="pt-1 text-xs leading-snug text-slate-600">{rabatLive.marginHint}</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
            Anuluj
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void (focusSection === "rabat" ? saveRabat() : saveMain())}
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "…" : "Zapisz"}
          </button>
        </div>
      </div>
    </div>
  );
}
