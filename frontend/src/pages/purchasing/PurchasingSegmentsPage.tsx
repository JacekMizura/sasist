/**
 * Segmentacja ABC/XYZ — podział asortymentu pod decyzje zakupowe (heatmap + tabela).
 * Filtry wysyłane do API; KPI i heatmapa korzystają z `segment_counts` (pełny obraz niezależnie od filtra wierszy).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { AppEmptyState } from "../../components/app-shell";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { fetchPurchasingSegments, type PurchasingSegmentsPayload } from "../../api/purchasingSegmentsApi";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  PurchasingAnalysisSection,
  PurchasingContentArea,
  PurchasingFilterBar,
  PurchasingFilterField,
  PurchasingKpiCard,
  PurchasingKpiGrid,
  PurchasingPageHeader,
  PurchasingPageShell,
  PurchasingProductCell,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingSelectClass,
} from "../../modules/purchasing/ui";

type Tenant = { id: number; name: string };

const HEATMAP_ORDER = ["AX", "AY", "AZ", "BX", "BY", "BZ", "CX", "CY", "CZ"] as const;

/** Krótki opis dla użytkownika nietechnicznego (bez skrótów bez kontekstu). */
const SEGMENT_USER_HINT: Record<(typeof HEATMAP_ORDER)[number], string> = {
  AX: "Najważniejsze i stabilne — utrzymuj płynny zapas, warto automatyzować.",
  AY: "Ważne, sezonowe — planuj sezon i bufor przed szczytem.",
  AZ: "Ważne, nieregularne — utrzymuj większy zapas bezpieczeństwa.",
  BX: "Średnia wartość, stabilny obrót — standardowe uzupełnianie.",
  BY: "Średnia wartość, zmienne tempo — obserwuj promocje i sezon.",
  BZ: "Średnia wartość, nieregularnie — zamawiaj na potwierdzony popyt.",
  CX: "Niski obrót, stabilnie — nie nadbudowuj stanu.",
  CY: "Niski obrót, sezonowo — ostrożnie z nadmiarem po sezonie.",
  CZ: "Słabe i „nierówne” — nie domawiaj bez potrzeby, rozważ wyprzedaż.",
};

function segmentBadgeLabel(seg: string): string {
  if (seg.length !== 2) return seg;
  const a = seg[0];
  const x = seg[1];
  const abc =
    a === "A" ? "wysoka wartość" : a === "B" ? "średnia wartość" : "niska wartość";
  const xyz =
    x === "X" ? "stabilny popyt" : x === "Y" ? "popyt sezonowy" : "popyt nieregularny";
  return `${abc} · ${xyz}`;
}

function badgeAbc(c: string): string {
  switch (c) {
    case "A":
      return "bg-emerald-100 text-emerald-900 ring-emerald-200";
    case "B":
      return "bg-sky-100 text-sky-900 ring-sky-200";
    default:
      return "bg-slate-200 text-slate-800 ring-slate-300";
  }
}

function badgeXyz(c: string): string {
  switch (c) {
    case "X":
      return "bg-emerald-50 text-emerald-900 ring-emerald-200";
    case "Y":
      return "bg-amber-50 text-amber-950 ring-amber-200";
    default:
      return "bg-red-50 text-red-900 ring-red-200";
  }
}

function fmtNum(n: number | null | undefined, d = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("pl-PL", { maximumFractionDigits: d });
}

