import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import api from "../../../api/axios";
import { productService } from "../../../services/productService";
import {
  validateRequiredProductData,
  type MissingReceivingField,
  type ProductReceivingRequirements,
  type ProductReceivingValues,
} from "../../../utils/validateRequiredProductData";

type ProductRecord = ProductReceivingValues &
  ProductReceivingRequirements & {
    id?: number;
    name?: string;
    ean?: string | null;
    image_url?: string | null;
  };

export type ProductDataCompletionModalProps = {
  open: boolean;
  tenantId: number;
  productId: number;
  productName?: string | null;
  productEan?: string | null;
  imageUrl?: string | null;
  missingLabels?: string[];
  /** WMS-created product: show all logistics fields (optional). */
  forceAllFields?: boolean;
  onSkip: () => void;
  onSaved: () => void;
};

function displayMissingLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("wymiar")) return "Wymiary";
  if (l.includes("wagi")) return "Waga";
  if (l.includes("ean")) return "EAN opakowania zbiorczego";
  if (l.includes("karton")) return "Opakowanie zbiorcze";
  return label;
}

function parseNum(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fieldVisible(
  key: string,
  missing: MissingReceivingField[],
  forceAll: boolean,
): boolean {
  if (forceAll) {
    return [
      "height",
      "width",
      "length",
      "weight",
      "bulk_ean",
      "units_per_carton",
      "carton_dimensions",
      "carton_weight_kg",
      "master_carton",
    ].includes(key);
  }
  if (key === "carton_dimensions") {
    return missing.some((m) => m.key === "carton_dimensions");
  }
  if (key === "master_carton") {
    return missing.some((m) => m.key === "master_carton");
  }
  return missing.some((m) => m.key === key);
}

export function ProductDataCompletionModal({
  open,
  tenantId,
  productId,
  productName,
  productEan,
  imageUrl,
  missingLabels,
  forceAllFields = false,
  onSkip,
  onSaved,
}: ProductDataCompletionModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductRecord | null>(null);

  const [height, setHeight] = useState("");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [weight, setWeight] = useState("");
  const [bulkEan, setBulkEan] = useState("");
  const [unitsPerCarton, setUnitsPerCarton] = useState("");
  const [cartonL, setCartonL] = useState("");
  const [cartonW, setCartonW] = useState("");
  const [cartonH, setCartonH] = useState("");
  const [cartonWeight, setCartonWeight] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<ProductRecord>(`/products/${productId}/`, {
        params: { tenant_id: tenantId },
      });
      const p = res.data;
      setProduct(p);
      setHeight(p.height != null ? String(p.height) : "");
      setWidth(p.width != null ? String(p.width) : "");
      setLength(p.length != null ? String(p.length) : "");
      setWeight(p.weight != null ? String(p.weight) : "");
      setBulkEan((p.bulk_ean ?? "").trim());
      setUnitsPerCarton(p.units_per_carton != null ? String(p.units_per_carton) : "");
      setCartonL(p.carton_length_cm != null ? String(p.carton_length_cm) : "");
      setCartonW(p.carton_width_cm != null ? String(p.carton_width_cm) : "");
      setCartonH(p.carton_height_cm != null ? String(p.carton_height_cm) : "");
      setCartonWeight(p.carton_weight_kg != null ? String(p.carton_weight_kg) : "");
    } catch {
      setErr("Nie udało się wczytać produktu");
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [productId, tenantId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const draft = useMemo((): ProductReceivingValues & ProductReceivingRequirements => {
    const base = product ?? {};
    return {
      ...base,
      height: parseNum(height),
      width: parseNum(width),
      length: parseNum(length),
      weight: parseNum(weight),
      bulk_ean: bulkEan.trim() || null,
      units_per_carton: parseNum(unitsPerCarton),
      carton_length_cm: parseNum(cartonL),
      carton_width_cm: parseNum(cartonW),
      carton_height_cm: parseNum(cartonH),
      carton_weight_kg: parseNum(cartonWeight),
    };
  }, [product, height, width, length, weight, bulkEan, unitsPerCarton, cartonL, cartonW, cartonH, cartonWeight]);

  const validation = useMemo(() => validateRequiredProductData(draft), [draft]);
  const missing = validation.missing;

  const showHeight = fieldVisible("height", missing, forceAllFields);
  const showWidth = fieldVisible("width", missing, forceAllFields);
  const showLength = fieldVisible("length", missing, forceAllFields);
  const showWeight = fieldVisible("weight", missing, forceAllFields);
  const showBulkEan = fieldVisible("bulk_ean", missing, forceAllFields) || fieldVisible("master_carton", missing, forceAllFields);
  const showUnits = fieldVisible("units_per_carton", missing, forceAllFields) || fieldVisible("master_carton", missing, forceAllFields);
  const showCartonDims = fieldVisible("carton_dimensions", missing, forceAllFields);
  const showCartonWeight = fieldVisible("carton_weight_kg", missing, forceAllFields);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {};
      if (showHeight) body.height_cm = parseNum(height);
      if (showWidth) body.width_cm = parseNum(width);
      if (showLength) body.length_cm = parseNum(length);
      if (showWeight) body.weight_kg = parseNum(weight);
      if (showBulkEan) body.bulk_ean = bulkEan.trim() || null;
      if (showUnits) body.units_per_carton = parseNum(unitsPerCarton);
      if (showCartonDims) {
        body.carton_length_cm = parseNum(cartonL);
        body.carton_width_cm = parseNum(cartonW);
        body.carton_height_cm = parseNum(cartonH);
      }
      if (showCartonWeight) body.carton_weight_kg = parseNum(cartonWeight);
      await productService.updateProduct(productId, body, { tenant_id: tenantId });
      onSaved();
    } catch {
      setErr("Nie udało się zapisać danych produktu");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const title = (productName || product?.name || "").trim() || `Produkt #${productId}`;
  const ean = (productEan || product?.ean || "").trim();
  const img = imageUrl || product?.image_url || null;
  const labels = missingLabels?.length ? missingLabels : validation.badgeLabels;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-900">Uzupełnij wymagane dane produktu</h2>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Zamknij"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
              {img ? <img src={img} alt="" className="max-h-full max-w-full object-contain" /> : null}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 line-clamp-2">{title}</p>
              {ean ? <p className="mt-0.5 font-mono text-xs text-slate-500">EAN: {ean}</p> : null}
              {labels.length > 0 ? (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Brakujące dane:</p>
                  <ul className="mt-1.5 space-y-1">
                    {labels.map((lbl) => (
                      <li key={lbl} className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <span className="text-slate-400" aria-hidden>
                          ☐
                        </span>
                        {displayMissingLabel(lbl)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8 text-slate-500">
              <Loader2 className="animate-spin" size={28} />
            </div>
          ) : (
            <>
              {(showHeight || showWidth || showLength || showWeight) && (
                <section className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Wymiary jednostki (cm / kg)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {showLength ? (
                      <label className="block text-xs font-semibold text-slate-600">
                        Długość [cm]
                        <input
                          value={length}
                          onChange={(e) => setLength(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    ) : null}
                    {showWidth ? (
                      <label className="block text-xs font-semibold text-slate-600">
                        Szerokość [cm]
                        <input
                          value={width}
                          onChange={(e) => setWidth(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    ) : null}
                    {showHeight ? (
                      <label className="block text-xs font-semibold text-slate-600">
                        Wysokość [cm]
                        <input
                          value={height}
                          onChange={(e) => setHeight(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    ) : null}
                    {showWeight ? (
                      <label className="block text-xs font-semibold text-slate-600">
                        Waga [kg]
                        <input
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    ) : null}
                  </div>
                </section>
              )}

              {(showBulkEan || showUnits || showCartonDims || showCartonWeight) && (
                <section className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Opakowanie zbiorcze</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {showBulkEan ? (
                      <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                        EAN kartonu
                        <input
                          value={bulkEan}
                          onChange={(e) => setBulkEan(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                        />
                      </label>
                    ) : null}
                    {showUnits ? (
                      <label className="block text-xs font-semibold text-slate-600">
                        Szt. w kartonie
                        <input
                          value={unitsPerCarton}
                          onChange={(e) => setUnitsPerCarton(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    ) : null}
                    {showCartonDims ? (
                      <>
                        <label className="block text-xs font-semibold text-slate-600">
                          Dł. kartonu [cm]
                          <input value={cartonL} onChange={(e) => setCartonL(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                          Szer. kartonu [cm]
                          <input value={cartonW} onChange={(e) => setCartonW(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                          Wys. kartonu [cm]
                          <input value={cartonH} onChange={(e) => setCartonH(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                        </label>
                      </>
                    ) : null}
                    {showCartonWeight ? (
                      <label className="block text-xs font-semibold text-slate-600">
                        Waga kartonu [kg]
                        <input
                          value={cartonWeight}
                          onChange={(e) => setCartonWeight(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    ) : null}
                  </div>
                </section>
              )}
            </>
          )}

          {err ? <p className="text-sm font-semibold text-rose-600">{err}</p> : null}
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            disabled={saving}
            onClick={onSkip}
            className="flex-1 rounded-2xl bg-slate-100 py-3.5 text-sm font-bold uppercase text-slate-600 hover:bg-slate-200 disabled:opacity-50"
          >
            Pomiń teraz
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
            className="flex-[2] inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3.5 text-sm font-black uppercase text-white shadow-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : null}
            Zapisz dane
          </button>
        </div>
      </div>
    </div>
  );
}
