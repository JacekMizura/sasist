import { useEffect, useMemo, useState } from "react";

import { previewInventoryScope } from "@/api/inventoryCountApi";
import { getWarehouseLocations, type WarehouseLocationItem } from "@/api/warehouseGraphApi";
import { searchProductsCatalog, type ProductSearchHit } from "@/api/productsSearchApi";
import { INVENTORY_SCOPE_PRESETS } from "../../inventoryScopePresets";
import type {
  InventoryCountMode,
  InventoryDocumentFiltersConfig,
  InventoryMovementPolicy,
  InventoryResultPolicy,
  InventoryScopeMode,
} from "../../inventoryStrategyConfig";
import {
  COUNT_MODE_OPTIONS,
  MOVEMENT_POLICY_OPTIONS,
  RESULT_POLICY_OPTIONS,
  WIZARD_SCOPE_MODE_OPTIONS,
  parseIdList,
} from "../../inventoryStrategyConfig";

import {
  erpFieldInput,
  erpFieldLabel,
  erpScopeBox,
  erpSelectCard,
  erpSelectCardHint,
  erpSelectCardTitle,
} from "./theme";

const fieldClass = erpFieldInput;
const labelClass = `${erpFieldLabel} mb-0`;

function SelectionTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-800">
      {label}
      <button type="button" onClick={onRemove} className="text-slate-400 hover:text-rose-600" aria-label="Usuń">
        ×
      </button>
    </span>
  );
}

