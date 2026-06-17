import { memo, useCallback, useEffect, useState } from "react";
import {
  AlertOctagon,
  ArrowRight,
  Banknote,
  Bell,
  Clock,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  fetchPurchasingDashboard,
  type PurchasingDashboardPayload,
} from "../../../api/purchasingDashboardApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import { usePurchasingTenant } from "../hooks/usePurchasingTenant";
import {
  PurchasingContentArea,
  PurchasingKpiCard,
  PurchasingKpiGrid,
  PurchasingPageHeader,
  PurchasingPageShell,
  PurchasingQuickActions,
  PurchasingStatusBadge,
  PurchasingTableHeader,
  PurchasingTableSection,
} from "../ui";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function fmtMoney(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PlanningDashboardInner() {
  const { selectedWarehouseId } = useWarehouse();
  const { tenantId, refreshSignal } = usePurchasingTenant();
  const [data, setData] = useState<PurchasingDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const payload = await fetchPurchasingDashboard({
        tenant_id: tenantId,
        warehouse_id: selectedWarehouseId,
      });
      setData(payload);
    } catch {
      setErr("Nie udało się wczytać pulpitu zakupów.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedWarehouseId]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const td = "px-4 py-3 text-sm text-slate-800 sm:px-6 sm:py-4";
  const tenantQ = `?tenant_id=${tenantId}`;
  const genHref = `/purchasing/replenishment${tenantQ}`;
  const alertsHref = `/purchasing/alerts${tenantQ}`;
  const ordersHref = `/purchasing/orders${tenantQ}`;
  const suppliersHref = `/purchasing/suppliers/analytics${tenantQ}`;

  return (
    <PurchasingContentArea>
      <PurchasingPageShell
        header={
          <PurchasingPageHeader
            title="Pulpit zakupów"
            subtitle="Podsumowanie stanów, sugestii i otwartych dostaw — punkt startowy operacji zakupowych."
          />
        }
        quickActions={
          <PurchasingQuickActions
            actions={[
              {
                label: "Generator propozycji",
                to: genHref,
                description: "Sugestie uzupełnień i tworzenie PO",
                variant: "primary",
              },
              {
                label: "Alerty",
                to: alertsHref,
                description: "Problemy wymagające uwagi",
              },
              {
                label: "Zamówienia zakupowe",
                to: ordersHref,
                description: "Lista PO i szkiców",
              },
            ]}
            trailing={
              <Link to={alertsHref} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-orange-600">
                <Bell className="h-3.5 w-3.5" aria-hidden />
                Przejdź do alertów
              </Link>
            }
          />
        }
        status={
          err ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</p>
          ) : loading ? (
            <p className="text-sm text-slate-500">Ładowanie danych…</p>
          ) : null
        }
        kpis={
          data ? (
            <PurchasingKpiGrid columns={6}>
              <PurchasingKpiCard
                title="Produkty krytyczne"
                value={data.kpis.critical_products}
                subtitle="Stan ≤ 0 lub poniżej progu min. stanu"
                tone="red"
                icon={<AlertOctagon className="h-6 w-6 text-red-500" />}
                to={genHref}
              />
              <PurchasingKpiCard
                title="Braki w 7 dni"
                value={data.kpis.out_of_stock_in_7_days}
                subtitle="Przy obecnym zużyciu: pokrycie 1–7 dni"
                tone="amber"
                icon={<Clock className="h-6 w-6 text-amber-500" />}
                to={genHref}
              />
              <PurchasingKpiCard
                title="Sugestie zamówień"
                value={data.kpis.suggested_orders_count}
                subtitle="Liczba pozycji z sugerowaną ilością ≥ 1"
                tone="blue"
                icon={<ShoppingCart className="h-6 w-6 text-blue-500" />}
                to={genHref}
              />
              <PurchasingKpiCard
                title="Wartość sugerowanych zakupów"
                value={`${fmtMoney(data.kpis.suggested_purchase_value)} zł`}
                subtitle="Σ sugerowana ilość × cena zakupu"
                tone="emerald"
                icon={<Banknote className="h-6 w-6 text-emerald-500" />}
                to={genHref}
              />
              <PurchasingKpiCard
                title="Dostawcy aktywni"
                value={data.kpis.active_suppliers}
                subtitle="Aktywni partnerzy biznesowi"
                tone="indigo"
                icon={<Users className="h-6 w-6 text-indigo-500" />}
                to={suppliersHref}
              />
              <PurchasingKpiCard
                title="Dostawy w drodze / otwarte"
                value={data.kpis.deliveries_in_pipeline}
                subtitle="Statusy: szkic, zamówione, w drodze"
                tone="purple"
                icon={<Truck className="h-6 w-6 text-purple-500" />}
                to={ordersHref}
              />
            </PurchasingKpiGrid>
          ) : null
        }
        analysis={
          data ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <PurchasingTableSection
                title="Krytyczne produkty"
                subtitle="(top 10)"
                indicatorClass="bg-red-500"
                action={
                  <Link to={genHref} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                    Zobacz wszystkie
                  </Link>
                }
              >
                {data.critical_products.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-slate-500">Brak pozycji spełniających kryterium.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <PurchasingTableHeader
                      headers={["Produkt", "Stan", "Śr./Dzień", "Dni", "Dostawca", ""]}
                      align={["left", "right", "right", "center", "left", "right"]}
                    />
                    <tbody className="divide-y divide-slate-100">
                      {data.critical_products.map((r) => (
                        <tr key={r.product_id} className="group transition-colors hover:bg-blue-50/30">
                          <td className={`${td} w-2/5 font-medium text-slate-700`}>
                            <div className="line-clamp-2" title={r.product_name}>
                              {r.product_name}
                            </div>
                            {r.sku ? <div className="mt-0.5 text-xs text-slate-400">{r.sku}</div> : null}
                          </td>
                          <td className={`${td} text-right font-semibold tabular-nums text-red-600`}>{r.stock}</td>
                          <td className={`${td} text-right tabular-nums text-slate-500`}>
                            {r.avg_daily_sales.toFixed(4)}
                          </td>
                          <td className={`${td} text-center tabular-nums text-slate-400`}>
                            {r.days_cover != null ? r.days_cover : "—"}
                          </td>
                          <td className={`${td} text-slate-600`}>{r.supplier_name ?? "—"}</td>
                          <td className={`${td} text-right`}>
                            <Link
                              to={genHref}
                              className="inline-flex rounded-md p-1.5 text-blue-600 opacity-0 transition-all hover:bg-blue-100 group-hover:opacity-100"
                              aria-label="Przejdź do generatora"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </PurchasingTableSection>

              <PurchasingTableSection title="Największe sugestie zakupowe" subtitle="(top 10)" indicatorClass="bg-blue-500">
                {data.suggested_orders.length === 0 ? (
                  <p className="px-6 py-12 text-center text-sm italic text-slate-400">
                    Brak sugestii przy obecnych danych (sprzedaż / stany).
                  </p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <PurchasingTableHeader
                      headers={["Produkt", "Sug. Ilość", "Dostawca", "Szac. Koszt"]}
                      align={["left", "right", "left", "right"]}
                    />
                    <tbody className="divide-y divide-slate-100">
                      {data.suggested_orders.map((r) => (
                        <tr key={r.product_id} className="transition-colors hover:bg-blue-50/30">
                          <td className={`${td} font-medium text-slate-700`}>{r.product_name}</td>
                          <td className={`${td} text-right font-semibold tabular-nums text-blue-600`}>
                            {r.suggested_qty}
                          </td>
                          <td className={`${td} text-slate-600`}>{r.supplier_name ?? "—"}</td>
                          <td className={`${td} text-right font-medium tabular-nums text-slate-800`}>
                            {fmtMoney(r.estimated_cost)} zł
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </PurchasingTableSection>
            </div>
          ) : null
        }
        table={
          data ? (
            <PurchasingTableSection title="Ostatnie dostawy / zamówienia do dostawcy">
              {data.recent_orders.length === 0 ? (
                <p className="px-6 py-8 text-sm text-slate-500">Brak dokumentów dostaw w bazie.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <PurchasingTableHeader
                    headers={["Numer / Nazwa", "Dostawca", "Status", "Data", "Akcje"]}
                    align={["left", "left", "left", "left", "right"]}
                  />
                  <tbody className="divide-y divide-slate-100">
                    {data.recent_orders.map((r) => (
                      <tr key={r.id} className="transition-colors hover:bg-blue-50/30">
                        <td className={`${td} font-medium text-slate-800`}>{r.document_no}</td>
                        <td className={td}>{r.supplier_name}</td>
                        <td className={td}>
                          <PurchasingStatusBadge status={r.status} />
                        </td>
                        <td className={`${td} text-slate-500`}>{formatDate(r.created_at ?? undefined)}</td>
                        <td className={`${td} text-right`}>
                          <Link
                            to={ordersHref}
                            className="inline-flex rounded-md p-1.5 text-blue-600 hover:bg-blue-100"
                            aria-label="Przejdź do zamówień"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PurchasingTableSection>
          ) : null
        }
      />
    </PurchasingContentArea>
  );
}

export const PlanningDashboard = memo(PlanningDashboardInner);
export default PlanningDashboard;
