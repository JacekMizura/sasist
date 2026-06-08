import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  createInventoryDocument,
  startInventoryDocument,
  updateInventoryWizard,
  type InventoryDocumentRead,
} from "../../api/inventoryCountApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { erpInventoryCountPaths } from "../../modules/inventoryCount/inventoryCountPaths";

const STEPS = ["Typ", "Filtry", "Strategia", "Zadania", "Podsumowanie"] as const;

const INV_TYPES = [
  { id: "FULL", label: "Pełna inwentaryzacja", hint: "Cały magazyn" },
  { id: "PARTIAL", label: "Inwentaryzacja częściowa", hint: "Strefa, regał, produkt…" },
  { id: "CYCLE", label: "Cycle count", hint: "Rotacyjne liczenie ABC" },
  { id: "CONTROL", label: "Kontrolna / audyt", hint: "Weryfikacja wybranych pozycji" },
] as const;

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
      // Editing existing draft — detail fetch in phase 2
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
      if (step === 3) {
        // Task generation — phase 2 resolves locations from snapshot filters
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
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex gap-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`flex-1 rounded-lg px-2 py-2 text-center text-xs font-semibold ${
              i === step ? "bg-teal-600 text-white" : i < step ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-500"
            }`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {err ? <p className="mb-4 text-sm text-rose-600">{err}</p> : null}

      {step === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {INV_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setInventoryType(t.id)}
              className={`rounded-2xl border p-5 text-left transition ${
                inventoryType === t.id
                  ? "border-teal-500 bg-teal-50 ring-2 ring-teal-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <p className="font-semibold text-slate-900">{t.label}</p>
              <p className="mt-1 text-sm text-slate-500">{t.hint}</p>
            </button>
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">
            Magazyn: <strong>{warehouse?.name ?? `#${warehouseId}`}</strong>
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Filtry strefy, regału, produktu, kategorii, marki i klasy ABC — konfiguracja w kolejnej iteracji. Na razie
            zakres = cały magazyn przypisany do dokumentu.
          </p>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="flex items-center gap-3">
            <input type="radio" checked={countMode === "blind"} onChange={() => setCountMode("blind")} />
            <span>
              <strong>Liczba ślepa</strong> — operator nie widzi stanu oczekiwanego
            </span>
          </label>
          <label className="flex items-center gap-3">
            <input type="radio" checked={countMode === "visible"} onChange={() => setCountMode("visible")} />
            <span>Liczba z widocznym stanem (kontrola / audyt)</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={recountRequired} onChange={(e) => setRecountRequired(e.target.checked)} />
            <span>Wymagaj ponownego liczenia przy różnicy</span>
          </label>
          <div>
            <p className="text-sm font-medium text-slate-700">Tryb blokady lokalizacji</p>
            <select
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={lockMode}
              onChange={(e) => setLockMode(e.target.value)}
            >
              <option value="snapshot">Snapshot — operacje na kopii stanu</option>
              <option value="soft">Miękka — ostrzeżenia przy ruchach</option>
              <option value="hard">Twarda — blokada ruchów magazynowych</option>
            </select>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-600">
            Generowanie zadań WMS per lokalizacja — po utworzeniu snapshotu i materializacji pozycji dokumentu.
          </p>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-6">
          <p className="font-semibold text-slate-900">Podsumowanie</p>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            <li>Typ: {inventoryType}</li>
            <li>Tryb: {countMode === "blind" ? "ślepy" : "widoczny"}</li>
            <li>Blokada: {lockMode}</li>
            <li>Dokument: {doc?.number ?? "—"}</li>
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Start utworzy snapshot stanów, rezerwacji i numerów seryjnych, a następnie uruchomi liczenie.
          </p>
        </div>
      ) : null}

      <div className="mt-8 flex justify-between">
        <button
          type="button"
          disabled={step === 0 || busy}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          Wstecz
        </button>
        <div className="flex gap-2">
          <Link to={erpInventoryCountPaths.dashboard} className="rounded-xl px-4 py-2 text-sm text-slate-500">
            Anuluj
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveStep()}
            className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {step === STEPS.length - 1 ? "Uruchom inwentaryzację" : "Dalej"}
          </button>
        </div>
      </div>
    </div>
  );
}
