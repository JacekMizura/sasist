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
  inventoryType: string;
  scopeMode: InventoryScopeMode;
  filters: InventoryDocumentFiltersConfig;
  warehouseName: string;
  warehouseId: number;
  onScopeModeChange: (mode: InventoryScopeMode) => void;
  onFiltersChange: (filters: InventoryDocumentFiltersConfig) => void;
};

export function InventoryWizardScopeStep({
  inventoryType,
  scopeMode,
  filters,
  warehouseName,
  warehouseId,
  onScopeModeChange,
  onFiltersChange,
}: ScopeStepProps) {
  const isFullType = inventoryType === "FULL";
  const patch = (partial: Partial<InventoryDocumentFiltersConfig>) =>
    onFiltersChange({ ...filters, ...partial, scope_mode: scopeMode });

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
        <label className="block text-xs">
          <span className={labelClass}>ID lokalizacji (po przecinku)</span>
          <input
            className={fieldClass}
            placeholder="np. 101, 102, 103"
            defaultValue={(filters.location_ids ?? []).join(", ")}
            onBlur={(e) => patch({ location_ids: parseIdList(e.target.value) })}
          />
        </label>
      ) : null}

      {scopeMode === "products" ? (
        <label className="block text-xs">
          <span className={labelClass}>ID produktów (po przecinku)</span>
          <input
            className={fieldClass}
            placeholder="np. 5001, 5002"
            defaultValue={(filters.product_ids ?? []).join(", ")}
            onBlur={(e) => patch({ product_ids: parseIdList(e.target.value) })}
          />
        </label>
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
