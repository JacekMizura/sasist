import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  createInventoryDocument,
  fetchInventoryDocument,
  previewInventoryScope,
  startInventoryDocument,
  updateInventoryWizard,
  type InventoryDocumentRead,
} from "@/api/inventoryCountApi";
import type { ProductSearchHit } from "@/api/productsSearchApi";
import type { WarehouseLocationItem } from "@/api/warehouseGraphApi";
import {
  InventoryWizardScopeStep,
  InventoryWizardStrategyStep,
} from "@/modules/inventoryCount/ui/erp/InventoryCountWizardSteps";
import { formatInventoryRequestError } from "@/modules/inventoryCount/inventoryCountApiErrors";
import {
  inventoryCountModeLabel,
  inventoryMovementPolicyLabel,
  inventoryResultPolicyLabel,
  inventoryScopeModeLabel,
  inventoryTypeLabel,
} from "@/modules/inventoryCount/inventoryCountUiLabels";
import { erpInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import type {
  InventoryCountMode,
  InventoryDocumentFiltersConfig,
  InventoryMovementPolicy,
  InventoryResultPolicy,
  InventoryScopeMode,
} from "@/modules/inventoryCount/inventoryStrategyConfig";
import {
  defaultResultPolicyForType,
  defaultScopeForInventoryType,
  emptyFilters,
} from "@/modules/inventoryCount/inventoryStrategyConfig";
import InventoryWizardView from "@/modules/inventoryCount/ui/erp/InventoryWizardView";
import { useActiveWarehouseContext, ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "@/hooks/useActiveWarehouseContext";
import { ActiveWarehouseRequiredBanner } from "@/components/layout/ActiveWarehouseRequiredBanner";
import { DAMAGE_TENANT_ID } from "@/pages/damage/damageShared";

const STEPS = ["Typ", "Zakres", "Ustawienia", "Podsumowanie"] as const;

const INV_TYPES = [
  { id: "FULL", label: "Pełna", hint: "Cały magazyn — wszystkie lokalizacje i stany" },
  { id: "PARTIAL", label: "Częściowa", hint: "Wybrane strefy, lokalizacje, produkty lub nośniki" },
  { id: "CYCLE", label: "Rotacyjna", hint: "Liczenie rotacyjne ABC / filtry dynamiczne" },
  { id: "CONTROL", label: "Kontrolna", hint: "Weryfikacja wybranych pozycji bez korekt stanów" },
] as const;

export default function InventoryCountWizardPage() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const { warehouseId, hasActiveWarehouse, warehouse } = useActiveWarehouseContext();
  const tenantId = DAMAGE_TENANT_ID;

  const [step, setStep] = useState(0);
  const [doc, setDoc] = useState<InventoryDocumentRead | null>(null);
  const [inventoryType, setInventoryType] = useState("FULL");
  const [scopeMode, setScopeMode] = useState<InventoryScopeMode>("full");
  const [filters, setFilters] = useState<InventoryDocumentFiltersConfig>(emptyFilters("full"));
  const [countMode, setCountMode] = useState<InventoryCountMode>("blind");
  const [movementPolicy, setMovementPolicy] = useState<InventoryMovementPolicy>("allow_operations");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [resultPolicy, setResultPolicy] = useState<InventoryResultPolicy>("update_stock");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [summaryPreview, setSummaryPreview] = useState<{
    location_count: number;
    product_count: number;
    line_count: number;
  } | null>(null);
  const [selectionMeta, setSelectionMeta] = useState<{
    products: ProductSearchHit[];
    locations: WarehouseLocationItem[];
  }>({ products: [], locations: [] });

  const hydrateFromDoc = useCallback((d: InventoryDocumentRead) => {
    setDoc(d);
    setInventoryType(d.inventory_type);
    setCountMode((d.count_mode as InventoryCountMode) || "blind");
    const mp = (d.movement_policy || d.lock_mode || "allow_operations") as InventoryMovementPolicy;
    setMovementPolicy(mp);
    setResultPolicy((d.result_policy as InventoryResultPolicy) || defaultResultPolicyForType(d.inventory_type));
    const f = (d.filters ?? {}) as InventoryDocumentFiltersConfig;
    const sm = (f.scope_mode as InventoryScopeMode) || defaultScopeForInventoryType(d.inventory_type);
    setScopeMode(sm);
    setFilters({ ...emptyFilters(sm), ...f, scope_mode: sm });
    setTitle(String(d.title ?? (d.metadata?.title as string) ?? ""));
    setNotes(d.notes ?? "");
  }, []);

  useEffect(() => {
    if (!documentId || doc) return;
    const id = Number(documentId);
    if (!Number.isFinite(id)) return;
    void fetchInventoryDocument(tenantId, id)
      .then(hydrateFromDoc)
      .catch(() => setErr("Nie udało się wczytać wersji roboczej."));
  }, [documentId, doc, tenantId, hydrateFromDoc]);

  const ensureDocument = useCallback(async () => {
    if (!hasActiveWarehouse || warehouseId == null) {
      setErr(ACTIVE_WAREHOUSE_REQUIRED_MESSAGE);
      throw new Error(ACTIVE_WAREHOUSE_REQUIRED_MESSAGE);
    }
    if (doc) return doc;
    const created = await createInventoryDocument(tenantId, {
      warehouse_id: warehouseId,
      inventory_type: inventoryType,
    });
    hydrateFromDoc(created);
    navigate(erpInventoryCountPaths.wizardDoc(created.id), { replace: true });
    return created;
  }, [doc, tenantId, warehouseId, inventoryType, navigate, hydrateFromDoc]);

  if (!hasActiveWarehouse || warehouseId == null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <ActiveWarehouseRequiredBanner />
      </div>
    );
  }

  const onTypeChange = (type: string) => {
    setInventoryType(type);
    const sm = defaultScopeForInventoryType(type);
    setScopeMode(sm);
    setFilters(emptyFilters(sm));
    setResultPolicy(defaultResultPolicyForType(type));
  };

  const effectiveScope = inventoryType === "FULL" ? "full" : scopeMode;

  useEffect(() => {
    if (step !== 3) return;
    void previewInventoryScope(tenantId, warehouseId, { ...filters, scope_mode: effectiveScope })
      .then(setSummaryPreview)
      .catch(() => setSummaryPreview(null));
  }, [step, tenantId, warehouseId, filters, effectiveScope]);

  const persistFullWizardState = async (documentId: number) => {
    return updateInventoryWizard(tenantId, documentId, {
      inventory_type: inventoryType,
      title: title.trim() || null,
      notes: notes.trim() || null,
      filters: { ...filters, scope_mode: effectiveScope },
      count_mode: countMode,
      lock_mode: movementPolicy,
      strategy: {
        result_policy: resultPolicy,
        movement_policy: movementPolicy,
        blind_count: countMode === "blind",
        visible_quantities: countMode === "visible",
      },
    });
  };

  const saveStep = async () => {
    setBusy(true);
    setErr(null);
    try {
      const current = await ensureDocument();
      if (step === 0) {
        hydrateFromDoc(
          await updateInventoryWizard(tenantId, current.id, {
            inventory_type: inventoryType,
            title: title.trim() || null,
            notes: notes.trim() || null,
          }),
        );
      } else if (step === 1) {
        hydrateFromDoc(
          await updateInventoryWizard(tenantId, current.id, {
            filters: { ...filters, scope_mode: effectiveScope },
          }),
        );
      } else if (step === 2) {
        hydrateFromDoc(await persistFullWizardState(current.id));
      } else if (step === STEPS.length - 1) {
        const updated = await persistFullWizardState(current.id);
        hydrateFromDoc(updated);
        await startInventoryDocument(tenantId, updated.id);
        navigate(erpInventoryCountPaths.document(updated.id));
        return;
      }
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    } catch (e) {
      setErr(formatInventoryRequestError(e, "Nie udało się zapisać kroku kreatora."));
    } finally {
      setBusy(false);
    }
  };

  const stepContent =
    step === 1 ? (
      <InventoryWizardScopeStep
        tenantId={tenantId}
        inventoryType={inventoryType}
        scopeMode={effectiveScope}
        filters={filters}
        warehouseName={warehouse?.name ?? ""}
        warehouseId={warehouseId}
        onScopeModeChange={(mode) => {
          setScopeMode(mode);
          setFilters(emptyFilters(mode));
        }}
        onFiltersChange={setFilters}
        onSelectionMetaChange={setSelectionMeta}
      />
    ) : step === 2 ? (
      <InventoryWizardStrategyStep
        countMode={countMode}
        movementPolicy={movementPolicy}
        resultPolicy={resultPolicy}
        onCountModeChange={setCountMode}
        onMovementPolicyChange={setMovementPolicy}
        onResultPolicyChange={setResultPolicy}
      />
    ) : step === 3 ? (
      <div className="space-y-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Podsumowanie przed uruchomieniem</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tytuł</p>
            <p className="font-medium">{title.trim() || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dokument</p>
            <p className="font-mono text-xs">{doc?.number ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Typ</p>
            <p>{inventoryTypeLabel(inventoryType)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Zakres</p>
            <p>{inventoryScopeModeLabel(effectiveScope)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Liczenie</p>
            <p>{inventoryCountModeLabel(countMode)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ruchy</p>
            <p>{inventoryMovementPolicyLabel(movementPolicy)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Wynik</p>
            <p>{inventoryResultPolicyLabel(resultPolicy)}</p>
          </div>
        </div>
        {summaryPreview ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
            <p className="text-sm font-semibold">Szacowany zakres (bieżące stany)</p>
            <ul className="mt-1 list-inside list-disc text-sm">
              <li>{summaryPreview.location_count} lokalizacji</li>
              <li>{summaryPreview.product_count} produktów</li>
              <li>{summaryPreview.line_count} pozycji magazynowych</li>
            </ul>
          </div>
        ) : null}
        {selectionMeta.locations.length > 0 ? (
          <p className="text-sm text-slate-600">
            Lokalizacje: {selectionMeta.locations.map((l) => l.name ?? l.code).join(", ")}
          </p>
        ) : null}
        {selectionMeta.products.length > 0 ? (
          <p className="text-sm text-slate-600">
            Produkty: {selectionMeta.products.map((p) => p.name ?? p.sku).join(", ")}
          </p>
        ) : null}
        <p className="text-xs text-slate-500">
          Uruchomienie utworzy migawkę stanów, wygeneruje zadania WMS i — jeśli wybrano — zablokuje ruchy w objętych
          lokalizacjach.
        </p>
      </div>
    ) : null;

  const summaryPanel = (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Typ</dt>
        <dd className="font-medium text-slate-900">{inventoryTypeLabel(inventoryType)}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tytuł</dt>
        <dd className="font-medium text-slate-900">{title.trim() || "—"}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Magazyn</dt>
        <dd className="text-slate-700">{warehouse?.name ?? "—"}</dd>
      </div>
      {step >= 1 ? (
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Zakres</dt>
          <dd className="text-slate-700">{inventoryScopeModeLabel(effectiveScope)}</dd>
        </div>
      ) : null}
      {step >= 2 ? (
        <>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Liczenie</dt>
            <dd className="text-slate-700">{inventoryCountModeLabel(countMode)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ruchy</dt>
            <dd className="text-slate-700">{inventoryMovementPolicyLabel(movementPolicy)}</dd>
          </div>
        </>
      ) : null}
      {step === 3 && summaryPreview ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
          <p className="text-xs font-semibold">Szacowany zakres</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            <li>{summaryPreview.location_count} lokalizacji</li>
            <li>{summaryPreview.product_count} produktów</li>
            <li>{summaryPreview.line_count} pozycji</li>
          </ul>
        </div>
      ) : null}
      {doc?.number ? (
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dokument</dt>
          <dd className="font-mono text-xs text-slate-700">{doc.number}</dd>
        </div>
      ) : null}
    </dl>
  );

  return (
    <InventoryWizardView
      step={step}
      stepLabels={STEPS}
      error={err}
      busy={busy}
      cancelPath={erpInventoryCountPaths.dashboard}
      onBack={() => setStep((s) => Math.max(0, s - 1))}
      onNext={() => void saveStep()}
      isLastStep={step === STEPS.length - 1}
      inventoryType={inventoryType}
      onTypeChange={onTypeChange}
      typeOptions={INV_TYPES}
      title={title}
      onTitleChange={setTitle}
      notes={notes}
      onNotesChange={setNotes}
      stepContent={stepContent}
      summaryPanel={summaryPanel}
    />
  );
}
