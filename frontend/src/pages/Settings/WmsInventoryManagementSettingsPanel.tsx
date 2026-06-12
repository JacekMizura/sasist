import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import toast from "react-hot-toast";

import {
  getInventoryManagementSettings,
  saveInventoryManagementSettings,
  type InventoryManagementModeUi,
} from "../../api/inventoryManagementPolicyApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";

const SCREEN_TITLE = "Sposób aktualizacji stanów magazynowych";
const SCREEN_LEAD =
  "Określa, w jaki sposób system może zmieniać ilości na stanach magazynowych w wybranym magazynie.";

type ModeCopy = {
  value: InventoryManagementModeUi;
  label: string;
  shortLabel: string;
  description: string;
  effects: Array<{ ok: boolean; text: string }>;
};

const MODES: ModeCopy[] = [
  {
    value: "DOCUMENTS_ONLY",
    label: "Wyłącznie dokumenty magazynowe",
    shortLabel: "Wyłącznie dokumenty",
    description:
      "Stany zmieniają się tylko przez dokumenty magazynowe — bez ręcznej korekty na karcie produktu.",
    effects: [
      { ok: true, text: "PZ, WZ, MM aktualizują stany" },
      { ok: true, text: "Inwentaryzacja aktualizuje stany (RW/PW)" },
      { ok: true, text: "Korekty magazynowe wyłącznie przez dokumenty" },
      { ok: false, text: "Brak ręcznej korekty na karcie produktu" },
    ],
  },
  {
    value: "HYBRID",
    label: "Dokumenty magazynowe + ręczne korekty",
    shortLabel: "Dokumenty + korekty",
    description:
      "Dokumenty działają jak wyżej. Dodatkowo operator może wykonać ręczną korektę na karcie produktu.",
    effects: [
      { ok: true, text: "Wszystkie dokumenty magazynowe (PZ, WZ, MM, inwentaryzacja)" },
      { ok: true, text: "Ręczna korekta na karcie produktu (Asortyment → Produkt → Magazyn)" },
      { ok: true, text: "Każda ręczna korekta tworzy dokument RK" },
      { ok: true, text: "Pełny ślad audytowy operacji magazynowych" },
    ],
  },
];

const COMPARISON_ROWS: Array<{
  feature: string;
  documentsOnly: boolean;
  hybrid: boolean;
}> = [
  { feature: "PZ / WZ / MM", documentsOnly: true, hybrid: true },
  { feature: "Inwentaryzacja", documentsOnly: true, hybrid: true },
  { feature: "Ręczna korekta na produkcie", documentsOnly: false, hybrid: true },
  { feature: "Dokument RK przy korekcie", documentsOnly: false, hybrid: true },
  { feature: "Audyt operacji magazynowych", documentsOnly: true, hybrid: true },
];

function modeByValue(value: InventoryManagementModeUi): ModeCopy {
  return MODES.find((m) => m.value === value) ?? MODES[1];
}

const radioOuter =
  "flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300 hover:bg-slate-50/80 has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50/40";
const radioInput = "mt-1 h-4 w-4 shrink-0 border-slate-300 text-blue-600 focus:ring-blue-500";
const fieldHint = "mt-0.5 text-xs leading-relaxed text-slate-500";
const cardClass = "rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm";
const sectionTitleClass = "text-sm font-semibold text-slate-900";

function BoolCell({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
      <Check className="h-4 w-4 shrink-0" aria-hidden />
      TAK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-500">
      <X className="h-4 w-4 shrink-0" aria-hidden />
      NIE
    </span>
  );
}

