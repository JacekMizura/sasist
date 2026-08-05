import { useState, type ReactNode } from "react";
import { Barcode, Box, FileText, Plus, Printer, Sparkles, X } from "lucide-react";
import toast from "react-hot-toast";

import type { ManufacturerRead } from "../../api/manufacturersApi";
import type {
  ProductValidationGlobalSettings,
  ProductValidationSkips,
} from "../../components/wms/receiving/ProductValidationOverridesSection";
import { Checkbox, Input, Select } from "../../design-system";
import { DocumentTemplateScopeSection } from "@/pages/Settings/document-templates/components/DocumentTemplateScopeSection";
import { generateFakeEan13 } from "../../utils/ean13";
import { generateFakeCatalogNumber, generateFakeSku } from "../../utils/productCodes";
import { ProductLabelPrintModal } from "./ProductLabelPrintModal";

export type ProductEditBasicTabProps = {
  isNew: boolean;
  saving: boolean;
  name: string;
  setName: (v: string) => void;
  tenantId: number | null;
  setTenantId: (v: number | null) => void;
  tenants: { id: number; name: string }[];
  symbol: string;
  setSymbol: (v: string) => void;
  catalogNumber: string;
  setCatalogNumber: (v: string) => void;
  ean: string;
  setEan: (v: string) => void;
  /** Additional EANs (product_barcodes), not including primary `ean`. */
  extraEans: string[];
  setExtraEans: React.Dispatch<React.SetStateAction<string[]>>;
  length: number | "";
  width: number | "";
  height: number | "";
  weight: number | "";
  volume: number | "";
  unit: string;
  setUnit: (v: string) => void;
  setWeight: (v: number | "") => void;
  updateDimension: (field: "length" | "width" | "height", raw: string) => void;
  bulkEan: string;
  setBulkEan: (v: string) => void;
  unitsPerCarton: number | "";
  setUnitsPerCarton: (v: number | "") => void;
  cartonLength: number | "";
  cartonWidth: number | "";
  cartonHeight: number | "";
  cartonWeight: number | "";
  cartonVolume: number | "";
  setCartonWeight: (v: number | "") => void;
  updateCartonDimension: (field: "cartonLength" | "cartonWidth" | "cartonHeight", raw: string) => void;
  round2: (n: number) => number;
  productId: number | null | undefined;
  effectiveTenantId: number;
  labelTemplateId?: number | null;
  manufacturerId: number | null;
  setManufacturerId: (v: number | null) => void;
  manufacturersCatalog: ManufacturerRead[];
  manufacturer: string;
  setManufacturer: (v: string) => void;
  responsiblePerson: string;
  setResponsiblePerson: (v: string) => void;
  responsiblePersonEmail: string;
  setResponsiblePersonEmail: (v: string) => void;
  globalValidation: ProductValidationGlobalSettings | null;
  validationSkips: ProductValidationSkips;
  setValidationSkips: React.Dispatch<React.SetStateAction<ProductValidationSkips>>;
};

/** Mock `.form-label` */
const labelClass = "mb-1 block text-[0.8125rem] font-medium text-gray-700";

function UnitField({
  label,
  unit,
  children,
}: {
  label: string;
  unit: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        {children}
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-xs text-gray-400">
          {unit}
        </span>
      </div>
    </div>
  );
}

function SkipCheck({
  checked,
  onChange,
  label,
  disabled,
  globalEnabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  globalEnabled: boolean;
}) {
  if (!globalEnabled) return null;
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-gray-50">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
      />
      <span className="text-gray-700">{label}</span>
    </label>
  );
}

/**
 * Product edit — Podstawowe tab.
 * DOM hierarchy is a structural 1:1 port of `podstawowy karta produckut v2.html`
 * (main two-column body under tabs). Logic / field wiring unchanged.
 */
