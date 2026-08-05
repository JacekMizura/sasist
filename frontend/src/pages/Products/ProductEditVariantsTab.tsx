import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Layers, Link2, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import {
  attachProductVariantGroup,
  deleteProductVariantSku,
  generateProductVariants,
  getProductVariants,
  listVariantGroups,
  patchProductVariantSku,
  type ProductVariantSku,
  type ProductVariantsState,
  type VariantGroupListItem,
} from "../../api/productVariantsApi";
import { extractApiErrorMessage } from "../../api/authApi";
import { getProductDetailsPath } from "./productPaths";
import { GhostButton, Input, PrimaryButton, Select } from "../../design-system";

type Props = {
  productId: number;
  tenantId: number;
};

/**
 * Product card → Warianty: attach group, generate missing SKUs, inline edit identifiers.
 * Clearer than Sellasist: no marketplace clutter, explicit combination counters, child SKUs as real products.
 */
export function ProductEditVariantsTab({ productId, tenantId }: Props) {
  const [state, setState] = useState<ProductVariantsState | null>(null);
  const [groups, setGroups] = useState<VariantGroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, Partial<ProductVariantSku>>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [st, gs] = await Promise.all([
        getProductVariants(tenantId, productId),
        listVariantGroups(tenantId, { includeInactive: false }),
      ]);
      setState(st);
      setGroups(gs);
      setDrafts({});
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wczytać wariantów."));
    } finally {
      setLoading(false);
    }
  }, [tenantId, productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onAttach = async (groupId: number | null) => {
    setBusy(true);
    try {
      const st = await attachProductVariantGroup(tenantId, productId, groupId);
      setState(st);
      toast.success(groupId == null ? "Odłączono grupę wariantów." : "Przypisano grupę wariantów.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się przypisać grupy."));
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = async () => {
    if (!state?.missing_combinations) {
      toast("Wszystkie kombinacje już istnieją.");
      return;
    }
    if (
      !window.confirm(
        `Utworzyć ${state.missing_combinations} brakujących SKU wariantów?\nKażdy wariant to osobny produkt magazynowy (ukryty na liście asortymentu).`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await generateProductVariants(tenantId, productId, true);
      toast.success(`Utworzono ${res.created_count} SKU.`);
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Generowanie nie powiodło się."));
    } finally {
      setBusy(false);
    }
  };

  const draftOf = (sku: ProductVariantSku) => drafts[sku.id] ?? {};

  const setDraft = (id: number, patch: Partial<ProductVariantSku>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const onSaveSku = async (sku: ProductVariantSku) => {
    const d = draftOf(sku);
    setBusy(true);
    try {
      await patchProductVariantSku(tenantId, productId, sku.id, {
        name: d.name ?? sku.name,
        sku: d.sku !== undefined ? d.sku : sku.sku,
        ean: d.ean !== undefined ? d.ean : sku.ean,
        sale_price: d.sale_price !== undefined ? d.sale_price : sku.sale_price,
      });
      toast.success("Zapisano SKU.");
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Zapis SKU nie powiódł się."));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteSku = async (sku: ProductVariantSku) => {
    if (!window.confirm(`Usunąć wariant „${sku.name}”?`)) return;
    setBusy(true);
    try {
      await deleteProductVariantSku(tenantId, productId, sku.id);
      toast.success("Usunięto wariant.");
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Usuwanie nie powiodło się."));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !state) {
    return <p className="text-sm text-slate-500">Ładowanie wariantów…</p>;
  }

  if (state.is_variant_child) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        To jest SKU wariantu produktu{" "}
        {state.parent_product_id != null ? (
          <Link
            to={getProductDetailsPath(state.parent_product_id)}
            className="font-semibold text-blue-700 hover:underline"
          >
            {state.parent_product_name ?? `#${state.parent_product_id}`}
          </Link>
        ) : (
          "nadrzędnego"
        )}
        . Zarządzaj kombinacjami na karcie produktu nadrzędnego.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Layers className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden />
              Grupa wariantów
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Szablon osi i wartości z Asortyment → Warianty. Potem wygeneruj brakujące SKU jednym kliknięciem.
            </p>
          </div>
          <Link to="/variants/new" className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            Nowa grupa
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Przypisana grupa
            </span>
            <Select
              value={state.variant_group_id ?? ""}
              disabled={busy}
              onChange={(e) => {
                const raw = e.target.value;
                void onAttach(raw === "" ? null : Number(raw));
              }}
            >
              <option value="">— bez wariantów —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.combination_count} komb.)
                </option>
              ))}
            </Select>
          </label>
          {state.variant_group_id != null ? (
            <Link
              to={`/variants/${state.variant_group_id}/edit`}
              className="inline-flex items-center gap-1 pb-2 text-sm text-slate-600 hover:text-blue-700"
            >
              <Link2 className="h-4 w-4" aria-hidden />
              Edytuj szablon
            </Link>
          ) : null}
        </div>

        {state.group ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {state.group.axes.map((ax) => (
              <div key={ax.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <span className="font-semibold text-slate-900">{ax.name}</span>
                <span className="text-slate-400"> · </span>
                {(ax.values || []).map((v) => v.name).join(", ") || "brak wartości"}
              </div>
            ))}
          </div>
        ) : null}

        {state.variant_group_id != null ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{state.skus.length}</span> /{" "}
              {state.possible_combinations} SKU · brakuje{" "}
              <span className="font-semibold text-slate-900">{state.missing_combinations}</span>
            </p>
            <PrimaryButton
              type="button"
              density="compact"
              disabled={busy || state.missing_combinations < 1}
              onClick={() => void onGenerate()}
            >
              Generuj brakujące ({state.missing_combinations})
            </PrimaryButton>
          </div>
        ) : null}
      </section>

      {state.skus.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-900">SKU wariantów</h3>
            <p className="text-xs text-slate-500">Każdy wiersz to osobny produkt (stan, EAN, cena). Ukryty na liście asortymentu.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Cechy</th>
                  <th className="px-4 py-2 font-semibold">Nazwa</th>
                  <th className="px-4 py-2 font-semibold">SKU</th>
                  <th className="px-4 py-2 font-semibold">EAN</th>
                  <th className="px-4 py-2 font-semibold">Cena</th>
                  <th className="px-4 py-2 font-semibold">Stan</th>
                  <th className="px-4 py-2 font-semibold">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {state.skus.map((sku) => {
                  const d = draftOf(sku);
                  return (
                    <tr key={sku.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-2 text-xs text-slate-600">
                        {sku.values.map((v) => (
                          <div key={v.value_id}>
                            <span className="text-slate-400">{v.axis_name}:</span> {v.value_name}
                          </div>
                        ))}
                        <div className="mt-1 text-[11px] text-slate-400">#{sku.id}</div>
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={d.name ?? sku.name}
                          onChange={(e) => setDraft(sku.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={d.sku ?? sku.sku ?? ""}
                          onChange={(e) => setDraft(sku.id, { sku: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={d.ean ?? sku.ean ?? ""}
                          onChange={(e) => setDraft(sku.id, { ean: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={d.sale_price ?? sku.sale_price ?? ""}
                          onChange={(e) =>
                            setDraft(sku.id, {
                              sale_price: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className="w-28"
                        />
                      </td>
                      <td className="px-4 py-2 tabular-nums text-slate-700">{sku.stock_quantity}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          <GhostButton type="button" density="compact" disabled={busy} onClick={() => void onSaveSku(sku)}>
                            Zapisz
                          </GhostButton>
                          <Link
                            to={getProductDetailsPath(sku.id)}
                            className="inline-flex items-center rounded px-2 py-1 text-slate-600 hover:bg-slate-50 hover:text-blue-700"
                            title="Otwórz kartę SKU"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                          <GhostButton type="button" density="compact" disabled={busy} onClick={() => void onDeleteSku(sku)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </GhostButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : state.variant_group_id != null ? (
        <p className="text-sm text-slate-500">Brak wygenerowanych SKU — użyj „Generuj brakujące”.</p>
      ) : null}
    </div>
  );
}
