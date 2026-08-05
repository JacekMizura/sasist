import type { Dispatch, ReactNode, SetStateAction } from "react";

import {
  productLikeFieldLabelClass,
  productLikeInputClass,
} from "../../components/catalog";
import { RetailLabel } from "../../components/products/RetailLabel";
import { SUPPLIER_COUNTRIES } from "../../constants/supplierTaxonomy";
import type { ProductLabelData } from "../../types/productLabel";

const fieldLabel = productLikeFieldLabelClass;
const inputClass = productLikeInputClass;

/**
 * Polish field captions for „Podgląd szablonu”.
 * Same RetailLabel slots as the finished preview — never {{...}} syntax.
 */
const TEMPLATE_FIELD_LABELS = {
  brandName: "Producent",
  productNamePl: "Nazwa produktu",
  composition: "Skład materiałowy",
  manufacturerName: "Producent",
  manufacturerAddress: "Adres producenta",
  importerName: "Importer",
  importerAddress: "Adres importera",
  ean: "EAN",
  batchNumber: "Numer partii",
  seriesNumber: "Numer serii",
  countryOfOrigin: "Kraj pochodzenia",
  careInstructions: "Instrukcja pielęgnacji",
  sizeOrLength: "Wymiary",
  priceText: "Cena",
} as const;

function LabelPreviewChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center rounded-lg bg-gray-100 p-4">
      <div className="origin-top scale-[1.15] bg-white shadow-sm sm:scale-125">{children}</div>
    </div>
  );
}

export type ProductEditLabelTabProps = {
  labelTemplateId: number | null;
  setLabelTemplateId: (v: number | null) => void;
  productTemplates: { id: number; name: string }[];
  labelData: ProductLabelData;
  setLabelData: Dispatch<SetStateAction<ProductLabelData>>;
  name: string;
  ean: string;
  manufacturerId: number | null;
  manufacturerReadonly: { name: string; address: string };
  manufacturer: string;
  salePrice: number | "";
  parseDecimal: (s: string | number | undefined | null) => number | undefined;
};

/**
 * Product edit — Etykieta tab.
 * Both previews use the previous RetailLabel renderer.
 * Left = Polish field names; right = real product data. No technical blurbs.
 */
export function ProductEditLabelTab({
  labelTemplateId,
  setLabelTemplateId,
  productTemplates,
  labelData,
  setLabelData,
  name,
  ean,
  manufacturerId,
  manufacturerReadonly,
  manufacturer,
  salePrice,
  parseDecimal,
}: ProductEditLabelTabProps) {
  const salePriceNum =
    salePrice === ""
      ? null
      : typeof salePrice === "number"
        ? salePrice
        : parseDecimal(String(salePrice)) ?? null;

  return (
    <div className="flex w-full max-w-none flex-col gap-12 lg:flex-row">
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
              <LabelPreviewChrome>
                <RetailLabel
                  brandName={TEMPLATE_FIELD_LABELS.brandName}
                  productNamePl={TEMPLATE_FIELD_LABELS.productNamePl}
                  composition={TEMPLATE_FIELD_LABELS.composition}
                  manufacturerName={TEMPLATE_FIELD_LABELS.manufacturerName}
                  manufacturerAddress={TEMPLATE_FIELD_LABELS.manufacturerAddress}
                  importerName={TEMPLATE_FIELD_LABELS.importerName}
                  importerAddress={TEMPLATE_FIELD_LABELS.importerAddress}
                  ean={TEMPLATE_FIELD_LABELS.ean}
                  batchNumber={TEMPLATE_FIELD_LABELS.batchNumber}
                  seriesNumber={TEMPLATE_FIELD_LABELS.seriesNumber}
                  countryOfOrigin={TEMPLATE_FIELD_LABELS.countryOfOrigin}
                  careInstructions={TEMPLATE_FIELD_LABELS.careInstructions}
                  sizeOrLength={TEMPLATE_FIELD_LABELS.sizeOrLength}
                  priceText={TEMPLATE_FIELD_LABELS.priceText}
                  showPriceOnLabel
                  showCeMark
                />
              </LabelPreviewChrome>
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

      <div className="w-full lg:w-5/12 xl:w-1/3">
        <div className="lg:sticky lg:top-8">
          <h2 className="mb-6 text-lg font-bold text-gray-900">Podgląd gotowej etykiety</h2>
          <LabelPreviewChrome>
            <RetailLabel
              brandName={manufacturerReadonly.name || manufacturer.trim() || "—"}
              productNamePl={(labelData.product_name_pl ?? "").trim() || name.trim() || "—"}
              composition={labelData.material_composition}
              manufacturerName={manufacturerReadonly.name || undefined}
              manufacturerAddress={manufacturerReadonly.address || undefined}
              importerName={labelData.importer_name}
              importerAddress={labelData.importer_address}
              ean={ean.trim() || undefined}
              batchNumber={labelData.batch_number}
              seriesNumber={labelData.series_number}
              countryOfOrigin={labelData.country_of_origin}
              careInstructions={labelData.care_instructions}
              sizeOrLength={labelData.size_or_length}
              salePrice={salePriceNum}
              showPriceOnLabel={Boolean(labelData.show_price_on_label)}
              showCeMark={Boolean(labelData.requires_ce_mark)}
            />
          </LabelPreviewChrome>
        </div>
      </div>
    </div>
  );
}
