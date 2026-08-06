import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Network } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import {
  attachProductFamily,
  getProductFamilyState,
  listProductFamilies,
  type ProductFamilyListItem,
  type ProductFamilyProductState,
} from "../../api/productFamiliesApi";
import { extractApiErrorMessage } from "../../api/authApi";
import { GhostButton, PrimaryButton, Select } from "../../design-system";

type Props = {
  productId: number;
  tenantId: number;
};

/**
 * Product card → Podstawowe: Rodzina produktów block (optional membership).
 */
export function ProductEditFamilySection({ productId, tenantId }: Props) {
  const [state, setState] = useState<ProductFamilyProductState | null>(null);
  const [families, setFamilies] = useState<ProductFamilyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draftFamilyId, setDraftFamilyId] = useState<string>("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [st, list] = await Promise.all([
        getProductFamilyState(tenantId, productId),
        listProductFamilies(tenantId, { includeInactive: false }),
      ]);
      setState(st);
      setFamilies(list);
      setDraftFamilyId(st.product_family_id != null ? String(st.product_family_id) : "");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wczytać rodziny produktu."));
    } finally {
      setLoading(false);
    }
  }, [tenantId, productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onAttach = async (familyId: number | null) => {
    setBusy(true);
    try {
      const st = await attachProductFamily(tenantId, productId, familyId);
      setState(st);
      setDraftFamilyId(st.product_family_id != null ? String(st.product_family_id) : "");
      toast.success(familyId == null ? "Odłączono od rodziny." : "Przypisano do rodziny.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się zmienić rodziny."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="mt-8 max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">Ładowanie rodziny…</p>
      </section>
    );
  }

  const family = state?.family ?? null;
  const count = state?.family_product_count ?? 0;

  return (
    <section className="mt-8 max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Network className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">Rodzina produktów</h2>
          {!family ? (
            <p className="mt-1 text-sm text-slate-600">Brak</p>
          ) : (
            <div className="mt-1 space-y-1 text-sm text-slate-700">
              <p>
                Rodzina: <span className="font-medium text-slate-900">{family.name}</span>
              </p>
              <p className="text-slate-500">
                Produkty w rodzinie: {count}
              </p>
              <Link
                to={`/product-families/${family.id}/edit`}
                className="inline-flex items-center gap-1 text-blue-700 hover:underline"
              >
                Otwórz rodzinę
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
        <label className="min-w-[220px] flex-1">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {family ? "Zmień rodzinę" : "Dołącz do rodziny"}
          </span>
          <Select
            value={draftFamilyId}
            disabled={busy}
            onChange={(e) => setDraftFamilyId(e.target.value)}
          >
            <option value="">— Brak —</option>
            {families.map((f) => (
              <option key={f.id} value={String(f.id)}>
                {f.name}
              </option>
            ))}
          </Select>
        </label>
        <PrimaryButton
          type="button"
          density="compact"
          disabled={busy}
          onClick={() => {
            const next = draftFamilyId.trim() ? Number(draftFamilyId) : null;
            const current = state?.product_family_id ?? null;
            if (next === current) {
              toast("Bez zmian.");
              return;
            }
            void onAttach(next != null && Number.isFinite(next) ? next : null);
          }}
        >
          Zapisz
        </PrimaryButton>
        {family ? (
          <GhostButton type="button" density="compact" disabled={busy} onClick={() => void onAttach(null)}>
            Odłącz
          </GhostButton>
        ) : (
          <Link
            to="/product-families/new"
            className="inline-flex h-9 items-center px-2 text-sm text-blue-700 hover:underline"
          >
            Utwórz rodzinę
          </Link>
        )}
      </div>
    </section>
  );
}
