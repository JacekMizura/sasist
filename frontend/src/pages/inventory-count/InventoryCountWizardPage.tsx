import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  createInventoryDocument,
  fetchInventoryDocument,
  startInventoryDocument,
  updateInventoryWizard,
  type InventoryDocumentRead,
} from "../../api/inventoryCountApi";
import {
  InventoryWizardScopeStep,
  InventoryWizardStrategyStep,
} from "../../modules/inventoryCount/erp/components/InventoryCountWizardSteps";
import { InventoryPageHeader } from "../../modules/inventoryCount/erp/components/InventoryPageShell";
import {
  inventoryCountModeLabel,
  inventoryMovementPolicyLabel,
  inventoryResultPolicyLabel,
  inventoryScopeModeLabel,
  inventoryTypeLabel,
} from "../../modules/inventoryCount/inventoryCountUiLabels";
import { erpInventoryCountPaths } from "../../modules/inventoryCount/inventoryCountPaths";
import type {
  InventoryCountMode,
  InventoryDocumentFiltersConfig,
  InventoryMovementPolicy,
  InventoryResultPolicy,
  InventoryScopeMode,
} from "../../modules/inventoryCount/inventoryStrategyConfig";
import {
  defaultResultPolicyForType,
  defaultScopeForInventoryType,
  emptyFilters,
} from "../../modules/inventoryCount/inventoryStrategyConfig";
import { useWarehouse } from "../../context/WarehouseContext";

const STEPS = ["Typ", "Zakres", "Ustawienia", "Podsumowanie"] as const;

const INV_TYPES = [
  { id: "FULL", label: "Pełna inwentaryzacja", hint: "Cały magazyn — wszystkie lokalizacje" },
  { id: "PARTIAL", label: "Inwentaryzacja częściowa", hint: "Strefy, lokalizacje, produkty, nośniki…" },
  { id: "CYCLE", label: "Liczenie rotacyjne", hint: "Rotacja ABC / filtry dynamiczne" },
  { id: "CONTROL", label: "Kontrolna", hint: "Weryfikacja wybranych pozycji bez korekt stanów" },
] as const;

const btnPrimary =
  "rounded-md bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50";
const btnSecondary =
  "rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";

export default function InventoryCountWizardPage() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const warehouseId = warehouse?.id ?? 1;

  const [step, setStep] = useState(0);
  const [doc, setDoc] = useState<InventoryDocumentRead | null>(null);
  const [inventoryType, setInventoryType] = useState("FULL");
  const [scopeMode, setScopeMode] = useState<InventoryScopeMode>("full");
  const [filters, setFilters] = useState<InventoryDocumentFiltersConfig>(emptyFilters("full"));
  const [countMode, setCountMode] = useState<InventoryCountMode>("blind");
  const [movementPolicy, setMovementPolicy] = useState<InventoryMovementPolicy>("allow_operations");
  const [resultPolicy, setResultPolicy] = useState<InventoryResultPolicy>("update_stock");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    if (doc) return doc;
    const created = await createInventoryDocument(tenantId, {
      warehouse_id: warehouseId,
      inventory_type: inventoryType,
    });
    hydrateFromDoc(created);
    navigate(erpInventoryCountPaths.wizardDoc(created.id), { replace: true });
    return created;
  }, [doc, tenantId, warehouseId, inventoryType, navigate, hydrateFromDoc]);

  const onTypeChange = (type: string) => {
    setInventoryType(type);
    const sm = defaultScopeForInventoryType(type);
    setScopeMode(sm);
    setFilters(emptyFilters(sm));
    setResultPolicy(defaultResultPolicyForType(type));
  };

  const saveStep = async () => {
    setBusy(true);
    setErr(null);
    try {
      const current = await ensureDocument();
      if (step === 0) {
        const updated = await updateInventoryWizard(tenantId, current.id, { inventory_type: inventoryType });
        hydrateFromDoc(updated);
      }
      if (step === 1) {
        const effectiveScope = inventoryType === "FULL" ? "full" : scopeMode;
        await updateInventoryWizard(tenantId, current.id, {
          filters: { ...filters, scope_mode: effectiveScope },
        });
      }
      if (step === 2) {
        const updated = await updateInventoryWizard(tenantId, current.id, {
          count_mode: countMode,
          lock_mode: movementPolicy,
          strategy: {
            result_policy: resultPolicy,
            movement_policy: movementPolicy,
            blind_count: countMode === "blind",
            visible_quantities: countMode === "visible",
          },
        });
        hydrateFromDoc(updated);
      }
      if (step === STEPS.length - 1 && doc) {
        await startInventoryDocument(tenantId, doc.id);
        navigate(erpInventoryCountPaths.document(doc.id));
        return;
      }
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    } catch {
      setErr("Nie udało się zapisać kroku kreatora.");
    } finally {
      setBusy(false);
    }
  };

  const effectiveScope = inventoryType === "FULL" ? "full" : scopeMode;

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <InventoryPageHeader
        title="Kreator inwentaryzacji"
        subtitle={`Krok ${step + 1} z ${STEPS.length}: ${STEPS[step]}`}
      />

      <div className="flex gap-1">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`flex-1 border px-1 py-1 text-center text-[10px] font-bold uppercase tracking-wide ${
              i === step
                ? "border-slate-900 bg-slate-900 text-white"
                : i < step
                  ? "border-slate-300 bg-slate-100 text-slate-700"
                  : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {err ? <p className="text-xs text-rose-600">{err}</p> : null}

      {step === 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {INV_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTypeChange(t.id)}
              className={`border p-3 text-left transition ${
                inventoryType === t.id
                  ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">{t.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t.hint}</p>
            </button>
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <InventoryWizardScopeStep
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
        />
      ) : null}

      {step === 2 ? (
        <InventoryWizardStrategyStep
          countMode={countMode}
          movementPolicy={movementPolicy}
          resultPolicy={resultPolicy}
          onCountModeChange={setCountMode}
          onMovementPolicyChange={setMovementPolicy}
          onResultPolicyChange={setResultPolicy}
        />
      ) : null}

      {step === 3 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-900">Podsumowanie</p>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-700">
            <li>Typ: {inventoryTypeLabel(inventoryType)}</li>
            <li>Zakres: {inventoryScopeModeLabel(effectiveScope)}</li>
            <li>Tryb liczenia: {inventoryCountModeLabel(countMode)}</li>
            <li>Ruchy magazynowe: {inventoryMovementPolicyLabel(movementPolicy)}</li>
            <li>Wynik: {inventoryResultPolicyLabel(resultPolicy)}</li>
            <li>Dokument: {doc?.number ?? "—"}</li>
          </ul>
          <p className="mt-2 text-[10px] text-slate-500">
            Uruchomienie rozpocznie liczenie w WMS. Operatorzy zobaczą tylko pozycje objęte zakresem
            dokumentu.
          </p>
        </div>
      ) : null}

      <div className="flex justify-between border-t border-slate-200 pt-2">
        <button
          type="button"
          disabled={step === 0 || busy}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className={btnSecondary}
        >
          Wstecz
        </button>
        <div className="flex gap-2">
          <Link to={erpInventoryCountPaths.dashboard} className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800">
            Anuluj
          </Link>
          <button type="button" disabled={busy} onClick={() => void saveStep()} className={btnPrimary}>
            {step === STEPS.length - 1 ? "Uruchom inwentaryzację" : "Dalej"}
          </button>
        </div>
      </div>
    </div>
  );
}
