import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { AlertTriangle, ChevronDown, RefreshCw, ShoppingCart } from "lucide-react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";

import {
  addShortageToPurchaseOrder,
  createPurchaseRequisitionFromShortage,
  fetchMaterialNeeds,
  fetchMaterialSubstitutes,
  fetchProductionShortagesQueue,
  type MaterialSubstitute,
  type ProductionMaterialNeed,
  type ProductionShortageQueueRow,
  type ShortageDemandSource,
} from "@/api/productionShortageApi";
import { listPurchaseOrders, type PurchaseOrderListRow } from "@/api/purchasingOrdersApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { useWarehouse } from "@/context/WarehouseContext";
import { PrimaryButton } from "@/design-system/PrimaryButton";
import { PageHeader, SecondaryButton } from "@/design-system";
import { ProductThumb } from "./components/ProductThumb";
import { MaterialSubstitutesFormPanel } from "./components/MaterialSubstitutesFormPanel";
import { MaterialNeedsPanel } from "./components/MaterialNeedsPanel";
import { erpProductionPaths } from "./productionPaths";
import {
  coveredQtyFromStock,
  filterShortageQueueRows,
  isTrueMaterialShortage,
} from "./productionShortageDisplay";
import {
  productionModuleListTdClass,
  productionModuleListThClass,
  productionPageStackClass,
  productionPageTitleClass,
} from "./productionLayoutTokens";
import { ProductionEmptyState } from "./components/ProductionEmptyState";
import { AppOverlayPortal } from "../../components/overlay";
import { BATCH_STATUS_LABEL, PRODUCTION_STATUS_LABEL } from "./productionUi";

const DEFAULT_TENANT = 1;

function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function sourceStatusLabel(src: ShortageDemandSource): string {
  const raw = String(src.status || "").toLowerCase();
  if (src.kind === "batch") {
    return BATCH_STATUS_LABEL[raw as keyof typeof BATCH_STATUS_LABEL] ?? src.status ?? "—";
  }
  return PRODUCTION_STATUS_LABEL[raw as keyof typeof PRODUCTION_STATUS_LABEL] ?? src.status ?? "—";
}

function sourceHref(src: ShortageDemandSource): string {
  return src.kind === "batch" ? erpProductionPaths.batch(src.id) : erpProductionPaths.order(src.id);
}

