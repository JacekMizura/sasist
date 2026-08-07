import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import {
  attachProductFamily,
  getProductFamily,
  getProductFamilyState,
  listProductFamilies,
  previewFamilyGenerate,
  type ProductFamily,
  type ProductFamilyListItem,
} from "../../api/productFamiliesApi";
import { extractApiErrorMessage } from "../../api/authApi";
import { PrimaryButton, Select } from "../../design-system";
import { pimFieldLabelClass, pimHintClass, pimPanelClass, pimStatTileClass } from "../Assortment/pimUi";

type Props = {
  tenantId: number;
  productId: number;
};

type ProductAttrChip = {
  key: string;
  name: string;
  value: string;
  displayType: "text" | "color" | "image";
  colorHex: string | null;
};

/**
 * Product edit → Rodzina: assign + compact family preview (no family management).
 */
export function ProductEditFamilyTab({ tenantId, productId }: Props) {
  const [families, setFamilies] = useState<ProductFamilyListItem[]>([]);
  const [savedFamilyId, setSavedFamilyId] = useState<string>("");
  const [draftFamilyId, setDraftFamilyId] = useState("");
  const [family, setFamily] = useState<ProductFamily | null>(null);
  const [missingCount, setMissingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [st, list] = await Promise.all([
        getProductFamilyState(tenantId, productId),
        listProductFamilies(tenantId, { includeInactive: false }),
      ]);
      setFamilies(list);
      const fid = st.product_family_id != null ? String(st.product_family_id) : "";
      setSavedFamilyId(fid);
      setDraftFamilyId(fid);
      if (st.product_family_id != null) {
        const g = await getProductFamily(tenantId, st.product_family_id, { includeMembers: true });
        setFamily(g);
        try {
          const preview = await previewFamilyGenerate(tenantId, st.product_family_id);
          setMissingCount(preview.missing_count ?? 0);
        } catch {
          setMissingCount(Math.max(0, (g.combination_count ?? 0) - (g.product_count ?? 0)));
        }
      } else {
        setFamily(null);
        setMissingCount(0);
      }
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wczytać rodziny."));
      setFamily(null);
      setSavedFamilyId("");
      setDraftFamilyId("");
      setMissingCount(0);
    } finally {
      setLoading(false);
    }
  }, [tenantId, productId]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const dirty = draftFamilyId !== savedFamilyId;

  const openFamilyId = draftFamilyId.trim()
    ? Number(draftFamilyId)
    : savedFamilyId.trim()
      ? Number(savedFamilyId)
      : null;
  const canOpenFamily = openFamilyId != null && Number.isFinite(openFamilyId);

  const member = useMemo(
    () => family?.members?.find((m) => m.id === productId) ?? null,
    [family, productId],
  );

  const productChips = useMemo((): ProductAttrChip[] => {
    if (!family) return [];
    const attrs = [...(family.attributes ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
    );
    const parts = (member?.attribute_summary ?? "")
      .split(" / ")
      .map((s) => s.trim())
      .filter(Boolean);
    return attrs.map((attr, i) => {
      const value = parts[i] || "";
      const matched = (attr.values ?? []).find((v) => (v.name || "").trim() === value);
      return {
        key: String(attr.id ?? attr.name),
        name: attr.name,
        value: value || "—",
        displayType: attr.display_type || "text",
        colorHex: matched?.color_hex?.trim() || null,
      };
    });
  }, [family, member]);

  const statusLabel = member?.is_base ? "Produkt bazowy" : "Członek rodziny";
  const productCount = family?.product_count ?? family?.members?.length ?? 0;
  const combinationCount = family?.combination_count ?? 0;
  const baseLabel =
    family?.base_product_name?.trim() ||
    (family?.base_product_id != null ? `#${family.base_product_id}` : "—");

  const onAttach = async () => {
    const nextId = draftFamilyId.trim() ? Number(draftFamilyId) : null;
    if (draftFamilyId.trim() && !Number.isFinite(nextId)) {
      toast.error("Nieprawidłowa rodzina.");
      return;
    }
    setBusy(true);
    try {
      await attachProductFamily(tenantId, productId, nextId);
      toast.success(nextId == null ? "Odłączono od rodziny." : "Przypisano do rodziny.");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się zmienić rodziny."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Ładowanie…</p>;
  }

  return (
    <div className="space-y-4">
      {/* 1 — Przynależność */}
      <section className={pimPanelClass}>
        <h2 className="text-sm font-semibold text-slate-900">Przynależność do rodziny</h2>
        <p className={pimHintClass}>Ten produkt może należeć do jednej rodziny produktów.</p>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-[240px] flex-1">
            <span className={pimFieldLabelClass}>Rodzina produktów</span>
            <Select
              value={draftFamilyId}
              disabled={busy}
              onChange={(e) => setDraftFamilyId(e.target.value)}
              className="bg-white"
            >
              <option value="">— Brak —</option>
              {families.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.name}
                </option>
              ))}
            </Select>
          </label>

          {canOpenFamily ? (
            <Link
              to={`/product-families/${openFamilyId}/edit`}
              className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Otwórz rodzinę
            </Link>
          ) : null}

          {dirty ? (
            <PrimaryButton type="button" density="compact" disabled={busy} onClick={() => void onAttach()}>
              {busy ? "Zapisywanie…" : "Zapisz przypisanie"}
            </PrimaryButton>
          ) : null}
        </div>
      </section>

      {/* 2 — Podgląd rodziny (tylko po zapisanym przypisaniu) */}
      {family ? (
        <section className={pimPanelClass}>
          <div>
            <p className={pimFieldLabelClass}>Rodzina</p>
            <p className="text-base font-semibold text-slate-900">{family.name}</p>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className={pimStatTileClass}>
              <dt className="text-xs text-slate-500">Produkt bazowy</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold text-slate-900">{baseLabel}</dd>
            </div>
            <div className={pimStatTileClass}>
              <dt className="text-xs text-slate-500">Status</dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900">{statusLabel}</dd>
            </div>
            <div className={pimStatTileClass}>
              <dt className="text-xs text-slate-500">Produkty w rodzinie</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{productCount}</dd>
            </div>
            <div className={pimStatTileClass}>
              <dt className="text-xs text-slate-500">Kombinacje</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{combinationCount}</dd>
            </div>
            <div className={pimStatTileClass}>
              <dt className="text-xs text-slate-500">Brakujące</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-amber-700">{missingCount}</dd>
            </div>
          </dl>

          <div className="mt-4">
            <Link
              to={`/product-families/${family.id}/edit`}
              className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Otwórz rodzinę
            </Link>
          </div>
        </section>
      ) : null}

      {/* 3 — Cechy tego produktu */}
      {family ? (
        <section className={pimPanelClass}>
          <h2 className="text-sm font-semibold text-slate-900">Cechy tego produktu</h2>
          {productChips.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Rodzina nie ma zdefiniowanych cech.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {productChips.map((chip) => (
                <div
                  key={chip.key}
                  className="inline-flex max-w-full flex-col gap-0.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {chip.name}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900">
                    {chip.displayType === "color" ? (
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-slate-200"
                        style={{ backgroundColor: chip.colorHex || "#cbd5e1" }}
                        aria-hidden
                      />
                    ) : null}
                    {chip.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
