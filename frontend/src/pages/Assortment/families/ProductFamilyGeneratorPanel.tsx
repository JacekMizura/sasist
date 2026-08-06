import { useCallback, useEffect, useMemo, useState } from "react";
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
};

/**
 * Generator: always shows counts + selectable combinations (never auto-creates hundreds).
 * Mode A = empty products; Mode B = copy from base product (default when base exists).
 * SKU / catalog numbers are allocated via product_codes when base category is configured.
 */
export function ProductFamilyGeneratorPanel({ tenantId, familyId, onGenerated }: Props) {
  const [preview, setPreview] = useState<FamilyGeneratePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<FamilyGenerateMode>("copy_base");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const p = await previewFamilyGenerate(tenantId, familyId);
      setPreview(p);
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

  const missingKeys = useMemo(
    () => (preview?.combinations.filter((c) => !c.exists).map((c) => c.value_key) ?? []),
    [preview],
  );

  const selectedMissingCount = useMemo(
    () => missingKeys.filter((k) => selected.has(k)).length,
    [missingKeys, selected],
  );

  const selectedSkuCount = preview?.will_allocate_sku ? selectedMissingCount : 0;
  const selectedCatalogCount = preview?.will_allocate_catalog ? selectedMissingCount : 0;

  const toggle = (key: string, exists: boolean) => {
    if (exists) return;
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
    return <p className="mt-4 text-sm text-slate-500">Ładowanie podglądu generatora…</p>;
  }
  if (!preview) return null;

  return (
    <section className={`mt-8 max-w-3xl ${pimPanelClass}`}>
      <h2 className="text-sm font-semibold text-slate-900">Generator produktów</h2>
      <p className="mt-1 text-sm text-slate-500">
        Przed utworzeniem wybierz kombinacje. SKU i numery katalogowe przydziela kategoria produktu
        bazowego (gdy skonfigurowana).
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className={pimStatTileClass}>
          <dt className="text-xs text-slate-500">Produkty (brakujące)</dt>
          <dd className="font-semibold text-slate-900">{preview.product_count ?? preview.missing_count}</dd>
        </div>
        <div className={pimStatTileClass}>
          <dt className="text-xs text-slate-500">SKU</dt>
          <dd className="font-semibold text-slate-900">{preview.sku_count ?? 0}</dd>
        </div>
        <div className={pimStatTileClass}>
          <dt className="text-xs text-slate-500">Numery katalogowe</dt>
          <dd className="font-semibold text-slate-900">{preview.catalog_count ?? 0}</dd>
        </div>
        <div className={pimStatTileClass}>
          <dt className="text-xs text-slate-500">Wybrane</dt>
          <dd className="font-semibold text-slate-900">
            {selectedMissingCount} / {selectedSkuCount} SKU / {selectedCatalogCount} kat.
          </dd>
        </div>
      </dl>

      {!preview.will_allocate_sku && !preview.will_allocate_catalog ? (
        <p className="mt-3 text-xs text-amber-700">
          Brak numeracji w kategorii produktu bazowego — produkty powstaną bez SKU / numeru
          katalogowego. Skonfiguruj numery w Kategorie albo użyj Generuj na karcie produktu.
        </p>
      ) : null}

      <label className="mt-4 block max-w-md">
        <span className={pimFieldLabelClass}>Tryb</span>
        <Select
          value={mode}
          disabled={busy}
          onChange={(e) => setMode(e.target.value as FamilyGenerateMode)}
        >
          <option value="copy_base" disabled={!preview.has_base_product}>
            B — Kopia z produktu bazowego{preview.has_base_product ? "" : " (brak bazowego)"}
          </option>
          <option value="empty">A — Puste produkty</option>
        </Select>
        {preview.base_product ? (
          <p className="mt-1 text-xs text-slate-500">
            Źródło kopiowania: {preview.base_product.name} (#{preview.base_product.id})
            {preview.base_product.primary_category_id
              ? ` · kategoria #${preview.base_product.primary_category_id}`
              : " · brak kategorii — bez automatycznych kodów"}
          </p>
        ) : null}
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <GhostButton type="button" density="compact" disabled={busy || !missingKeys.length} onClick={selectAllMissing}>
          Zaznacz wszystkie nowe
        </GhostButton>
        <GhostButton type="button" density="compact" disabled={busy} onClick={clearSelection}>
          Wyczyść wybór
        </GhostButton>
        <PrimaryButton
          type="button"
          density="compact"
          disabled={busy || selectedMissingCount === 0}
          onClick={() => void onGenerate()}
        >
          {busy ? "Tworzenie…" : `Utwórz wybrane (${selectedMissingCount})`}
        </PrimaryButton>
      </div>

      {preview.combinations.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Dodaj cechy i wartości, aby zobaczyć kombinacje.</p>
      ) : (
        <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
          {preview.combinations.map((c) => (
            <li key={c.value_key}>
              <label
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                  c.exists ? "bg-slate-50 text-slate-400" : "hover:bg-slate-50 text-slate-800"
                }`}
              >
                <Checkbox
                  checked={c.exists || selected.has(c.value_key)}
                  disabled={c.exists || busy}
                  onChange={() => toggle(c.value_key, c.exists)}
                />
                <span className="flex-1 truncate">{c.label}</span>
                <span className="text-xs text-slate-400">{c.exists ? "istnieje" : "nowy"}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
