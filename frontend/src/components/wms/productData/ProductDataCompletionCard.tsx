import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, MapPin, Image as ImageIcon } from "lucide-react";
import { productService } from "../../../services/productService";
import {
  validateRequiredProductData,
  type MissingReceivingField,
  type ProductReceivingRequirements,
  type ProductReceivingValues,
} from "../../../utils/validateRequiredProductData";
import type { WmsProductIncompleteRow } from "../../../api/wmsProductApi";

export type ProductDataCompletionCardProps = {
  row: WmsProductIncompleteRow;
  tenantId: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onCompleted: (productId: number) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
};

function parseNum(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function strVal(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function fieldVisible(key: string, missing: MissingReceivingField[], forceAll: boolean): boolean {
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
  if (key === "carton_dimensions") return missing.some((m) => m.key === "carton_dimensions");
  if (key === "master_carton") return missing.some((m) => m.key === "master_carton");
  return missing.some((m) => m.key === key);
}

// Globalne style dla powtarzalnych elementów formularza
const INPUT_CLASS =
  "w-full rounded-2xl border-2 border-slate-200 bg-slate-50/50 px-4 py-3.5 text-base font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#5a4fcf] focus:bg-white focus:shadow-md focus:ring-4 focus:ring-indigo-500/10";
const LABEL_CLASS =
  "block mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 pl-1 mt-3";

export function ProductDataCompletionCard({
  row,
  tenantId,
  expanded,
  onToggleExpand,
  onCompleted,
  cardRef,
}: ProductDataCompletionCardProps) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const rules = row.required_rules ?? {};
  const values = row.editable_values ?? {};

  const [height, setHeight] = useState(strVal(values.height));
  const [width, setWidth] = useState(strVal(values.width));
  const [length, setLength] = useState(strVal(values.length));
  const [weight, setWeight] = useState(strVal(values.weight));
  const [bulkEan, setBulkEan] = useState(strVal(values.bulk_ean));
  const [unitsPerCarton, setUnitsPerCarton] = useState(strVal(values.units_per_carton));
  const [cartonL, setCartonL] = useState(strVal(values.carton_length_cm));
  const [cartonW, setCartonW] = useState(strVal(values.carton_width_cm));
  const [cartonH, setCartonH] = useState(strVal(values.carton_height_cm));
  const [cartonWeight, setCartonWeight] = useState(strVal(values.carton_weight_kg));

  useEffect(() => {
    const v = row.editable_values ?? {};
    setHeight(strVal(v.height));
    setWidth(strVal(v.width));
    setLength(strVal(v.length));
    setWeight(strVal(v.weight));
    setBulkEan(strVal(v.bulk_ean));
    setUnitsPerCarton(strVal(v.units_per_carton));
    setCartonL(strVal(v.carton_length_cm));
    setCartonW(strVal(v.carton_width_cm));
    setCartonH(strVal(v.carton_height_cm));
    setCartonWeight(strVal(v.carton_weight_kg));
  }, [row.product_id, row.editable_values]);

  useEffect(() => {
    if (expanded) {
      const t = window.setTimeout(() => firstInputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [expanded, row.product_id]);

  const draft = useMemo((): ProductReceivingValues & ProductReceivingRequirements => {
    return {
      ...rules,
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
  }, [rules, height, width, length, weight, bulkEan, unitsPerCarton, cartonL, cartonW, cartonH, cartonWeight]);

  const validation = useMemo(() => validateRequiredProductData(draft), [draft]);
  const missing = validation.missing;
  const forceAll = row.force_wms_completion;

  const showHeight = fieldVisible("height", missing, forceAll);
  const showWidth = fieldVisible("width", missing, forceAll);
  const showLength = fieldVisible("length", missing, forceAll);
  const showWeight = fieldVisible("weight", missing, forceAll);
  const showBulkEan = fieldVisible("bulk_ean", missing, forceAll) || fieldVisible("master_carton", missing, forceAll);
  const showUnits = fieldVisible("units_per_carton", missing, forceAll) || fieldVisible("master_carton", missing, forceAll);
  const showCartonDims = fieldVisible("carton_dimensions", missing, forceAll);
  const showCartonWeight = fieldVisible("carton_weight_kg", missing, forceAll);

  const save = useCallback(async () => {
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
      await productService.updateProduct(row.product_id, body, { tenant_id: tenantId });

      const merged: ProductReceivingValues & ProductReceivingRequirements = {
        ...rules,
        height: showHeight ? parseNum(height) : parseNum(strVal(values.height)) || null,
        width: showWidth ? parseNum(width) : parseNum(strVal(values.width)) || null,
        length: showLength ? parseNum(length) : parseNum(strVal(values.length)) || null,
        weight: showWeight ? parseNum(weight) : parseNum(strVal(values.weight)) || null,
        bulk_ean: showBulkEan ? bulkEan.trim() || null : (strVal(values.bulk_ean) || null),
        units_per_carton: showUnits ? parseNum(unitsPerCarton) : parseNum(strVal(values.units_per_carton)),
        carton_length_cm: showCartonDims ? parseNum(cartonL) : parseNum(strVal(values.carton_length_cm)),
        carton_width_cm: showCartonDims ? parseNum(cartonW) : parseNum(strVal(values.carton_width_cm)),
        carton_height_cm: showCartonDims ? parseNum(cartonH) : parseNum(strVal(values.carton_height_cm)),
        carton_weight_kg: showCartonWeight ? parseNum(cartonWeight) : parseNum(strVal(values.carton_weight_kg)),
      };
      if (validateRequiredProductData(merged).complete) {
        onCompleted(row.product_id);
      }
    } catch {
      setErr("Nie udało się zapisać");
    } finally {
      setSaving(false);
    }
  }, [
    showHeight,
    showWidth,
    showLength,
    showWeight,
    showBulkEan,
    showUnits,
    showCartonDims,
    showCartonWeight,
    height,
    width,
    length,
    weight,
    bulkEan,
    unitsPerCarton,
    cartonL,
    cartonW,
    cartonH,
    cartonWeight,
    row.product_id,
    tenantId,
    draft,
    onCompleted,
  ]);

  const onFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void save();
    }
  };

  const labels = row.missing_field_labels?.length
    ? row.missing_field_labels
    : row.missing_labels ?? [];

  return (
    <article
      ref={cardRef}
      id={`incomplete-product-${row.product_id}`}
      className={`rounded-[2rem] border-2 bg-white shadow-sm transition-all duration-300 ${
        expanded ? "border-[#5a4fcf] shadow-md ring-4 ring-indigo-500/10" : "border-slate-100 hover:border-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center gap-4 sm:gap-6 p-5 sm:p-6 text-left outline-none"
      >
        {/* Zdjęcie (Przezroczyste tło, mix-blend) */}
        <div className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center bg-transparent">
          {row.image_url ? (
            <img 
              src={row.image_url} 
              alt="" 
              className="max-h-full max-w-full object-contain mix-blend-multiply" 
            />
          ) : (
            <ImageIcon size={32} className="text-slate-200" strokeWidth={1.5} />
          )}
        </div>

        {/* Informacje o produkcie */}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-lg sm:text-xl font-black text-slate-900 leading-tight mb-2">
            {row.name || row.product_name}
          </h3>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {row.sku || row.product_sku ? (
              <span className="text-[10px] font-black text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg uppercase tracking-wide">
                SKU: {row.sku ?? row.product_sku}
              </span>
            ) : null}
            {row.ean || row.product_ean ? (
              <span className="text-[10px] font-black text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg uppercase tracking-wide">
                EAN: {row.ean ?? row.product_ean}
              </span>
            ) : null}
          </div>
          
          <div className="flex items-center gap-4 mt-2">
            {row.location_label ? (
              <p className="flex items-center gap-1.5 text-xs font-bold text-indigo-700">
                <MapPin size={14} className="shrink-0" strokeWidth={2.5} />
                {row.location_label}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
                <MapPin size={14} className="shrink-0" strokeWidth={2.5} />
                Brak lokalizacji
              </p>
            )}
            <p className="text-xs font-bold text-slate-500">
              Stan: <span className="text-slate-800">{row.stock ?? row.warehouse_qty ?? 0} szt.</span>
            </p>
          </div>

          {/* Subtelna informacja o brakach tylko gdy karta jest ZWINIĘTA */}
          {!expanded && labels.length > 0 ? (
            <p className="mt-3 line-clamp-1 text-[10px] font-black uppercase tracking-widest text-rose-500">
              Brakuje: {labels.join(" · ")}
            </p>
          ) : null}
        </div>

        <div className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
          expanded ? "bg-indigo-50 text-[#5a4fcf]" : "bg-slate-50 text-slate-400 group-hover:bg-slate-100"
        }`}>
          <ChevronDown
            size={24}
            strokeWidth={2.5}
            className={`transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* FORMULARZ (Expanded) */}
      {expanded ? (
        <div className="border-t-2 border-dashed border-slate-100 px-6 pb-8 pt-6" onKeyDown={onFormKeyDown}>
          
          <div className="space-y-2">
            {(showLength || showWidth || showHeight || showWeight) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {showLength ? (
                  <div>
                    <label className={LABEL_CLASS}>Długość [cm]</label>
                    <input
                      ref={firstInputRef}
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      inputMode="decimal"
                      className={INPUT_CLASS}
                    />
                  </div>
                ) : null}
                {showWidth ? (
                  <div>
                    <label className={LABEL_CLASS}>Szerokość [cm]</label>
                    <input
                      ref={!showLength ? firstInputRef : undefined}
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      inputMode="decimal"
                      className={INPUT_CLASS}
                    />
                  </div>
                ) : null}
                {showHeight ? (
                  <div>
                    <label className={LABEL_CLASS}>Wysokość [cm]</label>
                    <input
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      inputMode="decimal"
                      className={INPUT_CLASS}
                    />
                  </div>
                ) : null}
                {showWeight ? (
                  <div>
                    <label className={LABEL_CLASS}>Waga [kg]</label>
                    <input
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      inputMode="decimal"
                      className={INPUT_CLASS}
                    />
                  </div>
                ) : null}
              </div>
            )}

            {(showBulkEan || showUnits || showCartonDims || showCartonWeight) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-4">
                {showBulkEan ? (
                  <div className="sm:col-span-2">
                    <label className={LABEL_CLASS}>EAN kartonu</label>
                    <input
                      value={bulkEan}
                      onChange={(e) => setBulkEan(e.target.value)}
                      className={`${INPUT_CLASS} font-mono`}
                    />
                  </div>
                ) : null}
                {showUnits ? (
                  <div>
                    <label className={LABEL_CLASS}>Szt. w kartonie</label>
                    <input
                      value={unitsPerCarton}
                      onChange={(e) => setUnitsPerCarton(e.target.value)}
                      inputMode="numeric"
                      className={INPUT_CLASS}
                    />
                  </div>
                ) : null}
                {showCartonDims ? (
                  <>
                    <div>
                      <label className={LABEL_CLASS}>Dł. kartonu [cm]</label>
                      <input value={cartonL} onChange={(e) => setCartonL(e.target.value)} inputMode="decimal" className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Szer. kartonu [cm]</label>
                      <input value={cartonW} onChange={(e) => setCartonW(e.target.value)} inputMode="decimal" className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Wys. kartonu [cm]</label>
                      <input value={cartonH} onChange={(e) => setCartonH(e.target.value)} inputMode="decimal" className={INPUT_CLASS} />
                    </div>
                  </>
                ) : null}
                {showCartonWeight ? (
                  <div>
                    <label className={LABEL_CLASS}>Waga kartonu [kg]</label>
                    <input value={cartonWeight} onChange={(e) => setCartonWeight(e.target.value)} inputMode="decimal" className={INPUT_CLASS} />
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {err ? (
            <p className="mt-4 text-center text-sm font-bold text-rose-600 bg-rose-50 py-3 rounded-xl border border-rose-200">
              {err}
            </p>
          ) : null}

          <div className="mt-8 flex flex-col items-center">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5a4fcf] hover:bg-[#4a40b2] py-5 text-[13px] font-black uppercase tracking-widest text-white transition-all shadow-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-50 disabled:shadow-none"
            >
              {saving ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} strokeWidth={3} />}
              Zapisz dane
            </button>
            <p className="mt-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span className="bg-slate-100 border border-slate-200 text-slate-500 px-2 py-1 rounded mr-1.5">Enter</span>
              zapisuje i przechodzi dalej
            </p>
          </div>
        </div>
      ) : null}
    </article>
  );
}