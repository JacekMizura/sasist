import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import api from "../../api/axios";
import {
  productLikeFieldLabelClass,
  productLikeInputClass,
} from "../../components/catalog";
import { SUPPLIER_COUNTRIES } from "../../constants/supplierTaxonomy";
import type { LabelTemplate } from "../../types/labelSystem";
import type { ProductLabelData } from "../../types/productLabel";
import { ProductLabelSvgPreview } from "./ProductLabelSvgPreview";
import {
  buildProductLabelDataRecord,
  buildProductLabelPlaceholderRecord,
} from "./productLabelPreviewRecords";

const fieldLabel = productLikeFieldLabelClass;
const inputClass = productLikeInputClass;

const PLACEHOLDER_RECORD = buildProductLabelPlaceholderRecord();

export type ProductEditLabelTabProps = {
  labelTemplateId: number | null;
  setLabelTemplateId: (v: number | null) => void;
  productTemplates: { id: number; name: string }[];
  tenantId: number | null;
  labelData: ProductLabelData;
  setLabelData: Dispatch<SetStateAction<ProductLabelData>>;
  name: string;
  symbol: string;
  ean: string;
  imageUrl?: string | null;
  manufacturerId: number | null;
  manufacturerReadonly: { name: string; address: string };
  manufacturer: string;
  salePrice: number | "";
  purchasePrice?: number | "";
  vatRate?: string;
  unit?: string;
  weight?: number | "";
  length?: number | "";
  width?: number | "";
  height?: number | "";
  parseDecimal: (s: string | number | undefined | null) => number | undefined;
};