function ProductThumb({ url, name }: { url?: string | null; name?: string | null }) {
  if (url) {
    return <img src={url} alt="" className="h-8 w-8 shrink-0 rounded border border-slate-100 object-cover" />;
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-100 bg-slate-50 text-[9px] font-bold text-slate-400">
      {(name ?? "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

type OptionCardProps = {
  selected: boolean;
  title: string;
  hint: string;
  onSelect: () => void;
};

function OptionCard({ selected, title, hint, onSelect }: OptionCardProps) {
  return (
    <button type="button" onClick={onSelect} className={`w-full text-left ${erpSelectCard(selected)}`}>
      <p className={erpSelectCardTitle(selected)}>{title}</p>
      <p className={erpSelectCardHint(selected)}>{hint}</p>
    </button>
  );
}

type ScopeStepProps = {
  tenantId: number;
  inventoryType: string;
  scopeMode: InventoryScopeMode;
  filters: InventoryDocumentFiltersConfig;
  warehouseName: string;
  warehouseId: number;
  onScopeModeChange: (mode: InventoryScopeMode) => void;
  onFiltersChange: (filters: InventoryDocumentFiltersConfig) => void;
  onSelectionMetaChange?: (meta: {
    products: ProductSearchHit[];
    locations: WarehouseLocationItem[];
  }) => void;
};

export function InventoryWizardScopeStep({
  tenantId,
  inventoryType,
  scopeMode,
  filters,
  warehouseName,
  warehouseId,
  onScopeModeChange,
  onFiltersChange,
  onSelectionMetaChange,
}: ScopeStepProps) {
  const isFullType = inventoryType === "FULL";
  const effectiveScope = isFullType ? "full" : scopeMode;
  const [preview, setPreview] = useState<{ location_count: number; product_count: number; line_count: number } | null>(
    null,
  );
  const [locations, setLocations] = useState<WarehouseLocationItem[]>([]);
  const [locSearch, setLocSearch] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [prodHits, setProdHits] = useState<ProductSearchHit[]>([]);
  const [locPickerOpen, setLocPickerOpen] = useState(false);
  const [prodPickerOpen, setProdPickerOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<ProductSearchHit[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<WarehouseLocationItem[]>([]);

  const patch = (partial: Partial<InventoryDocumentFiltersConfig>) =>
    onFiltersChange({ ...filters, ...partial, scope_mode: effectiveScope as InventoryScopeMode });

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void previewInventoryScope(tenantId, warehouseId, { ...filters, scope_mode: effectiveScope }).then((p) => {
        if (!cancelled) setPreview(p);
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [tenantId, warehouseId, filters, effectiveScope]);

  useEffect(() => {
    if (effectiveScope !== "locations") return;
    void getWarehouseLocations(warehouseId).then(setLocations).catch(() => setLocations([]));
  }, [warehouseId, effectiveScope]);

  useEffect(() => {
    if (effectiveScope !== "products" || prodSearch.trim().length < 2) {
      setProdHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchProductsCatalog(tenantId, prodSearch, 20).then(setProdHits).catch(() => setProdHits([]));
    }, 300);
    return () => window.clearTimeout(t);
  }, [tenantId, prodSearch, effectiveScope]);

  const filteredLocations = useMemo(() => {
    const q = locSearch.trim().toLowerCase();
    if (!q) return locations.slice(0, 50);
    return locations.filter((l) => (l.name ?? l.code ?? "").toLowerCase().includes(q)).slice(0, 50);
  }, [locations, locSearch]);

  const toggleLocation = (loc: WarehouseLocationItem) => {
    const set = new Set(filters.location_ids ?? []);
    if (set.has(loc.id)) {
      set.delete(loc.id);
      setSelectedLocations((prev) => prev.filter((l) => l.id !== loc.id));
    } else {
      set.add(loc.id);
      setSelectedLocations((prev) => (prev.some((l) => l.id === loc.id) ? prev : [...prev, loc]));
      setLocPickerOpen(false);
      setLocSearch("");
    }
    patch({ location_ids: [...set] });
  };

  const toggleProduct = (p: ProductSearchHit) => {
    const set = new Set(filters.product_ids ?? []);
    if (set.has(p.id)) {
      set.delete(p.id);
      setSelectedProducts((prev) => prev.filter((x) => x.id !== p.id));
    } else {
      set.add(p.id);
      setSelectedProducts((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
      setProdPickerOpen(false);
      setProdSearch("");
      setProdHits([]);
    }
    patch({ product_ids: [...set] });
  };

  useEffect(() => {
    onSelectionMetaChange?.({ products: selectedProducts, locations: selectedLocations });
  }, [selectedProducts, selectedLocations, onSelectionMetaChange]);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-600">
        Magazyn: <strong className="text-slate-900">{warehouseName || `#${warehouseId}`}</strong>
      </p>

      {isFullType ? (
        <p className="text-xs text-slate-500">
          Pełna inwentaryzacja obejmuje wszystkie lokalizacje magazynu. W WMS operatorzy widzą tylko
          pozycje objęte tym dokumentem.
        </p>
      ) : (
        <>
          <p className={labelClass}>Zakres inwentaryzacji</p>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Presety operacyjne</p>
            <div className="flex flex-wrap gap-1">
              {INVENTORY_SCOPE_PRESETS.filter((p) => p.scopeMode !== "zones").map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.hint}
                  onClick={() => {
                    onScopeModeChange(preset.scopeMode);
                    onFiltersChange({ ...filters, ...preset.apply() });
                  }}
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:border-slate-400"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {WIZARD_SCOPE_MODE_OPTIONS.filter((o) => o.id !== "full").map((opt) => (
              <OptionCard
                key={opt.id}
                selected={scopeMode === opt.id}
                title={opt.label}
                hint={opt.hint}
                onSelect={() => onScopeModeChange(opt.id)}
              />
            ))}
          </div>
        </>
      )}

      {scopeMode === "locations" ? (
        <div className="space-y-2 text-xs">
          {(filters.location_ids ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedLocations.map((loc) => (
                <SelectionTag
                  key={loc.id}
                  label={loc.name ?? loc.code ?? `#${loc.id}`}
                  onRemove={() => toggleLocation(loc)}
                />
              ))}
            </div>
          ) : null}
          {locPickerOpen ? (
            <>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-700">Wybierz lokalizacje</p>
                <button type="button" className="text-[10px] font-bold text-slate-500 underline" onClick={() => setLocPickerOpen(false)}>
                  Zamknij
                </button>
              </div>
              <input
                className={fieldClass}
                placeholder="Szukaj lokalizacji…"
                value={locSearch}
                onChange={(e) => setLocSearch(e.target.value)}
              />
              <div className="max-h-40 overflow-auto rounded border border-slate-200">
                {filteredLocations.map((loc) => {
                  const selected = (filters.location_ids ?? []).includes(loc.id);
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => toggleLocation(loc)}
                      className={`flex w-full items-center justify-between px-2 py-1 text-left hover:bg-slate-50 ${
                        selected ? "bg-slate-100 font-semibold" : ""
                      }`}
                    >
                      <span>{loc.name ?? loc.code}</span>
                      {selected ? <span className="text-[10px] text-emerald-700">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setLocPickerOpen(true)}
              className="rounded border border-dashed border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-400"
            >
              + Dodaj lokalizacje
            </button>
          )}
        </div>
      ) : null}

      {scopeMode === "products" ? (
        <div className="space-y-2 text-xs">
          {(filters.product_ids ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedProducts.map((p) => (
                <SelectionTag
                  key={p.id}
                  label={p.name ?? p.sku ?? `#${p.id}`}
                  onRemove={() => toggleProduct(p)}
                />
              ))}
            </div>
          ) : null}
          {prodPickerOpen ? (
            <>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-700">Wybierz produkty</p>
                <button type="button" className="text-[10px] font-bold text-slate-500 underline" onClick={() => setProdPickerOpen(false)}>
                  Zamknij
                </button>
              </div>
              <input
                className={fieldClass}
                placeholder="Szukaj produktu (min. 2 znaki)…"
                value={prodSearch}
                onChange={(e) => setProdSearch(e.target.value)}
              />
              <div className="max-h-48 overflow-auto rounded border border-slate-200">
                {prodHits.map((p) => {
                  const selected = (filters.product_ids ?? []).includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProduct(p)}
                      className={`flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50 ${
                        selected ? "bg-slate-100" : ""
                      }`}
                    >
                      <ProductThumb url={p.image_url} name={p.name ?? p.sku} />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{p.name ?? p.sku}</span>
                        <span className="text-[10px] text-slate-500">
                          {[p.sku, p.ean].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      {selected ? <span className="text-[10px] text-emerald-700">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setProdPickerOpen(true)}
              className="rounded border border-dashed border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-400"
            >
              + Dodaj produkty
            </button>
          )}
        </div>
      ) : null}

      {scopeMode === "categories" ? (
        <label className="block text-xs">
          <span className={labelClass}>ID kategorii (po przecinku)</span>
          <input
            className={fieldClass}
            placeholder="np. 10, 11"
            defaultValue={(filters.category_ids ?? []).join(", ")}
            onBlur={(e) => patch({ category_ids: parseIdList(e.target.value) })}
          />
        </label>
      ) : null}

      {scopeMode === "carriers" ? (
        <label className="block text-xs">
          <span className={labelClass}>ID nośników (po przecinku)</span>
          <input
            className={fieldClass}
            placeholder="np. 201, 202"
            defaultValue={(filters.carrier_ids ?? []).join(", ")}
            onBlur={(e) => patch({ carrier_ids: parseIdList(e.target.value) })}
          />
        </label>
      ) : null}

      {scopeMode === "dynamic" ? (
        <div className="space-y-2 border-t border-slate-100 pt-2 text-xs">
          <p className={labelClass}>Filtry dynamiczne</p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(filters.dynamic?.stock_gt_zero)}
              onChange={(e) =>
                patch({ dynamic: { ...filters.dynamic, stock_gt_zero: e.target.checked } })
              }
            />
            <span>Tylko stany &gt; 0</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(filters.include_zero_stock || filters.dynamic?.include_zero_stock)}
              onChange={(e) =>
                patch({
                  include_zero_stock: e.target.checked,
                  dynamic: { ...filters.dynamic, include_zero_stock: e.target.checked },
                })
              }
            />
            <span>Uwzględnij puste lokalizacje (stan = 0)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(filters.dynamic?.missing_ean)}
              onChange={(e) =>
                patch({ dynamic: { ...filters.dynamic, missing_ean: e.target.checked } })
              }
            />
            <span>Produkty bez EAN</span>
          </label>
          <label className="block">
            <span className="text-slate-600">Klasa ABC</span>
            <input
              className={fieldClass}
              placeholder="A, B lub C"
              defaultValue={filters.abc_class ?? ""}
              onBlur={(e) => patch({ abc_class: e.target.value.trim().toUpperCase() || undefined })}
            />
          </label>
          <label className="block">
            <span className="text-slate-600">ID producentów (po przecinku)</span>
            <input
              className={fieldClass}
              placeholder="np. 5, 8"
              defaultValue={(filters.dynamic?.manufacturer_ids ?? []).join(", ")}
              onBlur={(e) =>
                patch({
                  dynamic: {
                    ...filters.dynamic,
                    manufacturer_ids: parseIdList(e.target.value),
                  },
                })
              }
            />
          </label>
        </div>
      ) : null}

      {preview ? (
        <div className={erpScopeBox}>
          <p className="text-sm font-semibold text-emerald-800">Zakres obejmuje (szacunek na podstawie bieżących stanów):</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-emerald-700">
            <li>{preview.location_count} lokalizacji</li>
            <li>{preview.product_count} produktów</li>
            <li>{preview.line_count} pozycji magazynowych</li>
          </ul>
        </div>
      ) : null}

      {!isFullType ? (
        <div className="rounded-md border border-amber-100 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-950">
          <p className="font-bold">Skutek operacyjny inwentaryzacji częściowej</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>W WMS operator liczy tylko lokalizacje i produkty objęte zakresem.</li>
            <li>Zatwierdzenie i różnice dotyczą wyłącznie pozycji w tym zakresie.</li>
            <li>Blokada ruchów (jeśli włączona) obejmuje tylko objęte lokalizacje.</li>
            <li>Korekty RW/PW (jeśli włączone) dotyczą tylko policzonych pozycji w zakresie.</li>
          </ul>
        </div>
      ) : null}

      <p className="text-[10px] text-slate-400">
        Zakres jest zapisywany na serwerze przy przejściu do kolejnego kroku.
      </p>
    </div>
  );
}

type StrategyStepProps = {
  countMode: InventoryCountMode;
  movementPolicy: InventoryMovementPolicy;
  resultPolicy: InventoryResultPolicy;
  onCountModeChange: (mode: InventoryCountMode) => void;
  onMovementPolicyChange: (policy: InventoryMovementPolicy) => void;
  onResultPolicyChange: (policy: InventoryResultPolicy) => void;
};

export function InventoryWizardStrategyStep({
  countMode,
  movementPolicy,
  resultPolicy,
  onCountModeChange,
  onMovementPolicyChange,
  onResultPolicyChange,
}: StrategyStepProps) {
  return (
    <div className="space-y-8 text-sm">
      <section>
        <p className={`${erpFieldLabel} mb-3`}>Tryb liczenia</p>
        <div className="flex flex-col gap-3">
          {COUNT_MODE_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.id}
              selected={countMode === opt.id}
              title={opt.label}
              hint={opt.hint}
              onSelect={() => onCountModeChange(opt.id)}
            />
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-400">
          Ponowne liczenie wymagane tylko przy konflikcie operatorów (ta sama pozycja, różne ilości).
        </p>
      </section>

      <section>
        <p className={`${erpFieldLabel} mb-3`}>Polityka ruchów magazynowych</p>
        <div className="flex flex-col gap-3">
          {MOVEMENT_POLICY_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.id}
              selected={movementPolicy === opt.id}
              title={opt.label}
              hint={opt.hint}
              onSelect={() => onMovementPolicyChange(opt.id)}
            />
          ))}
        </div>
      </section>

      <section>
        <p className={`${erpFieldLabel} mb-3`}>Wynik po zatwierdzeniu</p>
        <div className="flex flex-col gap-3">
          {RESULT_POLICY_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.id}
              selected={resultPolicy === opt.id}
              title={opt.label}
              hint={opt.hint}
              onSelect={() => onResultPolicyChange(opt.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
