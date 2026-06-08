import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  createInventoryDocument,
  startInventoryDocument,
  updateInventoryWizard,
  type InventoryDocumentRead,
} from "../../api/inventoryCountApi";
import { InventoryPageHeader } from "../../modules/inventoryCount/erp/components/InventoryPageShell";
import {
  inventoryCountModeLabel,
  inventoryLockModeLabel,
  inventoryTypeLabel,
} from "../../modules/inventoryCount/inventoryCountUiLabels";
import { erpInventoryCountPaths } from "../../modules/inventoryCount/inventoryCountPaths";
import { useWarehouse } from "../../context/WarehouseContext";

const STEPS = ["Typ", "Zakres", "Strategia", "Zadania", "Podsumowanie"] as const;

const INV_TYPES = [
  { id: "FULL", label: "Pełna inwentaryzacja", hint: "Cały magazyn" },
  { id: "PARTIAL", label: "Inwentaryzacja częściowa", hint: "Strefa, regał, produkt…" },
  { id: "CYCLE", label: "Liczenie rotacyjne", hint: "Rotacyjne liczenie ABC" },
  { id: "CONTROL", label: "Kontrolna", hint: "Weryfikacja wybranych pozycji" },
] as const;

const btnPrimary = "rounded-md bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50";
const btnSecondary = "rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";

export default function InventoryCountWizardPage() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const warehouseId = warehouse?.id ?? 1;

  const [step, setStep] = useState(0);
  const [doc, setDoc] = useState<InventoryDocumentRead | null>(null);
  const [inventoryType, setInventoryType] = useState("FULL");
  const [countMode, setCountMode] = useState("blind");
  const [lockMode, setLockMode] = useState("snapshot");
  const [recountRequired, setRecountRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ensureDocument = useCallback(async () => {
    if (doc) return doc;
    const created = await createInventoryDocument(tenantId, {
      warehouse_id: warehouseId,
      inventory_type: inventoryType,
    });
    setDoc(created);
    navigate(erpInventoryCountPaths.wizardDoc(created.id), { replace: true });
    return created;
  }, [doc, tenantId, warehouseId, inventoryType, navigate]);

  useEffect(() => {
    if (documentId && !doc) {
      // Edycja wersji roboczej — wczytanie w kolejnej iteracji
    }
  }, [documentId, doc]);

  const saveStep = async () => {
    setBusy(true);
    setErr(null);
    try {
      const current = await ensureDocument();
      if (step === 0) {
        const updated = await updateInventoryWizard(tenantId, current.id, { inventory_type: inventoryType });
        setDoc(updated);
      }
      if (step === 1) {
        await updateInventoryWizard(tenantId, current.id, {
          filters: { warehouse_id: warehouseId },
        });
      }
      if (step === 2) {
        const updated = await updateInventoryWizard(tenantId, current.id, {
          count_mode: countMode,
          lock_mode: lockMode,
          recount_required: recountRequired,
          strategy: { blind_count: countMode === "blind", confidence_scoring: true },
        });
        setDoc(updated);
      }
      if (step === 4 && doc) {
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
              onClick={() => setInventoryType(t.id)}
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
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-600">
            Magazyn: <strong className="text-slate-900">{warehouse?.name ?? `#${warehouseId}`}</strong>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Filtry strefy, regału, produktu i klasy ABC — w kolejnej iteracji. Obecnie zakres obejmuje cały magazyn
            przypisany do dokumentu.
          </p>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <label className="flex items-start gap-2 text-xs">
            <input type="radio" className="mt-0.5" checked={countMode === "blind"} onChange={() => setCountMode("blind")} />
            <span>
              <strong className="text-slate-900">Liczba ślepa</strong> — operator nie widzi stanu oczekiwanego
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs">
            <input type="radio" className="mt-0.5" checked={countMode === "visible"} onChange={() => setCountMode("visible")} />
            <span>Liczba z widocznym stanem (kontrola)</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={recountRequired} onChange={(e) => setRecountRequired(e.target.checked)} />
            <span>Wymagaj ponownego liczenia przy różnicy</span>
          </label>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Blokada lokalizacji</p>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
              value={lockMode}
              onChange={(e) => setLockMode(e.target.value)}
            >
              <option value="snapshot">Migawka stanów — operacje na kopii</option>
              <option value="soft">Miękka — ostrzeżenia przy ruchach</option>
              <option value="hard">Twarda — blokada ruchów magazynowych</option>
            </select>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
          Generowanie zadań WMS per lokalizacja — po utworzeniu migawki stanów i materializacji pozycji dokumentu.
        </div>
      ) : null}

      {step === 4 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-900">Podsumowanie</p>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-700">
            <li>Typ: {inventoryTypeLabel(inventoryType)}</li>
            <li>Tryb liczenia: {inventoryCountModeLabel(countMode)}</li>
            <li>Blokada: {inventoryLockModeLabel(lockMode)}</li>
            <li>Dokument: {doc?.number ?? "—"}</li>
          </ul>
          <p className="mt-2 text-[10px] text-slate-500">
            Uruchomienie utworzy migawkę stanów, rezerwacji i numerów seryjnych, a następnie rozpocznie liczenie w WMS.
          </p>
        </div>
      ) : null}

      <div className="flex justify-between border-t border-slate-200 pt-2">
        <button type="button" disabled={step === 0 || busy} onClick={() => setStep((s) => Math.max(0, s - 1))} className={btnSecondary}>
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
