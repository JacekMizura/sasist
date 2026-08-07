import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import {
  generateFamilyProducts,
  previewFamilyGenerate,
  type FamilyGenerateMode,
  type FamilyGeneratePreview,
} from "../../../api/productFamiliesApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import { Checkbox, GhostButton, PrimaryButton, Select } from "../../../design-system";
import { pimFieldLabelClass, pimPanelClass, pimStatTileClass } from "../pimUi";

type Props = {
  tenantId: number;
  familyId: number;
  onGenerated?: () => void;
  onPreviewChange?: (preview: FamilyGeneratePreview) => void;
  /** When true, tighter chrome for embedding on product Family tab. */
  embedded?: boolean;
};

/**
 * Generator panel: missing combinations, create mode, create action.
 */
export function ProductFamilyGeneratorPanel({
  tenantId,
  familyId,
  onGenerated,
  onPreviewChange,
  embedded = false,
}: Props) {
  const [preview, setPreview] = useState<FamilyGeneratePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<FamilyGenerateMode>("copy_base");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const onPreviewChangeRef = useRef(onPreviewChange);
  onPreviewChangeRef.current = onPreviewChange;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const p = await previewFamilyGenerate(tenantId, familyId);
      setPreview(p);
      onPreviewChangeRef.current?.(p);
      setMode(p.default_mode);
      setSelected(new Set(p.combinations.filter((c) => !c.exists).map((c) => c.value_key)));
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wczytać podglądu generatora."));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, familyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const missing = useMemo(
    () => preview?.combinations.filter((c) => !c.exists) ?? [],
    [preview],
  );

  const missingKeys = useMemo(() => missing.map((c) => c.value_key), [missing]);

  const selectedMissingCount = useMemo(
    () => missingKeys.filter((k) => selected.has(k)).length,
    [missingKeys, selected],
  );

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllMissing = () => setSelected(new Set(missingKeys));
  const clearSelection = () => setSelected(new Set());

  const onGenerate = async () => {
    if (!preview) return;
    const keys = [...selected].filter((k) => missingKeys.includes(k));
    if (!keys.length) {
      toast.error("Wybierz co najmniej jedną nową kombinację.");
      return;
    }
    if (mode === "copy_base" && !preview.has_base_product) {
      toast.error("Ustaw produkt bazowy albo wybierz tryb pustych produktów.");
      return;
    }
    const skuN = preview.will_allocate_sku ? keys.length : 0;
    const catalogN = preview.will_allocate_catalog ? keys.length : 0;
    if (
      !window.confirm(
        `Utworzyć ${keys.length} produktów?\n` +
          `Tryb: ${mode === "copy_base" ? "kopia z produktu bazowego" : "puste produkty"}.\n` +
          `SKU: ${skuN} · Numery katalogowe: ${catalogN}.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await generateFamilyProducts(tenantId, familyId, {
        mode,
        value_keys: keys,
        only_missing: true,
      });
      const skuPart =
        result.allocated_sku_count != null ? `, SKU: ${result.allocated_sku_count}` : "";
      const catPart =
        result.allocated_catalog_count != null
          ? `, katalog: ${result.allocated_catalog_count}`
          : "";
      toast.success(`Utworzono ${result.created_count} produktów${skuPart}${catPart}.`);
      await reload();
      onGenerated?.();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Generowanie nie powiodło się."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className={embedded ? "mt-4 border-t border-slate-100 pt-4" : pimPanelClass}>
        <p className="text-sm text-slate-500">Ładowanie generatora…</p>
      </section>
    );
  }
  if (!preview) return null;

  return (
    <section className={embedded ? "mt-4 border-t border-slate-100 pt-4" : pimPanelClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Generator produktów</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Tworzy brakujące kombinacje cech. SKU / katalog — wg kategorii produktu bazowego.
          </p>
        </div>
        <PrimaryButton
          type="button"
          density="compact"
          disabled={busy || selectedMissingCount === 0}
          onClick={() => void onGenerate()}
        >
          {busy ? "Tworzenie…" : `Utwórz produkty (${selectedMissingCount})`}
        </PrimaryButton>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={pimStatTileClass}>
          <p className="text-xs text-slate-500">Brakujące kombinacje</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-amber-700">{preview.missing_count}</p>
        </div>
        <div className={pimStatTileClass}>
          <p className="text-xs text-slate-500">Wszystkie kombinacje</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{preview.combination_count}</p>
        </div>
        <div className={pimStatTileClass}>
          <p className="text-xs text-slate-500">Istniejące</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{preview.existing_count}</p>
        </div>
        <div className={pimStatTileClass}>
          <p className="text-xs text-slate-500">Wybrane do utworzenia</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{selectedMissingCount}</p>
        </div>
      </div>

      {!preview.will_allocate_sku && !preview.will_allocate_catalog ? (
        <p className="mt-3 text-xs text-amber-700">
          Brak numeracji w kategorii produktu bazowego — produkty powstaną bez SKU / numeru
          katalogowego.
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <label className="block lg:col-span-4">
          <span className={pimFieldLabelClass}>Tryb tworzenia</span>
          <Select
            value={mode}
            disabled={busy}
            onChange={(e) => setMode(e.target.value as FamilyGenerateMode)}
            className="bg-white"
          >
            <option value="copy_base" disabled={!preview.has_base_product}>
              Kopia z produktu bazowego{preview.has_base_product ? "" : " (brak bazowego)"}
            </option>
            <option value="empty">Puste produkty</option>
          </Select>
          {preview.base_product ? (
            <p className="mt-1 text-xs text-slate-500">
              Źródło: {preview.base_product.name} (#{preview.base_product.id})
            </p>
          ) : null}
        </label>
        <div className="flex flex-wrap items-end gap-2 lg:col-span-8">
          <GhostButton type="button" density="compact" disabled={busy || !missingKeys.length} onClick={selectAllMissing}>
            Zaznacz wszystkie brakujące
          </GhostButton>
          <GhostButton type="button" density="compact" disabled={busy} onClick={clearSelection}>
            Wyczyść wybór
          </GhostButton>
        </div>
      </div>

      <div className="mt-4">
        <p className={pimFieldLabelClass}>Brakujące kombinacje</p>
        {missing.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            {preview.combinations.length === 0
              ? "Dodaj cechy i wartości, zapisz rodzinę, aby zobaczyć kombinacje."
              : "Wszystkie kombinacje mają już produkty."}
          </p>
        ) : (
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
            {missing.map((c) => (
              <li key={c.value_key}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50">
                  <Checkbox
                    checked={selected.has(c.value_key)}
                    disabled={busy}
                    onChange={() => toggle(c.value_key)}
                  />
                  <span className="flex-1 truncate">{c.label}</span>
                  <span className="text-xs font-medium text-amber-700">brakuje</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
