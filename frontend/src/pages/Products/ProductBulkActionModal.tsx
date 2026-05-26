import { useCallback, useEffect, useState } from "react";
import { listManufacturers, type ManufacturerRead } from "../../api/manufacturersApi";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { bulkUpdateProducts, type BulkUpdateAction } from "../../api/productsBulkApi";
import type { ProductBulkListFiltersPayload } from "../../utils/productListBulkFilters";

import type { ProductBulkHubChoice } from "./productBulkHubTypes";

export const BULK_ACTION_GROUPS: {
  label: string;
  actions: { id: ProductBulkHubChoice; label: string; danger?: boolean }[];
}[] = [
  {
    label: "Dane podstawowe",
    actions: [
      { id: "set_manufacturer", label: "Ustaw producenta" },
      { id: "set_supplier", label: "Ustaw domyślnego dostawcę" },
    ],
  },
  {
    label: "Ceny",
    actions: [
      { id: "set_price", label: "Ustaw cenę" },
      { id: "increase_price_percent", label: "Zwiększ cenę o %" },
      { id: "set_vat_rate", label: "Ustaw stawkę VAT" },
    ],
  },
  {
    label: "WMS i logistyka",
    actions: [
      { id: "patch_wms_requirements", label: "Ustaw wymagania WMS" },
      { id: "patch_logistics_data", label: "Ustaw dane logistyczne" },
      { id: "patch_replenishment", label: "Ustaw uzupełnienia" },
      { id: "patch_orientation_stacking", label: "Ustaw orientację / składowanie" },
      { id: "clear_logistics_data", label: "Wyczyść dane logistyczne" },
      { id: "toggle_master_carton_pack", label: "Włącz / wyłącz opakowanie zbiorcze (WMS)" },
      { id: "set_weight", label: "Ustaw wagę jednostki (kg)" },
      { id: "set_dimensions", label: "Ustaw wymiary jednostki (L × W × H cm)" },
    ],
  },
  {
    label: "Magazyn",
    actions: [{ id: "set_min_stock", label: "Próg alarmu stanu (min. łączny)" }],
  },
  {
    label: "Operacje ryzykowne",
    actions: [{ id: "delete_products", label: "Usuń produkty", danger: true }],
  },
];

/** Wartości zapisywane w ``metadata_json.product_ui.vat_rate`` (zgodnie z kartą produktu). */
export const BULK_VAT_PRESET_OPTIONS: { token: string; label: string }[] = [
  { token: "23", label: "23%" },
  { token: "8", label: "8%" },
  { token: "5", label: "5%" },
  { token: "0", label: "0%" },
  { token: "zw", label: "zw." },
  { token: "np", label: "np." },
];

export type ProductBulkModalSelection =
  | { mode: "explicit_ids"; productIds: number[] }
  | { mode: "filtered_query"; filters: ProductBulkListFiltersPayload; count: number };

type Props = {
  open: boolean;
  tenantId: number;
  selection: ProductBulkModalSelection;
  action: BulkUpdateAction | "";
  onClose: () => void;
  onSuccess: () => void;
};

