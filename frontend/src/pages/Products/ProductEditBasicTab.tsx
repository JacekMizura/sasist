import { useState, type ReactNode } from "react";
import { Barcode, Box, FileText, Search, Tag } from "lucide-react";

import type { ManufacturerRead } from "../../api/manufacturersApi";
import type { ProductValidationGlobalSettings, ProductValidationSkips } from "../../components/wms/receiving/ProductValidationOverridesSection";
import { ProductValidationOverridesSection } from "../../components/wms/receiving/ProductValidationOverridesSection";
import ActivityLogPanel from "../../components/activityLog/ActivityLogPanel";
import { Input, Select } from "../../design-system";
import { DocumentTemplateScopeSection } from "@/pages/Settings/document-templates/components/DocumentTemplateScopeSection";

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
  ean: string;
  setEan: (v: string) => void;
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

const labelClass = "mb-1.5 block text-sm font-medium text-gray-700";
const dimLabelClass = "mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500";

function AffixInput({
  icon,
  children,
  className = "",
}: {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex rounded-md shadow-sm ${className}`.trim()}>
      <span className="inline-flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-white px-3 text-gray-500 sm:text-sm">
        {icon}
      </span>
      <div className="min-w-0 flex-1 [&_input]:rounded-none [&_input]:rounded-r-lg">{children}</div>
    </div>
  );
}

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
      <label className={dimLabelClass}>{label}</label>
      <div className="relative rounded-lg shadow-sm">
        {children}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <span className="text-sm text-gray-500 sm:text-sm">{unit}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Product edit — Podstawowe tab.
 * DOM hierarchy is a structural 1:1 port of `podstawowe karta produktu.html`
 * (main two-column body under tabs). No ProductLikeSection.
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
  ean,
  setEan,
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
  const [unitSystem, setUnitSystem] = useState<"metric" | "imperial">("metric");

  return (
    <>
      <div
        style={{
          background: "#ff0000",
          color: "#fff",
          padding: 20,
          fontSize: 30,
          fontWeight: "bold",
          zIndex: 999999,
        }}
      >
        TEST PRODUCTEDITBASICTAB
      </div>
    {/* mock: <div class="flex flex-col xl:flex-row gap-6 items-start"> */}
    <div className="flex flex-col items-start gap-6 xl:flex-row">
      {/* mock LEFT: w-full xl:w-2/3 xl:min-w-[700px] flex flex-col gap-6 */}
      <div className="flex w-full flex-col gap-6 xl:w-2/3 xl:min-w-[700px]">
        {/* KARTA: Informacje ogólne */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">Informacje ogólne</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
              <div className="md:col-span-2">
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

              <div>
                <label className={labelClass}>Podmiot</label>
                <Select
                  value={tenantId ?? ""}
                  onChange={(e) => setTenantId(e.target.value ? Number(e.target.value) : null)}
                  required={isNew}
                  density="comfortable"
                  focusTone="brand"
                  className="cursor-pointer"
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
                <Select density="comfortable" focusTone="brand" className="cursor-pointer text-gray-500" disabled>
                  <option>Wybierz kategorię...</option>
                </Select>
              </div>

              <div>
                <label className={labelClass}>Symbol / SKU</label>
                <AffixInput icon={<Tag className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}>
                  <Input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    density="comfortable"
                    focusTone="brand"
                    className="font-mono"
                  />
                </AffixInput>
              </div>

              <div>
                <label className={labelClass}>Numer katalogowy</label>
                <Input
                  type="text"
                  defaultValue=""
                  placeholder="Brak (opcjonalne)"
                  density="comfortable"
                  focusTone="brand"
                  className="text-gray-500 placeholder:text-gray-400"
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Kod kreskowy (EAN/GTIN)</label>
                <AffixInput
                  icon={<Barcode className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
                  className="md:w-1/2 md:pr-4"
                >
                  <Input
                    type="text"
                    value={ean}
                    onChange={(e) => setEan(e.target.value)}
                    density="comfortable"
                    focusTone="brand"
                    className="font-mono"
                  />
                </AffixInput>
              </div>
            </div>
          </div>
        </section>

        {/* KARTA: Gabaryty jednostkowe */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">Gabaryty jednostkowe</h2>
            <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setUnitSystem("metric")}
                className={
                  unitSystem === "metric"
                    ? "rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-900"
                    : "rounded-md px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-900"
                }
              >
                Metryczne
              </button>
              <button
                type="button"
                onClick={() => setUnitSystem("imperial")}
                className={
                  unitSystem === "imperial"
                    ? "rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-900"
                    : "rounded-md px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-900"
                }
              >
                Imperialne
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <UnitField label="Długość" unit="cm">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={length === "" ? "" : length}
                  onChange={(e) => updateDimension("length", e.target.value)}
                  density="comfortable"
                  focusTone="brand"
                  className="pr-10 font-medium"
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
                  className="pr-10 font-medium"
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
                  className="pr-10 font-medium"
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
                  className="pr-10 font-medium"
                />
              </UnitField>

              <div className="mt-2 md:col-span-2">
                <label className={dimLabelClass}>Objętość wyliczona</label>
                <div className="relative rounded-lg shadow-sm">
                  <Input
                    type="text"
                    readOnly
                    value={volume === "" ? "" : typeof volume === "number" ? String(round2(volume)) : String(volume)}
                    density="comfortable"
                    className="cursor-not-allowed border-gray-200 pr-12 font-mono text-gray-600"
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <span className="text-sm text-gray-400">dm³</span>
                  </div>
                </div>
              </div>

              <div className="mt-2 md:col-span-2">
                <label className={dimLabelClass}>Jednostka miary</label>
                <Select
                  value={unit || "szt."}
                  onChange={(e) => setUnit(e.target.value)}
                  density="comfortable"
                  focusTone="brand"
                  className="cursor-pointer"
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

        {/* KARTA: Opakowanie zbiorcze */}
        <section className="overflow-hidden rounded-xl border border-gray-200 border-l-4 border-l-blue-500 bg-white">
          <div className="flex items-center border-b border-gray-200 px-6 py-4">
            <Box className="mr-2.5 h-4 w-4 text-blue-500" strokeWidth={2} aria-hidden />
            <h2 className="text-base font-semibold text-gray-900">Opakowanie zbiorcze (Karton)</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
              <div>
                <label className={labelClass}>EAN kartonu zbiorczego</label>
                <AffixInput icon={<Barcode className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}>
                  <Input
                    type="text"
                    value={bulkEan}
                    onChange={(e) => setBulkEan(e.target.value)}
                    density="comfortable"
                    focusTone="brand"
                    className="font-mono"
                  />
                </AffixInput>
              </div>

              <div>
                <label className={labelClass}>Ilość sztuk w kartonie</label>
                <div className="relative rounded-lg shadow-sm">
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
                    className="pr-12 font-medium"
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <span className="text-sm text-gray-500">szt.</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 md:col-span-2">
                <h3 className="mb-4 text-sm font-medium text-gray-900">Wymiary zewnętrzne kartonu</h3>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Długość (cm)</label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={cartonLength === "" ? "" : cartonLength}
                      onChange={(e) => updateCartonDimension("cartonLength", e.target.value)}
                      density="compact"
                      focusTone="brand"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Szerokość (cm)</label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={cartonWidth === "" ? "" : cartonWidth}
                      onChange={(e) => updateCartonDimension("cartonWidth", e.target.value)}
                      density="compact"
                      focusTone="brand"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Wysokość (cm)</label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={cartonHeight === "" ? "" : cartonHeight}
                      onChange={(e) => updateCartonDimension("cartonHeight", e.target.value)}
                      density="compact"
                      focusTone="brand"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Waga brutto (kg)</label>
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
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* mock RIGHT: w-full xl:w-1/3 flex flex-col gap-6 */}
      <div className="flex w-full flex-col gap-6 xl:w-1/3">
        {/* KARTA: Szablon Dokumentu — flat p-5 card as in mock */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-1 flex items-center text-sm font-semibold text-gray-900">
            <FileText className="mr-2 h-4 w-4 text-gray-500" strokeWidth={2} aria-hidden />
            Szablon wydruku dokumentu
          </h3>
          <p className="mb-4 text-[13px] text-gray-500">Domyślny układ karty dla tego konkretnego SKU.</p>

          {!isNew && productId != null ? (
            <div className="space-y-3">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Search className="h-3 w-3 text-gray-400" strokeWidth={2} aria-hidden />
                </div>
                <Input
                  type="text"
                  placeholder="Szukaj po nazwie..."
                  density="comfortable"
                  focusTone="brand"
                  className="pl-8"
                  disabled
                  title="Filtrowanie szablonów — UI z mocka; wybór poniżej zapisuje przypisanie"
                />
              </div>
              <DocumentTemplateScopeSection
                tenantId={effectiveTenantId}
                scopeType="PRODUCT"
                scopeId={productId}
                title=""
                description="Brak wyboru spowoduje użycie standardowego przypisania."
                titleClassName="hidden"
                kinds={[{ kindCode: "product_card", label: "Karta produktu" }]}
              />
            </div>
          ) : (
            <p className="text-[13px] text-gray-500">Zapisz produkt, aby przypisać szablon.</p>
          )}
        </section>

        {/* App sections not in mock HTML — same card chrome; required for existing fields */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Producent i GPSR</h2>
          </div>
          <div className="space-y-4 p-5">
            <div>
              <label className={labelClass}>Producent z katalogu</label>
              <Select
                value={manufacturerId != null ? String(manufacturerId) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setManufacturerId(null);
                    return;
                  }
                  const id = Number(v);
                  const row = manufacturersCatalog.find((x) => x.id === id);
                  setManufacturerId(Number.isFinite(id) ? id : null);
                  if (row) setManufacturer(row.name);
                }}
                density="comfortable"
                focusTone="brand"
              >
                <option value="">— Wybierz —</option>
                {manufacturersCatalog.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {!m.active ? "(nieaktywny)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className={labelClass}>Nazwa producenta (ręczna)</label>
              <Input
                type="text"
                value={manufacturer}
                onChange={(e) => {
                  const t = e.target.value;
                  setManufacturer(t);
                  if (manufacturerId != null) {
                    const row = manufacturersCatalog.find((x) => x.id === manufacturerId);
                    if (row && t.trim() !== (row.name || "").trim()) setManufacturerId(null);
                  }
                }}
                density="comfortable"
                focusTone="brand"
              />
            </div>
            <div>
              <label className={labelClass}>Osoba odpowiedzialna (GPSR)</label>
              <Input
                type="text"
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                placeholder="Puste = dziedziczenie z producenta"
                density="comfortable"
                focusTone="brand"
              />
            </div>
            <div>
              <label className={labelClass}>E-mail osoby odpowiedzialnej (GPSR)</label>
              <Input
                type="email"
                value={responsiblePersonEmail}
                onChange={(e) => setResponsiblePersonEmail(e.target.value)}
                placeholder="Opcjonalnie; puste = z producenta"
                density="comfortable"
                focusTone="brand"
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Walidacja</h2>
          </div>
          <div className="p-5" id="wms-validation">
            <ProductValidationOverridesSection
              global={globalValidation}
              skips={validationSkips}
              disabled={saving}
              onChange={(patch) => setValidationSkips((prev) => ({ ...prev, ...patch }))}
            />
          </div>
        </section>

        {/* Historia — chrome 1:1 z mocka; treść = ActivityLogPanel (SSOT jak Orders) */}
        {!isNew && productId != null ? (
          <section className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white xl:max-h-[800px]">
            <div className="flex items-center justify-between rounded-t-xl border-b border-gray-200 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">Historia operacji</h2>
              <button type="button" className="text-sm font-medium text-orange-600 hover:text-orange-700">
                Pokaż pełną
              </button>
            </div>

            <div className="border-b border-gray-200 bg-white p-3">
              <div className="flex rounded-lg border border-gray-200 p-1">
                <button
                  type="button"
                  className="flex-1 rounded-md bg-gray-100 py-1.5 text-xs font-semibold text-gray-800"
                >
                  Magazynowe
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-md bg-white py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  Dostawy
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 [&>section>div:first-child]:hidden">
              <ActivityLogPanel
                objectType="product"
                objectId={productId}
                title="Historia operacji"
                defaultCollapsed={false}
                className="border-0 shadow-none"
              />
            </div>

            <div className="rounded-b-xl border-t border-gray-200 bg-white px-4 py-3 text-center">
              <span className="text-[11px] text-gray-500">Wyświetlono ostatnie operacje</span>
            </div>
          </section>
        ) : null}
      </div>
    </div>
    </>
  );
}