export default function PurchasingSegmentsPage() {
  const { selectedWarehouseId } = useWarehouse();
  const [searchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [rangeDays, setRangeDays] = useState<30 | 90 | 365>(90);
  const [segmentFilter, setSegmentFilter] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [deadStockOnly, setDeadStockOnly] = useState(false);
  const [highPriorityOnly, setHighPriorityOnly] = useState(false);

  const [data, setData] = useState<PurchasingSegmentsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length > 0 && !list.some((t) => t.id === tenantId)) setTenantId(list[0].id);
      })
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) setTenantId(n);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!tenantId) return;
    void listSuppliers(tenantId, { status: "active" })
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, [tenantId]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchPurchasingSegments({
        tenantId: tenantId,
        warehouseId: selectedWarehouseId ?? null,
        rangeDays,
        segmentFilter: segmentFilter.trim() || null,
        supplierId: supplierId ? Number(supplierId) : null,
        deadStockOnly,
        highPriorityOnly,
      });
      setData(d);
    } catch {
      setErr("Nie udało się wczytać segmentacji.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedWarehouseId, rangeDays, segmentFilter, supplierId, deadStockOnly, highPriorityOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = data?.summary.segment_counts ?? {};

  const heatmapTiles = useMemo(
    () =>
      HEATMAP_ORDER.map((seg) => ({
        seg,
        count: counts[seg] ?? 0,
        active: segmentFilter.toUpperCase() === seg,
      })),
    [counts, segmentFilter],
  );

  const toggleSegmentFromHeatmap = (seg: string) => {
    setSegmentFilter((prev) => (prev.toUpperCase() === seg ? "" : seg));
  };

  return (
    <PurchasingContentArea>
      <PurchasingPageShell
        header={
          <PurchasingPageHeader
            title="Priorytety asortymentu"
            subtitle="Produkty są pogrupowane według ważności dla obrotu (A, B, C) oraz sposobu sprzedaży (X, Y, Z). To pomaga ustalić, gdzie trzymać zapas."
          />
        }
        status={
          err ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {err}
              <button type="button" className="ml-3 underline" onClick={() => void load()}>
                Ponów
              </button>
            </div>
          ) : null
        }
        kpis={
          <PurchasingKpiGrid columns={4}>
            <PurchasingKpiCard
              title="Najważniejszy asortyment (A)"
              value={data?.summary.products_a_count ?? 0}
              subtitle="Produkty, które generują większość obrotu — tu warto pilnować dostępności."
              tone="emerald"
            />
            <PurchasingKpiCard
              title="Stabilne hity (A + stabilny popyt)"
              value={data?.summary.ax_count ?? 0}
              subtitle="Najbezpieczniejsze do planowania zapasu i automatyzacji."
              tone="blue"
            />
            <PurchasingKpiCard
              title="Nieregularna sprzedaż (wysokie ryzyko zapasu)"
              value={data?.summary.high_risk_count ?? 0}
              subtitle="Te SKU potrafią „stać” lub znikać z półki — sprawdź, czy nie zamrażają kapitału."
              tone="amber"
            />
            <PurchasingKpiCard
              title="Martwy stock"
              value={data?.summary.dead_stock_count ?? 0}
              subtitle="Stan > 0, a w oknie brak ruchu — rozważ wyprzedaż lub wstrzymanie zakupów."
              tone="red"
            />
          </PurchasingKpiGrid>
        }
        filters={
          <PurchasingFilterBar
            footer={
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={deadStockOnly} onChange={(e) => setDeadStockOnly(e.target.checked)} />
                  Martwy stock
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={highPriorityOnly} onChange={(e) => setHighPriorityOnly(e.target.checked)} />
                  Wysoki priorytet (≥70)
                </label>
                {segmentFilter ? (
                  <button type="button" className="text-sky-700 underline" onClick={() => setSegmentFilter("")}>
                    Wyczyść segment z heatmapy
                  </button>
                ) : null}
              </div>
            }
          >
            <PurchasingFilterField label="Podmiot">
              <select className={purchasingSelectClass} value={tenantId} onChange={(e) => setTenantId(Number(e.target.value))}>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (#{t.id})
                  </option>
                ))}
              </select>
            </PurchasingFilterField>
            <PurchasingFilterField label="Magazyn">
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-600">
                {selectedWarehouseId != null ? `#${selectedWarehouseId}` : "Cały tenant (wszystkie magazyny)"}
              </p>
            </PurchasingFilterField>
            <PurchasingFilterField label="Okres sprzedaży">
              <select
                className={purchasingSelectClass}
                value={rangeDays}
                onChange={(e) => setRangeDays(Number(e.target.value) as 30 | 90 | 365)}
              >
                <option value={30}>30 dni</option>
                <option value={90}>90 dni</option>
                <option value={365}>365 dni</option>
              </select>
            </PurchasingFilterField>
            <PurchasingFilterField label="Dostawca" className="min-w-[12rem]">
              <select className={purchasingSelectClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Wszyscy</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </PurchasingFilterField>
          </PurchasingFilterBar>
        }
        analysis={
          <PurchasingAnalysisSection
            title="Mapa priorytetów"
            subtitle="Kliknij pole, aby zobaczyć listę produktów w tabeli poniżej (drugi klik wyłącza filtr). Skrót w nawiasie to tylko pomoc sortowania — pod spodem masz ludzki opis."
          >
            <div className="grid w-full grid-cols-3 gap-1">
              {heatmapTiles.map(({ seg, count, active }) => (
                <button
                  key={seg}
                  type="button"
                  onClick={() => toggleSegmentFromHeatmap(seg)}
                  className={`rounded-md border px-1.5 py-1.5 text-left transition ${
                    active
                      ? "border-sky-500 bg-sky-50 ring-1 ring-sky-300"
                      : "border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <div className="font-mono text-xs font-bold text-slate-900">{seg}</div>
                  <div className="text-[10px] font-medium leading-tight text-slate-700">{segmentBadgeLabel(seg)}</div>
                  <div className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-600">{count}</div>
                </button>
              ))}
            </div>
          </PurchasingAnalysisSection>
        }
        table={
          <PurchasingTableSection
            title="Lista produktów"
            indicatorClass="bg-sky-500"
            toolbar={
              <>
                Wyniki: <strong>{data?.summary.total_products ?? 0}</strong> produktów (po filtrach)
                {loading ? <span className="ml-2 text-slate-400">Ładowanie…</span> : null}
              </>
            }
          >
            {(data?.rows ?? []).length === 0 && !loading ? (
              <AppEmptyState
                icon={LayoutGrid}
                title="Brak produktów"
                description="Zmień filtry lub okres sprzedaży, aby zobaczyć segmentację asortymentu."
                density="inline"
              />
            ) : (
              <>
                <table className="min-w-full text-left text-sm">
                  <PurchasingTableHeader
                    headers={[
                      "Produkt",
                      "Priorytet (A–C + X–Z)",
                      "Co rekomendujemy",
                      "Sprzedaż",
                      "Stan",
                      "Wartość st.",
                      "Dostawca",
                      "Kolejność uzupełniania",
                    ]}
                  />
          <tbody className="divide-y divide-slate-100">
            {(data?.rows ?? []).map((r) => (
              <tr key={r.product_id}>
                <td className="px-3 py-2">
                  <PurchasingProductCell
                    name={r.name}
                    sku={r.sku}
                    ean={r.ean}
                    stock={r.stock}
                    subtitle={[r.sku, r.product_id ? `#${r.product_id}` : null, r.ean ? `EAN ${r.ean}` : null].filter(Boolean).join(" · ") || undefined}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${badgeAbc(r.abc_class)}`}>
                      {r.abc_class}
                    </span>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${badgeXyz(r.xyz_class)}`}>
                      {r.xyz_class}
                    </span>
                    <span className="text-xs font-mono text-slate-700">{r.segment}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">{segmentBadgeLabel(r.segment)}</div>
                </td>
                <td className="max-w-md px-3 py-2 text-xs text-slate-700">
                  <p>{SEGMENT_USER_HINT[r.segment as (typeof HEATMAP_ORDER)[number]] ?? "Dopasuj zapas do rzeczywistej rotacji i marży."}</p>
                  {r.suggested_strategy ? (
                    <p className="mt-1 border-t border-slate-100 pt-1 text-slate-600">{r.suggested_strategy}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  <div>{fmtNum(r.sales_qty, 2)} szt.</div>
                  <div className="text-xs text-slate-500">{fmtNum(r.sales_value, 2)} PLN</div>
                </td>
                <td className="px-3 py-2 tabular-nums text-slate-700">{fmtNum(r.stock, 2)}</td>
                <td className="px-3 py-2 tabular-nums text-slate-700">{fmtNum(r.stock_value, 2)}</td>
                <td className="px-3 py-2 text-slate-700">{r.supplier_name || "brak przypisanego"}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex min-w-[2.5rem] justify-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                    {r.reorder_priority}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
              </>
            )}
          </PurchasingTableSection>
        }
      />
    </PurchasingContentArea>
  );
}
