import { useEffect, useMemo, useState } from "react";

import { previewInventoryScope } from "@/api/inventoryCountApi";
import { getWarehouseLocations, type WarehouseLocationItem } from "@/api/warehouseGraphApi";
import { searchProductsCatalog, type ProductSearchHit } from "@/api/productsSearchApi";
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
  SCOPE_MODE_OPTIONS,
  parseIdList,
} from "../../inventoryStrategyConfig";

const fieldClass = "mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs";
const labelClass = "text-[10px] font-bold uppercase tracking-wide text-slate-500";

type OptionCardProps = {
  selected: boolean;
  title: string;
  hint: string;
  onSelect: () => void;
};

function OptionCard({ selected, title, hint, onSelect }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full border p-2.5 text-left transition ${
        selected
          ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <p className="text-xs font-semibold text-slate-900">{title}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
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

  const toggleLocation = (locId: number) => {
    const set = new Set(filters.location_ids ?? []);
    if (set.has(locId)) set.delete(locId);
    else set.add(locId);
    patch({ location_ids: [...set] });
  };

  const toggleProduct = (prodId: number) => {
    const set = new Set(filters.product_ids ?? []);
    if (set.has(prodId)) set.delete(prodId);
    else set.add(prodId);
    patch({ product_ids: [...set] });
  };

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
          <div className="grid gap-2 sm:grid-cols-2">
            {SCOPE_MODE_OPTIONS.filter((o) => o.id !== "full").map((opt) => (
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

      {scopeMode === "zones" ? (
        <label className="block text-xs">
          <span className={labelClass}>ID stref (po przecinku)</span>
          <input
            className={fieldClass}
            placeholder="np. 1, 2, 3"
            defaultValue={(filters.zone_ids ?? []).join(", ")}
            onBlur={(e) => patch({ zone_ids: parseIdList(e.target.value) })}
          />
          <input
            className={`${fieldClass} mt-1`}
            placeholder="Alejka (opcjonalnie)"
            defaultValue={filters.aisle ?? ""}
            onBlur={(e) => patch({ aisle: e.target.value.trim() || undefined })}
          />
        </label>
      ) : null}

      {scopeMode === "locations" ? (
        <div className="space-y-2 text-xs">
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
                  onClick={() => toggleLocation(loc.id)}
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
          <p className="text-[10px] text-slate-500">Wybrano: {(filters.location_ids ?? []).length} lokalizacji</p>
        </div>
      ) : null}

      {scopeMode === "products" ? (
        <div className="space-y-2 text-xs">
          <input
            className={fieldClass}
            placeholder="Szukaj produktu (min. 2 znaki)…"
            value={prodSearch}
            onChange={(e) => setProdSearch(e.target.value)}
          />
          <div className="max-h-40 overflow-auto rounded border border-slate-200">
            {prodHits.map((p) => {
              const selected = (filters.product_ids ?? []).includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProduct(p.id)}
                  className={`flex w-full flex-col px-2 py-1 text-left hover:bg-slate-50 ${
                    selected ? "bg-slate-100" : ""
                  }`}
                >
                  <span className="font-semibold">{p.name ?? p.sku}</span>
                  <span className="text-[10px] text-slate-500">{p.sku ?? p.ean}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500">Wybrano: {(filters.product_ids ?? []).length} produktów</p>
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
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <p className="font-bold">Zakres obejmuje (szacunek na podstawie bieżących stanów):</p>
          <ul className="mt-1 list-inside list-disc">
            <li>{preview.location_count} lokalizacji</li>
            <li>{preview.product_count} produktów</li>
            <li>{preview.line_count} pozycji magazynowych</li>
          </ul>
        </div>
      ) : null}

      <p className="text-[10px] text-slate-400">
        WMS pokazuje wyłącznie lokalizacje i produkty objęte zakresem. Postęp i zatwierdzenie dotyczą
        tylko tego zakresu.
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
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <section>
        <p className={labelClass}>Tryb liczenia</p>
        <div className="mt-1 space-y-1">
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
        <p className={labelClass}>Polityka ruchów magazynowych</p>
        <div className="mt-1 space-y-1">
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
        <p className={labelClass}>Wynik po zatwierdzeniu</p>
        <div className="mt-1 space-y-1">
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
