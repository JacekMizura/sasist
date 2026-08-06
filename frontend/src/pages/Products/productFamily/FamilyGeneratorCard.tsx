import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  previewFamilyGenerate,
  type FamilyGeneratePreview,
  type ProductFamilyMember,
} from "../../../api/productFamiliesApi";
import { allocateProductCode } from "../../../api/productCodesApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import api from "../../../api/axios";
import { GhostButton, PrimaryButton } from "../../../design-system";
import { ProductFamilyGeneratorPanel } from "../../Assortment/families/ProductFamilyGeneratorPanel";
import { pimHintClass, pimPanelClass, pimStatTileClass } from "../../Assortment/pimUi";

type Props = {
  tenantId: number;
  familyId: number;
  members: ProductFamilyMember[];
  onChanged: () => void;
};

/**
 * Generator status tiles + embedded combo generator + allocate missing SKU/catalog.
 */
export function FamilyGeneratorCard({ tenantId, familyId, members, onChanged }: Props) {
  const [preview, setPreview] = useState<FamilyGeneratePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busySku, setBusySku] = useState(false);
  const [busyCatalog, setBusyCatalog] = useState(false);

  const reloadPreview = useCallback(async () => {
    setLoading(true);
    try {
      setPreview(await previewFamilyGenerate(tenantId, familyId));
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wczytać statusu generatora."));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, familyId]);

  useEffect(() => {
    void reloadPreview();
  }, [reloadPreview]);

  const missingSku = useMemo(
    () => members.filter((m) => !(m.sku && String(m.sku).trim())),
    [members],
  );
  const missingCatalog = useMemo(
    () => members.filter((m) => !(m.catalog_number && String(m.catalog_number).trim())),
    [members],
  );

  const allocateMissing = async (kind: "sku" | "catalog") => {
    const targets = kind === "sku" ? missingSku : missingCatalog;
    if (!targets.length) {
      toast("Wszystkie produkty mają już " + (kind === "sku" ? "SKU." : "numer katalogowy."));
      return;
    }
    if (
      !window.confirm(
        kind === "sku"
          ? `Wygenerować SKU dla ${targets.length} produktów bez SKU?`
          : `Wygenerować numery katalogowe dla ${targets.length} produktów?`,
      )
    ) {
      return;
    }
    if (kind === "sku") setBusySku(true);
    else setBusyCatalog(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const m of targets) {
        try {
          const code = await allocateProductCode({
            tenantId,
            kind,
            productId: m.id,
          });
          const body =
            kind === "sku"
              ? { sku: code.value, symbol: code.value }
              : { catalog_number: code.value };
          await api.put(`/products/${m.id}/`, body, { params: { tenant_id: tenantId } });
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      if (ok) toast.success(`Przydzielono ${ok} ${kind === "sku" ? "SKU" : "numerów katalogowych"}.`);
      if (fail) toast.error(`Nie udało się dla ${fail} produktów (brak kategorii / numeracji).`);
      onChanged();
      await reloadPreview();
    } finally {
      if (kind === "sku") setBusySku(false);
      else setBusyCatalog(false);
    }
  };

  return (
    <section className={pimPanelClass}>
      <h2 className="text-sm font-semibold text-slate-900">Generator</h2>
      <p className={pimHintClass}>
        Status kombinacji i alokacja brakujących kodów z numeracji kategorii.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Ładowanie statusu…</p>
      ) : preview ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <div className={pimStatTileClass}>
            <dt className="text-xs text-slate-500">Kombinacje</dt>
            <dd className="font-semibold text-slate-900">{preview.combination_count}</dd>
          </div>
          <div className={pimStatTileClass}>
            <dt className="text-xs text-slate-500">Istnieje</dt>
            <dd className="font-semibold text-slate-900">{preview.existing_count}</dd>
          </div>
          <div className={pimStatTileClass}>
            <dt className="text-xs text-slate-500">Brakuje</dt>
            <dd className="font-semibold text-slate-900">{preview.missing_count}</dd>
          </div>
          <div className={pimStatTileClass}>
            <dt className="text-xs text-slate-500">Brakuje SKU</dt>
            <dd className="font-semibold text-slate-900">{missingSku.length}</dd>
          </div>
          <div className={pimStatTileClass}>
            <dt className="text-xs text-slate-500">Brakuje katalogowych</dt>
            <dd className="font-semibold text-slate-900">{missingCatalog.length}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Brak danych podglądu.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <GhostButton
          type="button"
          density="compact"
          disabled={busySku || missingSku.length === 0}
          onClick={() => void allocateMissing("sku")}
        >
          {busySku ? "Generuję SKU…" : `Generuj SKU (${missingSku.length})`}
        </GhostButton>
        <GhostButton
          type="button"
          density="compact"
          disabled={busyCatalog || missingCatalog.length === 0}
          onClick={() => void allocateMissing("catalog")}
        >
          {busyCatalog ? "Generuję katalog…" : `Generuj katalogowe (${missingCatalog.length})`}
        </GhostButton>
        <PrimaryButton
          type="button"
          density="compact"
          disabled={!preview || preview.missing_count < 1}
          onClick={() => {
            document.getElementById("family-generator-panel")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          Generuj brakujące ({preview?.missing_count ?? 0})
        </PrimaryButton>
      </div>

      <div id="family-generator-panel" className="mt-2">
        <ProductFamilyGeneratorPanel
          tenantId={tenantId}
          familyId={familyId}
          embedded
          onGenerated={() => {
            onChanged();
            void reloadPreview();
          }}
        />
      </div>
    </section>
  );
}
