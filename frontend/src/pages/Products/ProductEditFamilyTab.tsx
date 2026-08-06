import { useCallback, useEffect, useState } from "react";
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
import { FamilyAttributesCard } from "./productFamily/FamilyAttributesCard";
import { FamilyGeneratorCard } from "./productFamily/FamilyGeneratorCard";
import { FamilyInfoCard } from "./productFamily/FamilyInfoCard";
import { FamilyMembersCard } from "./productFamily/FamilyMembersCard";

type Props = {
  tenantId: number;
  productId: number;
};

/**
 * Product edit → Rodzina: attach + info + attributes + members.
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

  return (
    <div className="space-y-4">
      <section className={pimPanelClass}>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white">
            <Network className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">Przypisanie do rodziny</h2>
            <p className={pimHintClass}>
              Zarządzanie odmianami produktu odbywa się wyłącznie w tej zakładce.
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
            Przypisz produkt do rodziny, aby zobaczyć cechy, członków, generator i powiązania.
          </p>
        </section>
      ) : (
        <>
          <FamilyInfoCard family={family} />
          <FamilyAttributesCard family={family} />
          <FamilyMembersCard
            tenantId={tenantId}
            members={family.members ?? []}
            currentProductId={productId}
          />
          <FamilyGeneratorCard
            tenantId={tenantId}
            familyId={family.id}
            members={family.members ?? []}
            onChanged={() => setRefreshKey((k) => k + 1)}
          />
        </>
      )}
    </div>
  );
}