export function ProductEditBasicTab({
  isNew,
  saving,
  name,
  setName,
  tenantId,
  setTenantId,
  tenants,
  symbol,
  setSymbol,
  catalogNumber,
  setCatalogNumber,
  ean,
  setEan,
  extraEans,
  setExtraEans,
  length,
  width,
  height,
  weight,
  volume,
  unit,
  setUnit,
  setWeight,
  updateDimension,
  bulkEan,
  setBulkEan,
  unitsPerCarton,
  setUnitsPerCarton,
  cartonLength,
  cartonWidth,
  cartonHeight,
  cartonWeight,
  cartonVolume: _cartonVolume,
  setCartonWeight,
  updateCartonDimension,
  round2,
  productId,
  effectiveTenantId,
  labelTemplateId = null,
  manufacturerId,
  setManufacturerId,
  manufacturersCatalog,
  manufacturer,
  setManufacturer,
  responsiblePerson,
  setResponsiblePerson,
  responsiblePersonEmail,
  setResponsiblePersonEmail,
  globalValidation,
  validationSkips,
  setValidationSkips,
}: ProductEditBasicTabProps) {
  const [templateMode, setTemplateMode] = useState<"pick" | "custom">("pick");
  const [labelPrint, setLabelPrint] = useState<{ ean: string; title: string } | null>(null);
  const g = globalValidation;

  const openEanPrint = (code: string, title: string) => {
    if (isNew || productId == null) {
      toast.error("Najpierw zapisz produkt, aby drukować etykietę.");
      return;
    }
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("Wpisz kod EAN przed drukowaniem.");
      return;
    }
    setLabelPrint({ ean: trimmed, title });
  };

  const productSkipsVisible = Boolean(g?.require_dimensions || g?.require_weight);
  const batchSkipsVisible = Boolean(g?.require_batch || g?.require_expiry || g?.require_serial);
  const cartonSkipsVisible = Boolean(
    g?.require_master_carton ||
      g?.require_master_carton_ean ||
      g?.require_master_carton_qty ||
      g?.require_master_carton_dims ||
      g?.require_master_carton_weight,
  );
  const anyGlobalRequire = Boolean(
    g &&
      (g.require_dimensions ||
        g.require_weight ||
        g.require_batch ||
        g.require_expiry ||
        g.require_serial ||
        g.require_master_carton ||
        g.require_master_carton_ean ||
        g.require_master_carton_qty ||
        g.require_master_carton_dims ||
        g.require_master_carton_weight),
  );

  return (
    <>
    {/* mock: <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"> */}
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
      {/* LEFT lg:col-span-7 */}
      <div className="space-y-6 lg:col-span-7">
        <section className="border-b border-gray-100 pb-6">
          <div className="space-y-4">
            <div>
              <label className={labelClass}>
                Nazwa produktu <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                density="comfortable"
                focusTone="brand"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Podmiot</label>
                <Select
                  value={tenantId ?? ""}
                  onChange={(e) => setTenantId(e.target.value ? Number(e.target.value) : null)}
                  required={isNew}
                  density="comfortable"
                  focusTone="brand"
                  className="cursor-pointer bg-white"
                >
                  <option value="">— Wybierz podmiot —</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={labelClass}>Kategoria</label>
                <Select density="comfortable" focusTone="brand" className="cursor-pointer bg-white text-gray-400" disabled>
                  <option>Wybierz kategorię...</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Symbol / SKU</label>
                <div className="flex items-stretch gap-2">
                  <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                      <Barcode className="h-3 w-3" strokeWidth={2} aria-hidden />
                    </span>
                    <Input
                      type="text"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      density="comfortable"
                      focusTone="brand"
                      className="pl-8 font-mono text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    title="Wygeneruj symbol SKU"
                    onClick={() => setSymbol(generateFakeSku())}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Generuj
                  </button>
                </div>
              </div>
              <div>
                <label className={labelClass}>Numer katalogowy</label>
                <div className="flex items-stretch gap-2">
                  <Input
                    type="text"
                    value={catalogNumber}
                    onChange={(e) => setCatalogNumber(e.target.value)}
                    placeholder="Opcjonalne"
                    density="comfortable"
                    focusTone="brand"
                    className="min-w-0 flex-1 font-mono text-xs"
                  />
                  <button
                    type="button"
                    title="Wygeneruj numer katalogowy"
                    onClick={() => setCatalogNumber(generateFakeCatalogNumber())}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Generuj
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className={`${labelClass} mb-0`}>Kod kreskowy</label>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700"
                  onClick={() => setExtraEans((prev) => [...prev, ""])}
                >
                  <Plus className="h-3 w-3" strokeWidth={2} aria-hidden /> Dodaj kolejny EAN
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex items-stretch gap-2">
                  <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                      <Barcode className="h-3 w-3" strokeWidth={2} aria-hidden />
                    </span>
                    <Input
                      type="text"
                      value={ean}
                      onChange={(e) => setEan(e.target.value)}
                      density="comfortable"
                      focusTone="brand"
                      className="pl-8 font-mono text-xs"
                      aria-label="Główny EAN"
                    />
                  </div>
                  <button
                    type="button"
                    title="Wygeneruj poprawny EAN-13"
                    onClick={() => setEan(generateFakeEan13())}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Generuj
                  </button>
                  <button
                    type="button"
                    onClick={() => openEanPrint(ean, "Drukuj etykietę — EAN produktu")}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 text-xs font-semibold text-orange-600 shadow-sm transition-colors hover:bg-orange-50"
                  >
                    <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Drukuj
                  </button>
                </div>
                {extraEans.map((code, idx) => (
                  <div key={`extra-ean-${idx}`} className="flex items-stretch gap-2">
                    <div className="relative min-w-0 flex-1">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                        <Barcode className="h-3 w-3" strokeWidth={2} aria-hidden />
                      </span>
                      <Input
                        type="text"
                        value={code}
                        onChange={(e) =>
                          setExtraEans((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                        }
                        density="comfortable"
                        focusTone="brand"
                        className="pl-8 font-mono text-xs"
                        placeholder="Dodatkowy EAN"
                        aria-label={`Dodatkowy EAN ${idx + 1}`}
                      />
                    </div>
                    <button
                      type="button"
                      title="Wygeneruj poprawny EAN-13"
                      onClick={() =>
                        setExtraEans((prev) => prev.map((v, i) => (i === idx ? generateFakeEan13() : v)))
                      }
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      Generuj
                    </button>
                    <button
                      type="button"
                      onClick={() => openEanPrint(code, `Drukuj etykietę — EAN ${idx + 2}`)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 text-xs font-semibold text-orange-600 shadow-sm transition-colors hover:bg-orange-50"
                    >
                      <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      Drukuj
                    </button>
                    <button
                      type="button"
                      title="Usuń EAN"
                      onClick={() => setExtraEans((prev) => prev.filter((_, i) => i !== idx))}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Gabaryty jednostkowe */}
        <section className="border-b border-gray-100 pb-6">
          <h2 className="mb-4 text-base font-bold text-gray-900">Gabaryty jednostkowe</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <UnitField label="Długość" unit="cm">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={length === "" ? "" : length}
                  onChange={(e) => updateDimension("length", e.target.value)}
                  density="comfortable"
                  focusTone="brand"
                  className="pr-8"
                />
              </UnitField>
              <UnitField label="Szerokość" unit="cm">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={width === "" ? "" : width}
                  onChange={(e) => updateDimension("width", e.target.value)}
                  density="comfortable"
                  focusTone="brand"
                  className="pr-8"
                />
              </UnitField>
              <UnitField label="Wysokość" unit="cm">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={height === "" ? "" : height}
                  onChange={(e) => updateDimension("height", e.target.value)}
                  density="comfortable"
                  focusTone="brand"
                  className="pr-8"
                />
              </UnitField>
              <UnitField label="Waga brutto" unit="kg">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={weight === "" ? "" : weight}
                  onChange={(e) => {
                    const s = String(e.target.value).trim().replace(",", ".");
                    if (s === "") setWeight("");
                    else {
                      const n = parseFloat(s);
                      if (Number.isFinite(n)) setWeight(n);
                    }
                  }}
                  density="comfortable"
                  focusTone="brand"
                  className="pr-8"
                />
              </UnitField>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Objętość wyliczona</label>
                <div className="relative">
                  <Input
                    type="text"
                    readOnly
                    value={volume === "" ? "" : typeof volume === "number" ? String(round2(volume)) : String(volume)}
                    density="comfortable"
                    className="cursor-not-allowed bg-gray-50 pr-12 text-gray-600"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-400">
                    dm³
                  </span>
                </div>
              </div>
              <div>
                <label className={labelClass}>Jednostka miary</label>
                <Select
                  value={unit || "szt."}
                  onChange={(e) => setUnit(e.target.value)}
                  density="comfortable"
                  focusTone="brand"
                  className="cursor-pointer bg-white"
                >
                  <option value="szt.">szt. (sztuki)</option>
                  <option value="kpl.">kpl. (komplety)</option>
                  <option value="para">para</option>
                  {unit && !["szt.", "kpl.", "para", ""].includes(unit) ? (
                    <option value={unit}>{unit}</option>
                  ) : null}
                </Select>
              </div>
            </div>
          </div>
        </section>

        {/* Opakowanie zbiorcze (Karton) — orange card from mock */}
        <section className="pb-6">
          <div className="space-y-4 rounded-lg border border-orange-100 bg-orange-50/20 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Box className="h-4 w-4 text-orange-500" strokeWidth={2} aria-hidden />
              Opakowanie zbiorcze
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={`${labelClass} mb-1`}>EAN kartonu zbiorczego</label>
                <div className="flex items-stretch gap-2">
                  <Input
                    type="text"
                    value={bulkEan}
                    onChange={(e) => setBulkEan(e.target.value)}
                    density="comfortable"
                    focusTone="brand"
                    className="min-w-0 flex-1 font-mono text-xs"
                  />
                  <button
                    type="button"
                    title="Wygeneruj poprawny EAN-13"
                    onClick={() => setBulkEan(generateFakeEan13())}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Generuj
                  </button>
                  <button
                    type="button"
                    onClick={() => openEanPrint(bulkEan, "Drukuj etykietę — EAN kartonu")}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 text-xs font-semibold text-orange-600 shadow-sm transition-colors hover:bg-orange-50"
                  >
                    <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Drukuj
                  </button>
                </div>
              </div>
              <div>
                <label className={labelClass}>Kod kartonu</label>
                <Input
                  type="text"
                  defaultValue=""
                  placeholder="BOX-…"
                  density="comfortable"
                  focusTone="brand"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Ilość sztuk w kartonie</label>
              <Input
                type="number"
                min={0}
                step={1}
                value={unitsPerCarton === "" ? "" : unitsPerCarton}
                onChange={(e) => {
                  const s = String(e.target.value).trim().replace(",", ".");
                  if (s === "") setUnitsPerCarton("");
                  else {
                    const n = parseFloat(s);
                    if (Number.isFinite(n) && n >= 0) setUnitsPerCarton(n);
                  }
                }}
                density="comfortable"
                focusTone="brand"
              />
            </div>

            <div>
              <span className="mb-2 block text-xs font-semibold text-gray-700">Wymiary zewnętrzne kartonu</span>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <span className="mb-1 block text-[11px] text-gray-500">Długość (cm)</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={cartonLength === "" ? "" : cartonLength}
                    onChange={(e) => updateCartonDimension("cartonLength", e.target.value)}
                    density="compact"
                    focusTone="brand"
                    className="text-xs"
                  />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] text-gray-500">Szerokość (cm)</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={cartonWidth === "" ? "" : cartonWidth}
                    onChange={(e) => updateCartonDimension("cartonWidth", e.target.value)}
                    density="compact"
                    focusTone="brand"
                    className="text-xs"
                  />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] text-gray-500">Wysokość (cm)</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={cartonHeight === "" ? "" : cartonHeight}
                    onChange={(e) => updateCartonDimension("cartonHeight", e.target.value)}
                    density="compact"
                    focusTone="brand"
                    className="text-xs"
                  />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] text-gray-500">Waga brutto (kg)</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={cartonWeight === "" ? "" : cartonWeight}
                    onChange={(e) => {
                      const s = String(e.target.value).trim().replace(",", ".");
                      if (s === "") setCartonWeight("");
                      else {
                        const n = parseFloat(s);
                        if (Number.isFinite(n)) setCartonWeight(n);
                      }
                    }}
                    density="compact"
                    focusTone="brand"
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* RIGHT lg:col-span-5 */}
      <div className="space-y-6 lg:col-span-5">
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <FileText className="h-4 w-4 text-gray-400" strokeWidth={2} aria-hidden />
            Szablon wydruku dokumentu
          </h2>

          <div>
            <span className="mb-1 block text-xs font-medium text-gray-700">Szablon dokumentu</span>
            {!isNew && productId != null ? (
              <>
                <Select
                  value={templateMode}
                  onChange={(e) => setTemplateMode(e.target.value === "custom" ? "custom" : "pick")}
                  density="compact"
                  focusTone="brand"
                  className="cursor-pointer bg-white text-xs"
                >
                  <option value="pick">Wybierz opublikowany szablon...</option>
                  <option value="custom">Szukaj po nazwie...</option>
                </Select>

                <div
                  className={
                    templateMode === "custom"
                      ? "mt-2 [&_label]:hidden [&_p]:hidden"
                      : "mt-2 [&_input[type=search]]:hidden [&_label]:hidden [&_p]:hidden"
                  }
                >
                  <DocumentTemplateScopeSection
                    tenantId={effectiveTenantId}
                    scopeType="PRODUCT"
                    scopeId={productId}
                    title=""
                    description=""
                    titleClassName="hidden"
                    kinds={[{ kindCode: "product_card", label: "Karta produktu" }]}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">Zapisz produkt, aby przypisać szablon.</p>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900">Producent</h2>
          <div>
            <label className={`${labelClass} text-xs`}>Producent</label>
            <Select
              value={manufacturerId != null ? String(manufacturerId) : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  setManufacturerId(null);
                  setManufacturer("");
                  return;
                }
                const id = Number(v);
                const row = manufacturersCatalog.find((x) => x.id === id);
                setManufacturerId(Number.isFinite(id) ? id : null);
                if (row) setManufacturer(row.name);
              }}
              density="compact"
              focusTone="brand"
              className="bg-white text-xs"
            >
              <option value="">— Wybierz —</option>
              {manufacturersCatalog.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {!m.active ? "(nieaktywny)" : ""}
                </option>
              ))}
            </Select>
          </div>
        </section>

        {/* GPSR */}
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900">GPSR</h2>
          <div>
            <label className={`${labelClass} text-xs`}>Osoba odpowiedzialna (GPSR)</label>
            <Input
              type="text"
              value={responsiblePerson}
              onChange={(e) => setResponsiblePerson(e.target.value)}
              placeholder="Puste = dziedziczenie z producenta"
              density="compact"
              focusTone="brand"
              className="text-xs placeholder:text-gray-400"
            />
          </div>
          <div>
            <label className={`${labelClass} text-xs`}>E-mail osoby odpowiedzialnej (GPSR)</label>
            <Input
              type="email"
              value={responsiblePersonEmail}
              onChange={(e) => setResponsiblePersonEmail(e.target.value)}
              placeholder="Opcjonalnie; puste = z producenta"
              density="compact"
              focusTone="brand"
              className="text-xs placeholder:text-gray-400"
            />
          </div>
        </section>

        {/* Walidacja — grouped Produkt / Partie / Opakowanie */}
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4" id="wms-validation">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Walidacja</h2>
            <span className="rounded bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
              Reguły specjalne
            </span>
          </div>

          {!g ? (
            <p className="text-xs text-gray-500">Wczytywanie ustawień globalnych…</p>
          ) : !anyGlobalRequire ? (
            <p className="text-xs text-gray-500">Brak aktywnych globalnych wymagań — wyłączenia nie są potrzebne.</p>
          ) : (
            <div className="space-y-4 border-t border-gray-100 pt-2 text-xs">
              {productSkipsVisible ? (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Produkt</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SkipCheck
                      globalEnabled={g.require_dimensions}
                      checked={validationSkips.validation_skip_dimensions}
                      onChange={(v) => setValidationSkips((prev) => ({ ...prev, validation_skip_dimensions: v }))}
                      label="Nie wymagaj wymiarów produktu"
                      disabled={saving}
                    />
                    <SkipCheck
                      globalEnabled={g.require_weight}
                      checked={validationSkips.validation_skip_weight}
                      onChange={(v) => setValidationSkips((prev) => ({ ...prev, validation_skip_weight: v }))}
                      label="Nie wymagaj wagi produktu"
                      disabled={saving}
                    />
                  </div>
                </div>
              ) : null}

              {batchSkipsVisible ? (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Partie</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SkipCheck
                      globalEnabled={g.require_batch}
                      checked={validationSkips.validation_skip_batch}
                      onChange={(v) => setValidationSkips((prev) => ({ ...prev, validation_skip_batch: v }))}
                      label="Nie wymagaj numeru partii"
                      disabled={saving}
                    />
                    <SkipCheck
                      globalEnabled={g.require_expiry}
                      checked={validationSkips.validation_skip_expiry}
                      onChange={(v) => setValidationSkips((prev) => ({ ...prev, validation_skip_expiry: v }))}
                      label="Nie wymagaj daty ważności"
                      disabled={saving}
                    />
                    <SkipCheck
                      globalEnabled={g.require_serial}
                      checked={validationSkips.validation_skip_serial}
                      onChange={(v) => setValidationSkips((prev) => ({ ...prev, validation_skip_serial: v }))}
                      label="Nie wymagaj numeru seryjnego"
                      disabled={saving}
                    />
                  </div>
                </div>
              ) : null}

              {cartonSkipsVisible ? (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Opakowanie</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SkipCheck
                      globalEnabled={g.require_master_carton}
                      checked={validationSkips.validation_skip_master_carton}
                      onChange={(v) => setValidationSkips((prev) => ({ ...prev, validation_skip_master_carton: v }))}
                      label="Nie wymagaj opakowania zbiorczego"
                      disabled={saving}
                    />
                    <SkipCheck
                      globalEnabled={g.require_master_carton_ean}
                      checked={validationSkips.validation_skip_master_carton_ean}
                      onChange={(v) =>
                        setValidationSkips((prev) => ({ ...prev, validation_skip_master_carton_ean: v }))
                      }
                      label="Nie wymagaj EAN kartonu"
                      disabled={saving}
                    />
                    <SkipCheck
                      globalEnabled={g.require_master_carton_qty}
                      checked={validationSkips.validation_skip_master_carton_qty}
                      onChange={(v) =>
                        setValidationSkips((prev) => ({ ...prev, validation_skip_master_carton_qty: v }))
                      }
                      label="Nie wymagaj ilości w kartonie"
                      disabled={saving}
                    />
                    <SkipCheck
                      globalEnabled={g.require_master_carton_dims}
                      checked={validationSkips.validation_skip_master_carton_dims}
                      onChange={(v) =>
                        setValidationSkips((prev) => ({ ...prev, validation_skip_master_carton_dims: v }))
                      }
                      label="Nie wymagaj wymiarów kartonu"
                      disabled={saving}
                    />
                    <SkipCheck
                      globalEnabled={g.require_master_carton_weight}
                      checked={validationSkips.validation_skip_master_carton_weight}
                      onChange={(v) =>
                        setValidationSkips((prev) => ({ ...prev, validation_skip_master_carton_weight: v }))
                      }
                      label="Nie wymagaj wagi kartonu"
                      disabled={saving}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>

      </div>
    </div>

      {labelPrint != null && productId != null ? (
        <ProductLabelPrintModal
          product={{
            id: productId,
            tenant_id: effectiveTenantId,
            label_template_id: labelTemplateId,
          }}
          eanOverride={labelPrint.ean}
          title={labelPrint.title}
          onClose={() => setLabelPrint(null)}
        />
      ) : null}
    </>
  );
}