function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function ProductBulkActionModal({ open, tenantId, selection, action, onClose, onSuccess }: Props) {
  const [manufacturers, setManufacturers] = useState<ManufacturerRead[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [manufacturerId, setManufacturerId] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [priceField, setPriceField] = useState<"sale_price" | "purchase_price">("sale_price");
  const [priceAmount, setPriceAmount] = useState("");
  const [percentAmount, setPercentAmount] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [lenCm, setLenCm] = useState("");
  const [widCm, setWidCm] = useState("");
  const [heiCm, setHeiCm] = useState("");
  const [minStock, setMinStock] = useState("");
  const [enableAlert, setEnableAlert] = useState(true);
  const [vatToken, setVatToken] = useState<string>("");

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [m, s] = await Promise.all([
        listManufacturers({ tenantId, status: "all" }),
        listSuppliers(tenantId, { status: "all" }),
      ]);
      setManufacturers(m);
      setSuppliers(s);
    } catch {
      setManufacturers([]);
      setSuppliers([]);
    } finally {
      setLoadingMeta(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setManufacturerId("");
    setSupplierId("");
    setPriceAmount("");
    setPercentAmount("");
    setWeightKg("");
    setLenCm("");
    setWidCm("");
    setHeiCm("");
    setMinStock("");
    setEnableAlert(true);
    setVatToken("");
    setPriceField("sale_price");
    void loadMeta();
  }, [open, action, loadMeta]);

  const n = selection.mode === "explicit_ids" ? selection.productIds.length : selection.count;

  const submit = async () => {
    if (!action || n === 0) return;
    setErr(null);
    let value: unknown;

    switch (action) {
      case "set_manufacturer": {
        if (manufacturerId === "__clear__") value = null;
        else {
          const id = Number(manufacturerId);
          if (!Number.isFinite(id) || id < 1) {
            setErr("Wybierz producenta lub „Brak”.");
            return;
          }
          value = id;
        }
        break;
      }
      case "set_supplier": {
        if (supplierId === "__clear__") value = null;
        else {
          const id = Number(supplierId);
          if (!Number.isFinite(id) || id < 1) {
            setErr("Wybierz dostawcę lub „Brak”.");
            return;
          }
          value = id;
        }
        break;
      }
      case "set_price": {
        const amt = parseDecimal(priceAmount);
        if (amt == null || amt < 0) {
          setErr("Podaj nieujemną cenę.");
          return;
        }
        value = { field: priceField, amount: amt };
        break;
      }
      case "increase_price_percent": {
        const p = parseDecimal(percentAmount);
        if (p == null) {
          setErr("Podaj procent (może być ujemny).");
          return;
        }
        value = { field: priceField, percent: p };
        break;
      }
      case "set_vat_rate": {
        const t = vatToken.trim().toLowerCase();
        if (!t) {
          setErr("Wybierz stawkę VAT.");
          return;
        }
        value = t;
        break;
      }
      case "set_weight": {
        const w = parseDecimal(weightKg);
        if (w == null || w < 0) {
          setErr("Podaj wagę ≥ 0.");
          return;
        }
        value = w;
        break;
      }
      case "set_dimensions": {
        const L = parseDecimal(lenCm);
        const W = parseDecimal(widCm);
        const H = parseDecimal(heiCm);
        if (L == null || W == null || H == null || L <= 0 || W <= 0 || H <= 0) {
          setErr("Podaj trzy wymiary większe od zera (cm).");
          return;
        }
        value = { length_cm: L, width_cm: W, height_cm: H };
        break;
      }
      case "set_min_stock": {
        const m = parseDecimal(minStock);
        if (m == null || m < 0) {
          setErr("Podaj próg ≥ 0.");
          return;
        }
        value = { min_total_stock: m, enable_stock_alert: enableAlert };
        break;
      }
      default:
        setErr("Nieobsługiwana akcja.");
        return;
    }

    if (!window.confirm(`Zastosować akcję do ${n} produktów?`)) return;

    setSubmitting(true);
    try {
      if (selection.mode === "explicit_ids") {
        await bulkUpdateProducts(tenantId, {
          selection_mode: "explicit_ids",
          product_ids: selection.productIds,
          action,
          value,
        });
      } else {
        await bulkUpdateProducts(tenantId, {
          selection_mode: "filtered_query",
          filters: selection.filters,
          action,
          value,
        });
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      const d =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      setErr(d != null ? String(d) : "Operacja nie powiodła się.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !action) return null;

  const label = BULK_ACTION_GROUPS.flatMap((g) => g.actions).find((a) => a.id === action)?.label ?? action;
  const inputCls =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-violet-400 focus:ring-2 focus:ring-violet-500";
  const lbl = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <div className="fixed inset-0 z-[270] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-black text-slate-900">Multiakcje</h2>
        <p className="mt-1 text-sm font-medium text-violet-800">{label}</p>
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-semibold text-slate-900">
          Zastosowanie do <span className="font-black tabular-nums text-violet-900">{n}</span>{" "}
          {n === 1 ? "produktu" : "produktów"}
        </p>

        {loadingMeta ? <p className="mt-3 text-sm text-slate-500">Ładowanie list…</p> : null}

        <div className="mt-4 space-y-3">
          {action === "set_manufacturer" && (
            <div>
              <label className={lbl}>Producent</label>
              <select className={inputCls} value={manufacturerId} onChange={(e) => setManufacturerId(e.target.value)}>
                <option value="">— Wybierz —</option>
                <option value="__clear__">Brak (wyczyść)</option>
                {manufacturers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {!m.active ? " (nieaktywny)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {action === "set_supplier" && (
            <div>
              <label className={lbl}>Domyślny dostawca</label>
              <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— Wybierz —</option>
                <option value="__clear__">Brak (wyczyść)</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {!s.active ? " (nieaktywny)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {action === "set_vat_rate" && (
            <div>
              <p className="mb-2 text-sm font-semibold leading-snug text-slate-800">
                Stawka VAT (metadane produktu — OMS, dokumenty, rozliczenia)
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BULK_VAT_PRESET_OPTIONS.map((o) => (
                  <button
                    key={o.token}
                    type="button"
                    className={[
                      "rounded-xl border-2 px-3 py-3 text-center text-base font-bold transition",
                      vatToken === o.token
                        ? "border-violet-600 bg-violet-50 text-violet-950"
                        : "border-slate-200 bg-white text-slate-900 hover:border-slate-300",
                    ].join(" ")}
                    onClick={() => setVatToken(o.token)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(action === "set_price" || action === "increase_price_percent") && (
            <>
              <div>
                <label className={lbl}>Która cena</label>
                <select className={inputCls} value={priceField} onChange={(e) => setPriceField(e.target.value as "sale_price" | "purchase_price")}>
                  <option value="sale_price">Cena sprzedaży</option>
                  <option value="purchase_price">Cena zakupu</option>
                </select>
              </div>
              {action === "set_price" ? (
                <div>
                  <label className={lbl}>Nowa wartość</label>
                  <input className={inputCls} value={priceAmount} onChange={(e) => setPriceAmount(e.target.value)} inputMode="decimal" placeholder="np. 29,99" />
                </div>
              ) : (
                <div>
                  <label className={lbl}>Zmiana o (%)</label>
                  <input
                    className={inputCls}
                    value={percentAmount}
                    onChange={(e) => setPercentAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="np. 10 lub -5"
                  />
                  <p className="mt-1 text-xs text-slate-500">Dla pustej ceny w bazie wynik pozostanie pusty.</p>
                </div>
              )}
            </>
          )}

          {action === "set_weight" && (
            <div>
              <label className={lbl}>Waga (kg)</label>
              <input className={inputCls} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} inputMode="decimal" placeholder="np. 0,25" />
            </div>
          )}

          {action === "set_dimensions" && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={lbl}>Dł. cm</label>
                <input className={inputCls} value={lenCm} onChange={(e) => setLenCm(e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <label className={lbl}>Szer. cm</label>
                <input className={inputCls} value={widCm} onChange={(e) => setWidCm(e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <label className={lbl}>Wys. cm</label>
                <input className={inputCls} value={heiCm} onChange={(e) => setHeiCm(e.target.value)} inputMode="decimal" />
              </div>
            </div>
          )}

          {action === "set_min_stock" && (
            <>
              <div>
                <label className={lbl}>Minimalny łączny stan (alarm)</label>
                <input className={inputCls} value={minStock} onChange={(e) => setMinStock(e.target.value)} inputMode="decimal" placeholder="np. 5" />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="rounded border-slate-300" checked={enableAlert} onChange={(e) => setEnableAlert(e.target.checked)} />
                Włącz alarm magazynowy
              </label>
            </>
          )}
        </div>

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Anuluj
          </button>
          <button
            type="button"
            disabled={submitting || loadingMeta}
            onClick={() => void submit()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {submitting ? "Zapisywanie…" : `Zastosuj do ${n} produktów`}
          </button>
        </div>
      </div>
    </div>
  );
}
