import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  createInventoryDocument,
  fetchInventoryDocument,
  previewInventoryScope,
  startInventoryDocument,
  updateInventoryWizard,
  type InventoryDocumentRead,
} from "../../api/inventoryCountApi";
import type { ProductSearchHit } from "../../api/productsSearchApi";
import type { WarehouseLocationItem } from "../../api/warehouseGraphApi";
import {
  InventoryWizardScopeStep,
  InventoryWizardStrategyStep,
} from "../../modules/inventoryCount/erp/components/InventoryCountWizardSteps";
import { InventoryPageHeader } from "../../modules/inventoryCount/erp/components/InventoryPageShell";
import { formatInventoryRequestError } from "../../modules/inventoryCount/inventoryCountApiErrors";
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

  useEffect(() => {
    if (step !== 3) return;
    const effectiveScope = inventoryType === "FULL" ? "full" : scopeMode;
    void previewInventoryScope(tenantId, warehouseId, { ...filters, scope_mode: effectiveScope })
      .then(setSummaryPreview)
      .catch(() => setSummaryPreview(null));
  }, [step, tenantId, warehouseId, filters, scopeMode, inventoryType]);

  const persistFullWizardState = async (documentId: number) => {
    const effectiveScope = inventoryType === "FULL" ? "full" : scopeMode;
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
        const updated = await updateInventoryWizard(tenantId, current.id, {
          inventory_type: inventoryType,
          title: title.trim() || null,
          notes: notes.trim() || null,
        });
        hydrateFromDoc(updated);
      } else if (step === 1) {
        const effectiveScope = inventoryType === "FULL" ? "full" : scopeMode;
        const updated = await updateInventoryWizard(tenantId, current.id, {
          filters: { ...filters, scope_mode: effectiveScope },
        });
        hydrateFromDoc(updated);
      } else if (step === 2) {
        const updated = await persistFullWizardState(current.id);
        hydrateFromDoc(updated);
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
        <div className="space-y-3">
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
          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
            <label className="block text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Tytuł inwentaryzacji</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="np. Roczna inwentaryzacja 2026"
              />
            </label>
            <label className="block text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Opis / notatka</span>
              <textarea
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcjonalny opis dla zespołu magazynowego"
              />
            </label>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
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
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
          <p className="text-sm font-semibold text-slate-900">Podsumowanie przed uruchomieniem</p>
          <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-700">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Tytuł</p>
              <p className="font-semibold">{title.trim() || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Dokument</p>
              <p className="font-mono">{doc?.number ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Typ</p>
              <p>{inventoryTypeLabel(inventoryType)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Zakres</p>
              <p>{inventoryScopeModeLabel(effectiveScope)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Liczenie</p>
              <p>{inventoryCountModeLabel(countMode)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Ruchy</p>
              <p>{inventoryMovementPolicyLabel(movementPolicy)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Wynik</p>
              <p>{inventoryResultPolicyLabel(resultPolicy)}</p>
            </div>
          </div>

          {selectionMeta.locations.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Wybrane lokalizacje ({selectionMeta.locations.length})</p>
              <p className="mt-0.5 text-xs text-slate-600">
                {selectionMeta.locations.map((l) => l.name ?? l.code).join(", ")}
              </p>
            </div>
          ) : null}
          {selectionMeta.products.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Wybrane produkty ({selectionMeta.products.length})</p>
              <p className="mt-0.5 text-xs text-slate-600">
                {selectionMeta.products.map((p) => p.name ?? p.sku).join(", ")}
              </p>
            </div>
          ) : null}

          {summaryPreview ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <p className="font-bold">Szacowany zakres (bieżące stany)</p>
              <ul className="mt-1 list-inside list-disc">
                <li>{summaryPreview.location_count} lokalizacji</li>
                <li>{summaryPreview.product_count} produktów</li>
                <li>{summaryPreview.line_count} pozycji magazynowych</li>
              </ul>
            </div>
          ) : null}

          {notes.trim() ? (
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Notatka</p>
              <p className="text-xs text-slate-600">{notes.trim()}</p>
            </div>
          ) : null}

          <p className="text-[10px] text-slate-500">
            Uruchomienie utworzy migawkę stanów, wygeneruje zadania WMS i — jeśli wybrano — zablokuje ruchy w objętych lokalizacjach.
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
