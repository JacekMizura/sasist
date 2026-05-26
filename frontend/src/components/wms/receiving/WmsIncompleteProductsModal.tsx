import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, Loader2, Pencil, X } from "lucide-react";
import { listIncompleteReceivingProducts, type WmsProductIncompleteRow } from "../../../api/wmsProductApi";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import { ProductDataCompletionModal } from "./ProductDataCompletionModal";

const TENANT_STORAGE_KEY = "wms.receiving.tenantId";

/** Display order and labels for grouping products by missing data category. */
const MISSING_CATEGORY_ORDER: { match: (label: string) => boolean; title: string }[] = [
  { match: (l) => l.includes("wymiar"), title: "Wymiary" },
  { match: (l) => l.includes("wagi"), title: "Waga" },
  { match: (l) => l.toLowerCase().includes("ean"), title: "EAN opakowania zbiorczego" },
  { match: (l) => l.includes("karton") || l.includes("zbiorcz"), title: "Opakowanie zbiorcze" },
];

function categoryForLabel(label: string): string {
  const hit = MISSING_CATEGORY_ORDER.find((c) => c.match(label));
  return hit?.title ?? label;
}

function groupRowsByMissingCategory(rows: WmsProductIncompleteRow[]): { title: string; products: WmsProductIncompleteRow[] }[] {
  const map = new Map<string, WmsProductIncompleteRow[]>();
  for (const row of rows) {
    const labels = row.missing_labels?.length ? row.missing_labels : ["Brakujące dane"];
    const seen = new Set<string>();
    for (const raw of labels) {
      const title = categoryForLabel(raw);
      if (seen.has(title)) continue;
      seen.add(title);
      const list = map.get(title) ?? [];
      if (!list.some((p) => p.product_id === row.product_id)) list.push(row);
      map.set(title, list);
    }
  }
  const ordered: { title: string; products: WmsProductIncompleteRow[] }[] = [];
  for (const cat of MISSING_CATEGORY_ORDER) {
    const products = map.get(cat.title);
    if (products?.length) {
      ordered.push({ title: cat.title, products });
      map.delete(cat.title);
    }
  }
  for (const [title, products] of map) {
    if (products.length) ordered.push({ title, products });
  }
  return ordered;
}

export type WmsIncompleteProductsModalProps = {
  open: boolean;
  onClose: () => void;
  tenantId?: number;
  warehouseId?: number | null;
};

export function WmsIncompleteProductsModal({
  open,
  onClose,
  tenantId: tenantIdProp,
  warehouseId,
}: WmsIncompleteProductsModalProps) {
  const [tenantId, setTenantId] = useState(tenantIdProp ?? 1);
  const [rows, setRows] = useState<WmsProductIncompleteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [quickEdit, setQuickEdit] = useState<WmsProductIncompleteRow | null>(null);

  useEffect(() => {
    if (tenantIdProp != null) setTenantId(tenantIdProp);
  }, [tenantIdProp]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listIncompleteReceivingProducts(tenantId, {
        warehouseId: warehouseId ?? undefined,
        limit: 300,
      });
      setRows(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === "number" ? data.total : data.items?.length ?? 0);
    } catch {
      setRows([]);
      setTotal(0);
      setErr("Nie udało się wczytać listy produktów.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    if (!open) return;
    if (tenantIdProp == null) {
      const saved = Number(localStorage.getItem(TENANT_STORAGE_KEY));
      if (Number.isFinite(saved) && saved >= 1) setTenantId(saved);
    }
    void load();
  }, [open, load, tenantIdProp]);

  const grouped = useMemo(() => groupRowsByMissingCategory(rows), [rows]);
  const countLabel = total > 0 ? ` (${total})` : "";

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
        <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-900">Produkty z brakującymi danymi{countLabel}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Tylko produkty z włączonymi wymaganiami WMS i nieuzupełnionymi polami
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Zamknij"
            >
              <X size={20} />
            </button>
            </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-500">
                <Loader2 className="animate-spin" size={28} aria-hidden />
                <p className="text-sm font-medium">Ładowanie listy…</p>
              </div>
            ) : err ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{err}</p>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                <p className="text-sm font-bold text-emerald-900">Brak produktów z nieuzupełnionymi wymaganymi danymi.</p>
                <p className="mt-1 text-xs text-emerald-800/90">Wszystkie aktywne wymagania WMS są spełnione.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {grouped.map((section) => (
                  <section key={section.title}>
                    <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{section.title}</h3>
                    <ul className="space-y-2">
                      {section.products.map((r) => (
                        <li key={`${section.title}-${r.product_id}`}>
                          <Link
                            to={WMS_ROUTES.productPreview(r.product_id)}
                            onClick={onClose}
                            className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"
                          >
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white">
                              {r.image_url ? (
                                <img src={r.image_url} alt="" className="max-h-full max-w-full object-contain" />
                              ) : (
                                <AlertTriangle className="text-amber-500" size={18} />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-sm font-bold text-slate-900">
                                {r.product_name || `Produkt #${r.product_id}`}
                              </p>
                              {(r.product_sku || r.product_ean) && (
                                <p className="mt-0.5 font-mono text-[11px] text-slate-600">
                                  {r.product_sku ? <span>SKU {r.product_sku}</span> : null}
                                  {r.product_sku && r.product_ean ? <span className="text-slate-300"> · </span> : null}
                                  {r.product_ean ? <span>EAN {r.product_ean}</span> : null}
                                </p>
                              )}
                              <p className="mt-1 text-xs text-slate-600">
                                <span className="font-semibold text-slate-500">Brakuje:</span>
                                <ul className="mt-0.5 list-inside list-disc space-y-0.5">
                                  {(r.missing_labels ?? []).map((lbl) => (
                                    <li key={lbl}>{lbl}</li>
                                  ))}
                                </ul>
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end justify-center gap-1.5 self-center">
                              <ChevronRight className="text-slate-400" size={18} aria-hidden />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setQuickEdit(r);
                                }}
                                className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-2.5 py-1.5 text-[10px] font-black uppercase text-white hover:bg-indigo-700"
                              >
                                <Pencil size={12} />
                                Uzupełnij
                              </button>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {quickEdit ? (
        <ProductDataCompletionModal
          open
          tenantId={tenantId}
          productId={quickEdit.product_id}
          productName={quickEdit.product_name}
          productEan={quickEdit.product_ean}
          imageUrl={quickEdit.image_url ?? undefined}
          missingLabels={quickEdit.missing_labels}
          forceAllFields={quickEdit.force_wms_completion}
          onSkip={() => {
            setQuickEdit(null);
            void load();
          }}
          onSaved={() => {
            setQuickEdit(null);
            void load();
          }}
        />
      ) : null}
    </>
  );
}