function ModeEffectsList({ mode }: { mode: InventoryManagementModeUi }) {
  const copy = modeByValue(mode);
  return (
    <ul className="mt-3 space-y-2">
      {copy.effects.map((item) => (
        <li key={item.text} className="flex items-start gap-2 text-sm text-slate-700">
          {item.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
          )}
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

type Props = {
  warehouseId: number | null;
};

export default function WmsInventoryManagementSettingsPanel({ warehouseId }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMode, setSavedMode] = useState<InventoryManagementModeUi>("HYBRID");
  const [draftMode, setDraftMode] = useState<InventoryManagementModeUi>("HYBRID");
  const [resolvedWarehouseLabel, setResolvedWarehouseLabel] = useState<string | null>(null);

  const activeCopy = useMemo(() => modeByValue(savedMode), [savedMode]);
  const previewCopy = useMemo(() => modeByValue(draftMode), [draftMode]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await getInventoryManagementSettings({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId: warehouseId != null && warehouseId > 0 ? warehouseId : undefined,
      });
      const mode: InventoryManagementModeUi =
        s.inventory_management_mode === "DOCUMENTS_ONLY" ? "DOCUMENTS_ONLY" : "HYBRID";
      setSavedMode(mode);
      setDraftMode(mode);
      setResolvedWarehouseLabel(String(s.warehouse_id));
    } catch {
      setLoadError("Nie udało się wczytać ustawień aktualizacji stanów magazynowych.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = draftMode !== savedMode;
  const canSave = dirty && !loading && !saving && loadError == null;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = await saveInventoryManagementSettings({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId != null && warehouseId > 0 ? warehouseId : undefined,
        inventory_management_mode: draftMode,
      });
      const mode: InventoryManagementModeUi =
        saved.inventory_management_mode === "DOCUMENTS_ONLY" ? "DOCUMENTS_ONLY" : "HYBRID";
      setSavedMode(mode);
      setDraftMode(mode);
      toast.success("Zapisano sposób aktualizacji stanów magazynowych.");
    } catch {
      toast.error("Nie udało się zapisać ustawień.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{SCREEN_TITLE}</h2>
          <p className="mt-1 text-sm text-slate-600">{SCREEN_LEAD}</p>
          <p className="mt-1 text-xs text-slate-500">
            Magazyn: <span className="font-medium text-slate-700">{resolvedWarehouseLabel ?? "—"}</span>
          </p>
        </div>
        {!loading && !loadError ? (
          <div
            className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            role="status"
            aria-live="polite"
          >
            <span className="text-slate-600">Aktywny tryb:</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              {activeCopy.label}
            </span>
            {dirty ? (
              <span className="text-xs text-amber-700">
                (Niezapisana zmiana: {previewCopy.shortLabel})
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      <section className={cardClass} aria-labelledby="inventory-mode-choice-heading">
        <h3 id="inventory-mode-choice-heading" className={sectionTitleClass}>
          Wybór trybu
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Decyzja dotyczy całego magazynu. Nie wpływa na procesy WMS (zbieranie, pakowanie, przyjęcia).
        </p>
        {loading ? <p className="mt-3 text-sm text-slate-500">Wczytywanie…</p> : null}
        {loadError ? <p className="mt-3 text-sm text-red-600">{loadError}</p> : null}
        {!loading && !loadError ? (
          <div className="mt-4 space-y-3" role="radiogroup" aria-label={SCREEN_TITLE}>
            {MODES.map((opt) => (
              <label key={opt.value} className={radioOuter}>
                <input
                  type="radio"
                  name="wms-inventory-management-mode"
                  className={radioInput}
                  checked={draftMode === opt.value}
                  onChange={() => setDraftMode(opt.value)}
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{opt.label}</span>
                  <span className={fieldHint}>{opt.description}</span>
                </span>
              </label>
            ))}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void save()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Zapisywanie…" : "Zapisz zmiany"}
          </button>
          {dirty ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => setDraftMode(savedMode)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cofnij zmiany
            </button>
          ) : null}
        </div>
      </section>

      {!loading && !loadError ? (
        <>
          <section className={cardClass} aria-labelledby="inventory-mode-effects-heading">
            <h3 id="inventory-mode-effects-heading" className={sectionTitleClass}>
              Co oznacza wybrany tryb?
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Podgląd skutków dla:{" "}
              <span className="font-medium text-slate-700">{previewCopy.label}</span>
              {dirty ? " — zapisz, aby ustawić jako aktywny." : ""}
            </p>
            <ModeEffectsList mode={draftMode} />
          </section>

          <section className={cardClass} aria-labelledby="inventory-mode-compare-heading">
            <h3 id="inventory-mode-compare-heading" className={sectionTitleClass}>
              Porównanie trybów
            </h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th scope="col" className="py-2 pr-4 font-medium text-slate-600">
                      Funkcja
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium text-slate-900">
                      Wyłącznie dokumenty
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium text-slate-900">
                      Dokumenty + korekty
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.feature} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-4 text-slate-700">{row.feature}</td>
                      <td className="px-3 py-2.5">
                        <BoolCell value={row.documentsOnly} />
                      </td>
                      <td className="px-3 py-2.5">
                        <BoolCell value={row.hybrid} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