function asNum(v: number | "" | undefined | null): number | null {
  if (v === "" || v == null) return null;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Product edit — Etykieta tab.
 * Both previews use the same `renderLabel` engine; only the data model differs.
 */
export function ProductEditLabelTab({
  labelTemplateId,
  setLabelTemplateId,
  productTemplates,
  tenantId,
  labelData,
  setLabelData,
  name,
  symbol,
  ean,
  imageUrl,
  manufacturerId,
  manufacturerReadonly,
  manufacturer,
  salePrice,
  purchasePrice = "",
  vatRate = "",
  unit = "",
  weight = "",
  length = "",
  width = "",
  height = "",
  parseDecimal,
}: ProductEditLabelTabProps) {
  const [template, setTemplate] = useState<LabelTemplate | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  useEffect(() => {
    if (labelTemplateId == null) {
      setTemplate(null);
      setTemplateLoading(false);
      return;
    }
    let cancelled = false;
    setTemplateLoading(true);
    setTemplate(null);
    const tid = tenantId != null && tenantId > 0 ? tenantId : 1;
    api
      .get<{ template_json: string }>(`/label-templates/${labelTemplateId}`, {
        params: { tenant_id: tid },
      })
      .then((res) => {
        if (cancelled) return;
        const raw = res.data?.template_json;
        if (!raw?.trim()) {
          setTemplate(null);
          return;
        }
        const parsed = JSON.parse(raw) as LabelTemplate;
        setTemplate({
          ...parsed,
          id: parsed.id ?? String(labelTemplateId),
          name: parsed.name ?? "",
          widthMm: Number(parsed.widthMm) || 50,
          heightMm: Number(parsed.heightMm) || 30,
          dpi: Number(parsed.dpi) || 300,
          elements: Array.isArray(parsed.elements) ? parsed.elements : [],
          template_type: parsed.template_type ?? "product",
        });
      })
      .catch(() => {
        if (!cancelled) setTemplate(null);
      })
      .finally(() => {
        if (!cancelled) setTemplateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [labelTemplateId, tenantId]);

  const salePriceNum =
    salePrice === ""
      ? null
      : typeof salePrice === "number"
        ? salePrice
        : parseDecimal(String(salePrice)) ?? null;
  const purchasePriceNum =
    purchasePrice === ""
      ? null
      : typeof purchasePrice === "number"
        ? purchasePrice
        : parseDecimal(String(purchasePrice)) ?? null;

  const productRecord = useMemo(
    () =>
      buildProductLabelDataRecord({
        name,
        symbol,
        ean,
        imageUrl,
        manufacturerName: manufacturerReadonly.name || manufacturer,
        manufacturerAddress: manufacturerReadonly.address,
        salePrice: salePriceNum,
        purchasePrice: purchasePriceNum,
        vatRate,
        unit,
        weight: asNum(weight),
        length: asNum(length),
        width: asNum(width),
        height: asNum(height),
        labelData,
      }),
    [
      name,
      symbol,
      ean,
      imageUrl,
      manufacturerReadonly.name,
      manufacturerReadonly.address,
      manufacturer,
      salePriceNum,
      purchasePriceNum,
      vatRate,
      unit,
      weight,
      length,
      width,
      height,
      labelData,
    ],
  );

  return (
    <div className="flex w-full max-w-none flex-col gap-12 lg:flex-row">
      {/* LEWA ~2/3 */}
      <div className="w-full space-y-10 lg:w-7/12 xl:w-2/3">
        <section>
          <h2 className="mb-4 border-b border-gray-100 pb-2 text-lg font-bold text-gray-900">Wybór szablonu</h2>
          <div className="space-y-4">
            <div>
              <label className={fieldLabel}>Szablon etykiety</label>
              <select
                value={labelTemplateId ?? ""}
                onChange={(e) => setLabelTemplateId(e.target.value === "" ? null : Number(e.target.value))}
                className={`${inputClass} appearance-none bg-white`}
              >
                <option value="">Brak</option>
                {productTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Podgląd szablonu</p>
              <p className="mb-3 text-xs leading-relaxed text-gray-500">
                Ten sam silnik renderowania co gotowa etykieta — pola pokazują placeholdery (
                {"{{NAZWA}}"}, {"{{EAN}}"}, {"{{SKU}}"}…).
              </p>
              <ProductLabelSvgPreview
                template={template}
                record={PLACEHOLDER_RECORD}
                loadingTemplate={templateLoading}
                emptyHint="Wybierz szablon, aby zobaczyć placeholdery pól"
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 border-b border-gray-100 pb-2 text-lg font-bold text-gray-900">A. Podstawowe</h2>
          <div>
            <label className={fieldLabel}>Nazwa produktu na etykiecie (PL)</label>
            <input
              type="text"
              className={inputClass}
              value={labelData.product_name_pl ?? ""}
              onChange={(e) => setLabelData((d) => ({ ...d, product_name_pl: e.target.value }))}
              placeholder={name.trim() || "jak nazwa produktu"}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-4 border-b border-gray-100 pb-2 text-lg font-bold text-gray-900">B. Producent / Importer</h2>
          <div className="space-y-5">
            <div className="rounded border border-gray-100 bg-gray-50 p-4 text-sm">
              <div className="mb-1 font-bold text-gray-900">{manufacturerReadonly.name || "—"}</div>
              <div className="leading-tight whitespace-pre-line text-gray-600">
                {manufacturerReadonly.address || "—"}
              </div>
              {manufacturerId == null ? (
                <p className="mt-2 text-xs font-medium text-amber-600">
                  Wybierz producenta w zakładce Podstawowe, aby wypełnić blok producenta.
                </p>
              ) : null}
            </div>
            <div>
              <label className={fieldLabel}>Importer — nazwa</label>
              <input
                type="text"
                className={inputClass}
                value={labelData.importer_name ?? ""}
                onChange={(e) => setLabelData((d) => ({ ...d, importer_name: e.target.value }))}
              />
            </div>
            <div>
              <label className={fieldLabel}>Importer — adres</label>
              <textarea
                className={`${inputClass} min-h-[80px] resize-y`}
                value={labelData.importer_address ?? ""}
                onChange={(e) => setLabelData((d) => ({ ...d, importer_address: e.target.value }))}
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 border-b border-gray-100 pb-2 text-lg font-bold text-gray-900">C. Identyfikacja</h2>
          <div className="space-y-5">
            <div>
              <label className={fieldLabel}>EAN</label>
              <input type="text" className={`${inputClass} cursor-not-allowed bg-gray-50`} value={ean} readOnly />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className={fieldLabel}>Numer partii</label>
                <input
                  type="text"
                  className={inputClass}
                  value={labelData.batch_number ?? ""}
                  onChange={(e) => setLabelData((d) => ({ ...d, batch_number: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <label className={fieldLabel}>Numer serii</label>
                <input
                  type="text"
                  className={inputClass}
                  value={labelData.series_number ?? ""}
                  onChange={(e) => setLabelData((d) => ({ ...d, series_number: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 border-b border-gray-100 pb-2 text-lg font-bold text-gray-900">D. Regulacje i Cechy</h2>
          <div className="space-y-3">
            <label className="group flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
                checked={Boolean(labelData.requires_ce_mark)}
                onChange={(e) => setLabelData((d) => ({ ...d, requires_ce_mark: e.target.checked }))}
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">Wymaga znaku CE na etykiecie</span>
            </label>
            <label className="group flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
                checked={Boolean(labelData.show_price_on_label)}
                onChange={(e) => setLabelData((d) => ({ ...d, show_price_on_label: e.target.checked }))}
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">Pokazuj cenę na etykiecie</span>
            </label>
          </div>
        </section>

        <section>
          <h2 className="mb-4 border-b border-gray-100 pb-2 text-lg font-bold text-gray-900">E. Branżowe (tekstylia)</h2>
          <div className="space-y-5">
            <div>
              <label className={fieldLabel}>Skład materiałowy</label>
              <textarea
                className={`${inputClass} min-h-[80px] resize-y`}
                value={labelData.material_composition ?? ""}
                onChange={(e) => setLabelData((d) => ({ ...d, material_composition: e.target.value }))}
                placeholder="np. 100% bawełna"
              />
            </div>
            <div>
              <label className={fieldLabel}>Instrukcja pielęgnacji</label>
              <textarea
                className={`${inputClass} min-h-[80px] resize-y`}
                value={labelData.care_instructions ?? ""}
                onChange={(e) => setLabelData((d) => ({ ...d, care_instructions: e.target.value }))}
              />
            </div>
            <div>
              <label className={fieldLabel}>Rozmiar / długość</label>
              <input
                type="text"
                className={inputClass}
                value={labelData.size_or_length ?? ""}
                onChange={(e) => setLabelData((d) => ({ ...d, size_or_length: e.target.value }))}
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 border-b border-gray-100 pb-2 text-lg font-bold text-gray-900">F. Pochodzenie</h2>
          <div>
            <label className={fieldLabel}>Kraj pochodzenia</label>
            <select
              className={`${inputClass} appearance-none bg-white`}
              value={labelData.country_of_origin ?? ""}
              onChange={(e) => setLabelData((d) => ({ ...d, country_of_origin: e.target.value || undefined }))}
            >
              <option value="">— Brak —</option>
              {SUPPLIER_COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <div className="pb-12" />
      </div>

      {/* PRAWA ~1/3 sticky preview */}
      <div className="w-full lg:w-5/12 xl:w-1/3">
        <div className="lg:sticky lg:top-8">
          <h2 className="mb-2 text-lg font-bold text-gray-900">Podgląd gotowej etykiety</h2>
          <p className="mb-6 text-sm leading-relaxed text-gray-500">
            Ten sam układ i skala co podgląd szablonu — z rzeczywistymi danymi produktu.
          </p>
          <ProductLabelSvgPreview
            template={template}
            record={productRecord}
            loadingTemplate={templateLoading}
            emptyHint="Wybierz szablon, aby zobaczyć etykietę z danymi produktu"
          />
        </div>
      </div>
    </div>
  );
}
