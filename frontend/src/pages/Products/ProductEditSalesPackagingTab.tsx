import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  createProductSalesPackaging,
  deleteProductSalesPackaging,
  listProductSalesPackaging,
  updateProductSalesPackaging,
  type ProductSalesPackagingDto,
} from "../../api/productSalesPackagingApi";
import { parseOptionalPct, ppwrStatusLabel } from "../../modules/warehouseMaterials/ppwrLabels";

type Props = {
  productId: number;
  tenantId: number;
};

type Draft = {
  name: string;
  level: "PRIMARY" | "SECONDARY";
  ppwr_format: string;
  material_category: string;
  mass_g: string;
  recyclable_pct: string;
  recycled_content_pct: string;
  is_reusable: boolean | null;
  is_active: boolean;
  sort_order: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  level: "PRIMARY",
  ppwr_format: "",
  material_category: "",
  mass_g: "",
  recyclable_pct: "",
  recycled_content_pct: "",
  is_reusable: null,
  is_active: true,
  sort_order: "0",
});

function draftFromRow(r: ProductSalesPackagingDto): Draft {
  return {
    name: r.name || "",
    level: r.level === "SECONDARY" ? "SECONDARY" : "PRIMARY",
    ppwr_format: r.ppwr_format || "",
    material_category: r.material_category || "",
    mass_g: r.mass_g != null ? String(r.mass_g) : "",
    recyclable_pct: r.recyclable_pct != null ? String(r.recyclable_pct) : "",
    recycled_content_pct: r.recycled_content_pct != null ? String(r.recycled_content_pct) : "",
    is_reusable: r.is_reusable ?? null,
    is_active: r.is_active !== false,
    sort_order: String(r.sort_order ?? 0),
  };
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/**
 * Product card section — sales packaging specs (PPWR SALES).
 * Not Product.carton_* logistics, not Carton catalog, not inventory.
 */
export function ProductEditSalesPackagingTab({ productId, tenantId }: Props) {
  const [rows, setRows] = useState<ProductSalesPackagingDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listProductSalesPackaging(productId, tenantId);
      setRows(list);
    } catch {
      toast.error("Nie udało się wczytać opakowań produktu");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [productId, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const buildBody = () => {
    const name = draft.name.trim();
    if (!name) return { err: "Nazwa jest wymagana" as const };
    const rec = parseOptionalPct(draft.recyclable_pct);
    if (rec === "invalid") return { err: "Recyklingowalność musi być 0–100" as const };
    const rcc = parseOptionalPct(draft.recycled_content_pct);
    if (rcc === "invalid") return { err: "Recycled content musi być 0–100" as const };
    const massRaw = draft.mass_g.trim();
    let mass_g: number | null = null;
    if (massRaw) {
      const m = Number(massRaw.replace(",", "."));
      if (!Number.isFinite(m) || m < 0) return { err: "Masa (g) musi być ≥ 0" as const };
      mass_g = m;
    }
    const sort = Number(draft.sort_order.replace(",", ".") || 0);
    return {
      err: null as null,
      body: {
        name,
        level: draft.level,
        ppwr_format: draft.ppwr_format.trim() || null,
        material_category: draft.material_category.trim() || null,
        mass_g,
        recyclable_pct: rec,
        recycled_content_pct: rcc,
        is_reusable: draft.is_reusable,
        is_active: draft.is_active,
        sort_order: Number.isFinite(sort) && sort >= 0 ? Math.floor(sort) : 0,
      },
    };
  };

  const onSave = async () => {
    const built = buildBody();
    if (built.err) {
      toast.error(built.err);
      return;
    }
    setBusy(true);
    try {
      if (creating) {
        await createProductSalesPackaging(productId, tenantId, built.body!);
        toast.success("Dodano opakowanie produktu");
      } else if (editingId) {
        await updateProductSalesPackaging(productId, editingId, tenantId, built.body!);
        toast.success("Zapisano opakowanie");
      }
      setCreating(false);
      setEditingId(null);
      setDraft(emptyDraft());
      await load();
    } catch (e: unknown) {
      const detail =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || "")
          : "";
      toast.error(detail || "Zapis nie powiódł się");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Usunąć to opakowanie produktu?")) return;
    setBusy(true);
    try {
      await deleteProductSalesPackaging(productId, id, tenantId);
      toast.success("Usunięto");
      if (editingId === id) {
        setEditingId(null);
        setDraft(emptyDraft());
      }
      await load();
    } catch {
      toast.error("Usuwanie nie powiodło się");
    } finally {
      setBusy(false);
    }
  };

  const formOpen = creating || editingId != null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Specyfikacja opakowania sprzedawanego z produktem (PPWR: SALES). To nie jest karton wysyłkowy ani{" "}
        <span className="font-medium">opakowanie zbiorcze producenta</span> (pola logistyczne na zakładce
        Podstawowe).
      </div>

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">Opakowanie produktu</h3>
        {!formOpen ? (
          <button
            type="button"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              setCreating(true);
              setEditingId(null);
              setDraft(emptyDraft());
            }}
          >
            Dodaj opakowanie
          </button>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

      {!loading && rows.length === 0 && !formOpen ? (
        <p className="text-sm text-slate-500">Brak zdefiniowanych opakowań sprzedażowych.</p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">{r.name}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {r.level} · {r.ppwr_format || "bez formatu"} · {ppwrStatusLabel(r.ppwr_status)}
                  {r.recyclable_pct != null ? ` · recykling ${r.recyclable_pct}%` : ""}
                </div>
              </div>
              <button
                type="button"
                className="text-sm font-medium text-blue-700 hover:underline"
                disabled={busy}
                onClick={() => {
                  setCreating(false);
                  setEditingId(r.id);
                  setDraft(draftFromRow(r));
                }}
              >
                Edytuj
              </button>
              <button
                type="button"
                className="text-sm font-medium text-red-600 hover:underline"
                disabled={busy}
                onClick={() => void onDelete(r.id)}
              >
                Usuń
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {formOpen ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-800">
            {creating ? "Nowe opakowanie" : "Edycja opakowania"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Nazwa</span>
              <input
                className={inputClass}
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Poziom</span>
              <select
                className={inputClass}
                value={draft.level}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    level: e.target.value === "SECONDARY" ? "SECONDARY" : "PRIMARY",
                  }))
                }
              >
                <option value="PRIMARY">PRIMARY</option>
                <option value="SECONDARY">SECONDARY</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Format PPWR</span>
              <input
                className={inputClass}
                value={draft.ppwr_format}
                onChange={(e) => setDraft((d) => ({ ...d, ppwr_format: e.target.value }))}
                placeholder="np. bottle, pouch, retail_box"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Materiał / kategoria</span>
              <input
                className={inputClass}
                value={draft.material_category}
                onChange={(e) => setDraft((d) => ({ ...d, material_category: e.target.value }))}
                placeholder="np. PET, papier, szkło"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Masa (g)</span>
              <input
                className={inputClass}
                value={draft.mass_g}
                onChange={(e) => setDraft((d) => ({ ...d, mass_g: e.target.value }))}
                inputMode="decimal"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Recyklingowalność %</span>
              <input
                className={inputClass}
                value={draft.recyclable_pct}
                onChange={(e) => setDraft((d) => ({ ...d, recyclable_pct: e.target.value }))}
                inputMode="decimal"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Recycled content %</span>
              <input
                className={inputClass}
                value={draft.recycled_content_pct}
                onChange={(e) => setDraft((d) => ({ ...d, recycled_content_pct: e.target.value }))}
                inputMode="decimal"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Kolejność</span>
              <input
                className={inputClass}
                value={draft.sort_order}
                onChange={(e) => setDraft((d) => ({ ...d, sort_order: e.target.value }))}
                inputMode="numeric"
              />
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-800">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={draft.is_reusable === true}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, is_reusable: e.target.checked ? true : null }))
                }
              />
              Wielokrotnego użytku
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-800">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={draft.is_active}
                onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
              />
              Aktywne
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={busy}
              onClick={() => void onSave()}
            >
              Zapisz
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              disabled={busy}
              onClick={() => {
                setCreating(false);
                setEditingId(null);
                setDraft(emptyDraft());
              }}
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