export default function ProductionShortagesPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;

  const [rows, setRows] = useState<ProductionShortageQueueRow[]>([]);
  const [substitutes, setSubstitutes] = useState<MaterialSubstitute[]>([]);
  const [materialNeeds, setMaterialNeeds] = useState<ProductionMaterialNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSubstitutes, setShowSubstitutes] = useState(false);
  const [showNeeds, setShowNeeds] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [poPickerFor, setPoPickerFor] = useState<ProductionShortageQueueRow | null>(null);
  const [openPos, setOpenPos] = useState<PurchaseOrderListRow[]>([]);
  const [poLoading, setPoLoading] = useState(false);

  const load = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    try {
      const [queue, subs, needs] = await Promise.all([
        fetchProductionShortagesQueue(tenantId, warehouseId),
        fetchMaterialSubstitutes(tenantId),
        fetchMaterialNeeds(tenantId, warehouseId),
      ]);
      setRows(filterShortageQueueRows(queue));
      setSubstitutes(subs);
      setMaterialNeeds(needs);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się wczytać braków produkcyjnych."));
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = useMemo(() => filterShortageQueueRows(rows), [rows]);

  const createRequisition = async (row: ProductionShortageQueueRow) => {
    if (warehouseId == null) return;
    try {
      const result = await createPurchaseRequisitionFromShortage(tenantId, warehouseId, {
        component_product_id: row.component_product_id,
        quantity: row.missing_qty,
      });
      toast.success(`Utworzono zapotrzebowanie ${result.order_number}`);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się utworzyć zapotrzebowania."));
    }
  };

  const openPoPicker = async (row: ProductionShortageQueueRow) => {
    setPoPickerFor(row);
    setPoLoading(true);
    try {
      const { rows: pos } = await listPurchaseOrders({
        tenant_id: tenantId,
        status: "Draft",
        page: 1,
        page_size: 50,
      });
      setOpenPos(pos);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się wczytać zamówień zakupu."));
      setPoPickerFor(null);
    } finally {
      setPoLoading(false);
    }
  };

  const addToPo = async (poId: number) => {
    if (!poPickerFor || warehouseId == null) return;
    try {
      const result = await addShortageToPurchaseOrder(tenantId, warehouseId, {
        purchase_order_id: poId,
        component_product_id: poPickerFor.component_product_id,
        quantity: poPickerFor.missing_qty,
      });
      toast.success(`Dodano do ${result.order_number}`);
      setPoPickerFor(null);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się dodać do zamówienia."));
    }
  };

  if (warehouseId == null) {
    return <p className="px-4 py-6 text-sm text-slate-500">Wybierz magazyn.</p>;
  }

  return (
    <div className={productionPageStackClass}>
      <PageHeader
        title={<h1 className={productionPageTitleClass}>Braki materiałów</h1>}
        actions={
          <SecondaryButton
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Odśwież
          </SecondaryButton>
        }
      >
        <div className="space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">Wczytywanie…</p>
          ) : visibleRows.length === 0 ? (
            <ProductionEmptyState
              icon={AlertTriangle}
              title="Brak aktywnych braków produkcyjnych"
              description="Wszystkie partie i zlecenia mają wystarczające materiały."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className={productionModuleListThClass} />
                    <th className={productionModuleListThClass}>Produkt końcowy</th>
                    <th className={productionModuleListThClass}>Składnik</th>
                    <th className={`${productionModuleListThClass} text-right`}>Potrzebne</th>
                    <th className={`${productionModuleListThClass} text-right`}>Dostępne</th>
                    <th className={`${productionModuleListThClass} text-right`}>Zarezerwowane</th>
                    <th className={`${productionModuleListThClass} text-right`}>Brak</th>
                    <th className={`${productionModuleListThClass} text-right`}>Po pokryciu</th>
                    <th className={productionModuleListThClass}>Źródła zapotrzebowania</th>
                    <th className={productionModuleListThClass}>Lokalizacje</th>
                    <th className={productionModuleListThClass}>Zakupy</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const expanded = expandedId === r.component_product_id;
                    const covered =
                      r.covered_qty != null
                        ? Number(r.covered_qty)
                        : coveredQtyFromStock(r.required_qty, r.available_qty);
                    const missing = Number(r.missing_qty ?? 0);
                    const showShortageTone = isTrueMaterialShortage(missing);
                    const sources = r.demand_sources?.length
                      ? r.demand_sources
                      : [];
                    const sourceSummary =
                      sources.length > 0
                        ? `${sources.length} ${sources.length === 1 ? "źródło" : "źródeł"}`
                        : `${r.blocked_batches_count} BAT · ${r.blocked_orders_count} MO`;
                    return (
                      <Fragment key={r.component_product_id}>
                        <tr className="border-t border-slate-100 align-top">
                          <td className={productionModuleListTdClass}>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                              aria-expanded={expanded}
                              aria-label={expanded ? "Zwiń źródła" : "Rozwiń źródła"}
                              onClick={() =>
                                setExpandedId(expanded ? null : r.component_product_id)
                              }
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                                aria-hidden
                              />
                            </button>
                          </td>
                          <td className={`${productionModuleListTdClass} text-xs`}>
                            {(r.finished_products ?? []).slice(0, 2).map((fp, i) => (
                              <div key={i} className="flex items-center gap-1 py-0.5">
                                <ProductThumb imageUrl={fp.product_image_url} name={fp.product_name} size="sm" />
                                <span>{fp.product_name}</span>
                              </div>
                            ))}
                            {(r.finished_products?.length ?? 0) > 2 ? (
                              <span className="text-slate-400">+{(r.finished_products?.length ?? 0) - 2}</span>
                            ) : null}
                          </td>
                          <td className={productionModuleListTdClass}>
                            <div className="flex items-center gap-2">
                              <ProductThumb imageUrl={r.product_image_url} name={r.product_name} size="sm" />
                              <div>
                                <p className="font-medium text-slate-900">{r.product_name}</p>
                                {r.product_sku ? (
                                  <p className="font-mono text-xs text-slate-500">{r.product_sku}</p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className={`${productionModuleListTdClass} text-right tabular-nums`}>
                            {fmtQty(r.required_qty)}
                          </td>
                          <td className={`${productionModuleListTdClass} text-right tabular-nums`}>
                            {fmtQty(r.available_qty)}
                          </td>
                          <td className={`${productionModuleListTdClass} text-right tabular-nums`}>
                            {fmtQty(r.reserved_qty)}
                          </td>
                          <td
                            className={`${productionModuleListTdClass} text-right tabular-nums font-bold ${
                              showShortageTone ? "text-rose-700" : "text-slate-700"
                            }`}
                          >
                            {fmtQty(missing)}
                          </td>
                          <td className={`${productionModuleListTdClass} text-right tabular-nums text-emerald-800`}>
                            {fmtQty(covered)}
                          </td>
                          <td className={`${productionModuleListTdClass} text-xs text-slate-600`}>
                            {sourceSummary}
                          </td>
                          <td className={productionModuleListTdClass}>
                            <div className="flex flex-wrap gap-1">
                              {r.locations.length ? (
                                r.locations.map((loc) => (
                                  <span key={loc.location_id} className="inline-flex items-center gap-1 text-xs">
                                    <LocationBadge code={loc.location_code} type="PICK" />
                                    <span className="tabular-nums text-slate-600">{loc.available_qty}</span>
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-500">—</span>
                              )}
                            </div>
                          </td>
                          <td className={productionModuleListTdClass}>
                            <div className="flex flex-col gap-1.5">
                              <PrimaryButton type="button" onClick={() => void createRequisition(r)}>
                                <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                                Zapotrzebowanie
                              </PrimaryButton>
                              <button
                                type="button"
                                onClick={() => void openPoPicker(r)}
                                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Dodaj do PO
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="border-t border-slate-100 bg-slate-50/70">
                            <td colSpan={11} className="px-3 py-3">
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                Źródła zapotrzebowania
                              </p>
                              {sources.length === 0 ? (
                                <p className="text-xs text-slate-500">Brak szczegółów źródeł w API.</p>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                  <table className="min-w-full text-xs">
                                    <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                                      <tr>
                                        <th className="px-2 py-1.5">Typ</th>
                                        <th className="px-2 py-1.5">Numer</th>
                                        <th className="px-2 py-1.5">Produkt końcowy</th>
                                        <th className="px-2 py-1.5 text-right">Zapotrzebowanie</th>
                                        <th className="px-2 py-1.5">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sources.map((s) => (
                                        <tr key={`${s.kind}-${s.id}`} className="border-t border-slate-100">
                                          <td className="px-2 py-1.5 font-semibold text-slate-700">
                                            {s.kind === "batch" ? "BAT" : "MO"}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            <Link
                                              to={sourceHref(s)}
                                              className="font-mono font-semibold text-violet-700 hover:underline"
                                            >
                                              {s.number}
                                            </Link>
                                          </td>
                                          <td className="px-2 py-1.5 text-slate-800">{s.product_name || "—"}</td>
                                          <td className="px-2 py-1.5 text-right tabular-nums">
                                            {fmtQty(s.required_qty)}
                                          </td>
                                          <td className="px-2 py-1.5 text-slate-600">{sourceStatusLabel(s)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Zapotrzebowania materiałowe</h2>
                <p className="text-sm text-slate-500">
                  Status po przyjęciu na magazyn — otwarte, częściowo pokryte lub zamknięte.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNeeds((v) => !v)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {showNeeds ? "Ukryj" : "Pokaż"}
              </button>
            </div>
            {showNeeds ? (
              <div className="mt-4">
                <MaterialNeedsPanel rows={materialNeeds} />
              </div>
            ) : materialNeeds.length > 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                {materialNeeds.filter((n) => n.status === "fulfilled").length} zamkniętych ·{" "}
                {materialNeeds.filter((n) => n.status === "partial").length} częściowo pokrytych ·{" "}
                {materialNeeds.filter((n) => ["open", "linked"].includes(n.status)).length} otwartych
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Zamienniki materiałów</h2>
                <p className="text-sm text-slate-500">
                  Priorytet, współczynnik zamiany i aktywność — propozycje w planowaniu.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSubstitutes((v) => !v)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {showSubstitutes ? "Ukryj" : "Zarządzaj"}
              </button>
            </div>
            {showSubstitutes ? (
              <MaterialSubstitutesFormPanel tenantId={tenantId} rows={substitutes} onChanged={() => void load()} />
            ) : substitutes.length > 0 ? (
              <p className="mt-3 text-sm text-slate-600">Zdefiniowano {substitutes.length} zamienników.</p>
            ) : null}
          </section>

          <p className="text-xs text-slate-500">
            Powiązane partie:{" "}
            <Link to={erpProductionPaths.planning} className="font-semibold text-violet-700 hover:underline">
              Planowanie
            </Link>
            {" · "}
            <Link to={erpProductionPaths.orders} className="font-semibold text-violet-700 hover:underline">
              Zlecenia
            </Link>
          </p>
        </div>
      </PageHeader>

      {poPickerFor ? (
        <AppOverlayPortal>
          <div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
                Dodaj do zamówienia zakupu
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {poPickerFor.product_name} · brak {poPickerFor.missing_qty}
              </p>
              {poLoading ? (
                <p className="mt-4 text-sm text-slate-500">Wczytywanie zamówień…</p>
              ) : openPos.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  Brak otwartych zamówień (Draft). Utwórz zapotrzebowanie.
                </p>
              ) : (
                <ul className="mt-4 max-h-60 space-y-2 overflow-y-auto">
                  {openPos.map((po) => (
                    <li key={po.id}>
                      <button
                        type="button"
                        onClick={() => void addToPo(po.id)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-violet-300 hover:bg-violet-50"
                      >
                        <span className="font-mono font-semibold">{po.order_number}</span>
                        <span className="ml-2 text-slate-500">{po.supplier_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setPoPickerFor(null)}
                className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Anuluj
              </button>
            </div>
          </div>
        </AppOverlayPortal>
      ) : null}
    </div>
  );
}
