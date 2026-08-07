import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Network } from "lucide-react";
import toast from "react-hot-toast";

import {
  attachProductFamily,
  getProductFamily,
  getProductFamilyState,
  listProductFamilies,
  type ProductFamily,
  type ProductFamilyListItem,
} from "../../api/productFamiliesApi";
import { extractApiErrorMessage } from "../../api/authApi";
import { PrimaryButton, Select } from "../../design-system";
import { pimFieldLabelClass, pimHintClass, pimPanelClass } from "../Assortment/pimUi";

type Props = {
  tenantId: number;
  productId: number;
};

/**
 * Product edit → Rodzina: membership only (family, status, base, this product's attributes).
 */
export function ProductEditFamilyTab({ tenantId, productId }: Props) {
  const [families, setFamilies] = useState<ProductFamilyListItem[]>([]);
  const [draftFamilyId, setDraftFamilyId] = useState("");
  const [family, setFamily] = useState<ProductFamily | null>(null);
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
      setDraftFamilyId(st.product_family_id != null ? String(st.product_family_id) : "");
      if (st.product_family_id != null) {
        setFamily(await getProductFamily(tenantId, st.product_family_id, { includeMembers: true }));
      } else {
        setFamily(null);
      }
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wczytać rodziny."));
      setFamily(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, productId]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const member = useMemo(
    () => family?.members?.find((m) => m.id === productId) ?? null,
    [family, productId],
  );

  const productAttributes = useMemo(() => {
    if (!family) return [];
    const attrs = [...(family.attributes ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
    );
    const parts = (member?.attribute_summary ?? "")
      .split(" / ")
      .map((s) => s.trim())
      .filter(Boolean);
    return attrs.map((attr, i) => ({
      id: attr.id,
      name: attr.name,
      value: parts[i] || "—",
    }));
  }, [family, member]);

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
    return <p className="text-sm text-slate-500">Ładowanie rodziny…</p>;
  }

  const statusLabel = !family
    ? "Poza rodziną"
    : member?.is_base
      ? "Produkt bazowy"
      : "Członek rodziny";

  return (
    <div className="space-y-4">
      <section className={pimPanelClass}>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white">
            <Network className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">Przynależność do rodziny</h2>
            <p className={pimHintClass}>
              Ta zakładka dotyczy wyłącznie przypisania produktu do rodziny i jego cech w rodzinie.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-[220px] flex-1">
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
              <PrimaryButton type="button" density="compact" disabled={busy} onClick={() => void onAttach()}>
                {busy ? "Zapisywanie…" : "Zapisz przypisanie"}
              </PrimaryButton>
              {family ? (
                <Link
                  to={`/product-families/${family.id}/edit`}
                  className="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Otwórz rodzinę
                </Link>
              ) : (
                <Link
                  to="/product-families"
                  className="inline-flex h-8 items-center text-sm font-medium text-blue-700 hover:underline"
                >
                  Lista rodzin
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {!family ? (
        <section className={pimPanelClass}>
          <p className="text-sm text-slate-500">
            Przypisz produkt do rodziny, aby zobaczyć status, produkt bazowy i cechy tego produktu.
          </p>
        </section>
      ) : (
        <section className={pimPanelClass}>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className={pimFieldLabelClass}>Wybrana rodzina</dt>
              <dd className="text-sm font-medium text-slate-900">{family.name}</dd>
            </div>
            <div>
              <dt className={pimFieldLabelClass}>Status w rodzinie</dt>
              <dd className="text-sm font-medium text-slate-900">{statusLabel}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className={pimFieldLabelClass}>Produkt bazowy</dt>
              <dd className="text-sm text-slate-800">
                {family.base_product_id != null ? (
                  member?.is_base ? (
                    <span>Ten produkt jest produktem bazowym rodziny.</span>
                  ) : (
                    <span>
                      {family.base_product_name?.trim() || `Produkt #${family.base_product_id}`}
                      <span className="ml-1 text-slate-400">#{family.base_product_id}</span>
                    </span>
                  )
                ) : (
                  <span className="text-slate-500">Brak produktu bazowego</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Cechy przypisane do produktu</h3>
            {productAttributes.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Rodzina nie ma zdefiniowanych cech.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {productAttributes.map((attr) => (
                  <li
                    key={attr.id ?? attr.name}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <span className="font-medium text-slate-700">{attr.name}</span>
                    <span className="font-mono text-xs text-slate-900">{attr.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
