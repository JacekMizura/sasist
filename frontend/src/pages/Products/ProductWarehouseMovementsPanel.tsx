import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import { warehouseStockDocumentPath } from "../../utils/stockDocumentPaths";
import { DataTablePageSizeSelect } from "../../components/table/DataTablePageSizeSelect";
import { LocationTypeBadge } from "../../components/warehouse/LocationTypeBadge";
import { useLocalStorage } from "../../hooks/useLocalStorage";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250] as const;
const PRODUCT_MOVEMENTS_PAGE_SIZE_KEY = "product.movements.pageSize";
const PRODUCT_MOVEMENTS_PAGE_SIZE_KEY_LEGACY = "product_movements.pageSize";

export type MovementRow = {
  id: number;
  source: string;
  created_at: string | null;
  type: string | null;
  user: string | null;
  document_id: number | null;
  document_number: string | null;
  document_type: string | null;
  location_label: string;
  location: { id: number; name: string; storage_type: string } | null;
  quantity_before: number | null;
  quantity_after: number | null;
  delta: number;
  quantity_raw: number;
  unit_cost_net?: number | null;
  unit_cost_gross?: number | null;
  batch_number?: string | null;
  expiry_date?: string | null;
};

type DeliveryHistoryRow = {
  document_id: number;
  document: string;
  document_type: string;
  date: string | null;
  supplier: string;
  qty: number;
  unit_net: number | null;
  unit_gross: number | null;
  total_net: number;
  total_gross: number;
};

type TabId = "operations" | "deliveries";

function mapMovementTypeLabel(type: string | null | undefined): string {
  const t = (type || "").trim().toLowerCase();
  const m: Record<string, string> = {
    receive: "Przyjęcie",
    receiving: "Przyjęcie",
    putaway: "Rozlokowanie",
    putaway_pw: "Rozlokowanie PW",
    production_rw: "Produkcja RW",
    production_pw: "Produkcja PW",
    picking: "Kompletacja",
    pick: "Kompletacja",
    move: "Przesunięcie",
    adjust: "Korekta",
    return: "Zwrot",
    manual_mm: "Ręczne przesunięcie",
    replenishment: "Uzupełnianie braków",
  };
  return m[t] ?? (type ? type : "—");
}

function normalizeMovementRow(raw: unknown): MovementRow {
  const r = raw as Record<string, unknown>;
  const u = r.user;
  let userStr: string | null = null;
  if (typeof u === "string") userStr = u.trim() || null;
  else if (u && typeof u === "object" && "label" in u) {
    const lab = (u as { label?: unknown }).label;
    if (typeof lab === "string" && lab.trim()) userStr = lab.trim();
  }
  const typeRaw = r.type;
  const typeStr = typeof typeRaw === "string" ? typeRaw : typeRaw != null ? String(typeRaw) : null;
  return {
    id: Number(r.id) || 0,
    source: typeof r.source === "string" ? r.source : String(r.source ?? ""),
    created_at: typeof r.created_at === "string" ? r.created_at : null,
    type: typeStr,
    user: userStr,
    document_id: typeof r.document_id === "number" ? r.document_id : r.document_id != null ? Number(r.document_id) : null,
    document_number: typeof r.document_number === "string" ? r.document_number : null,
    document_type: typeof r.document_type === "string" ? r.document_type : null,
    location_label: typeof r.location_label === "string" ? r.location_label : "—",
    location:
      r.location && typeof r.location === "object"
        ? (r.location as MovementRow["location"])
        : null,
    quantity_before: typeof r.quantity_before === "number" ? r.quantity_before : null,
    quantity_after: typeof r.quantity_after === "number" ? r.quantity_after : null,
    delta: typeof r.delta === "number" ? r.delta : Number(r.delta) || 0,
    quantity_raw: typeof r.quantity_raw === "number" ? r.quantity_raw : Number(r.quantity_raw) || 0,
    unit_cost_net: typeof r.unit_cost_net === "number" ? r.unit_cost_net : null,
    unit_cost_gross: typeof r.unit_cost_gross === "number" ? r.unit_cost_gross : null,
    batch_number: typeof r.batch_number === "string" ? r.batch_number : null,
    expiry_date: typeof r.expiry_date === "string" ? r.expiry_date : null,
  };
}

function formatExpiryPl(iso: string | null | undefined): string {
  const s = (iso ?? "").trim();
  if (!s) return "—";
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatPlDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtQty(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function fmtDelta(v: number): string {
  if (Number.isInteger(v)) return v > 0 ? `+${v}` : String(v);
  const s = v.toFixed(2).replace(/\.?0+$/, "");
  return v > 0 ? `+${s}` : s;
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  productId: number;
  tenantId: number | null;
};

export function ProductWarehouseMovementsPanel({ productId, tenantId }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("operations");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorage(
    PRODUCT_MOVEMENTS_PAGE_SIZE_KEY,
    25,
    PAGE_SIZE_OPTIONS,
    PRODUCT_MOVEMENTS_PAGE_SIZE_KEY_LEGACY,
  );
  const [items, setItems] = useState<MovementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryHistoryRow[]>([]);
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const offset = (page - 1) * pageSize;
    setLoading(true);
    setError(null);
    const endpoint = activeTab === "operations" ? `/products/${productId}/movements` : `/products/${productId}/delivery-history`;
    api
      .get<{ items: MovementRow[] | DeliveryHistoryRow[]; total: number }>(endpoint, {
        params: { tenant_id: tenantId ?? undefined, limit: pageSize, offset },
      })
      .then((res) => {
        if (cancelled) return;
        if (activeTab === "operations") {
          const rawItems = Array.isArray(res.data?.items) ? res.data.items : [];
          setItems(rawItems.map((row) => normalizeMovementRow(row)));
          setTotal(typeof res.data?.total === "number" ? res.data.total : 0);
        } else {
          setDeliveryItems(Array.isArray(res.data?.items) ? (res.data.items as DeliveryHistoryRow[]) : []);
          setDeliveryTotal(typeof res.data?.total === "number" ? res.data.total : 0);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          e && typeof e === "object" && "response" in e
            ? String((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "")
            : "";
        setError(msg || "Nie udało się wczytać historii.");
        if (activeTab === "operations") {
          setItems([]);
          setTotal(0);
        } else {
          setDeliveryItems([]);
          setDeliveryTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, tenantId, page, activeTab, pageSize]);

  const activeTotal = activeTab === "operations" ? total : deliveryTotal;
  const totalPages = Math.max(1, Math.ceil(activeTotal / pageSize));
  const tabClass = (id: TabId) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      activeTab === id ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            className={tabClass("operations")}
            onClick={() => {
              setActiveTab("operations");
              setPage(1);
            }}
          >
            Operacje magazynowe
          </button>
          <button
            type="button"
            className={tabClass("deliveries")}
            onClick={() => {
              setActiveTab("deliveries");
              setPage(1);
            }}
          >
            Historia dostaw
          </button>
        </div>
        <DataTablePageSizeSelect
          options={PAGE_SIZE_OPTIONS}
          value={pageSize}
          onChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
        />
      </div>

      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && !error && activeTab === "operations" && items.length === 0 ? (
        <p className="text-sm text-slate-500">Brak zapisanych operacji dla tego produktu.</p>
      ) : null}
      {!loading && !error && activeTab === "deliveries" && deliveryItems.length === 0 ? (
        <p className="text-sm text-slate-500">Brak historii przyjęć dostaw (PZ) dla tego produktu.</p>
      ) : null}

      {activeTab === "operations" && items.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Data</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Akcja</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Dokument</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Użytkownik</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Lokalizacja</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Partia</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Data ważności</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-700">Ilość przed</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-700">Zmiana</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-700">Ilość po</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map((row) => (
                <tr key={`${row.source}-${row.id}`} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-800">{formatPlDate(row.created_at)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                      {mapMovementTypeLabel(row.type)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {row.document_id != null ? (
                      <Link
                        to={warehouseStockDocumentPath(row.document_type, row.document_id)}
                        className="font-medium text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900"
                      >
                        {(row.document_number || "").trim() || `#${row.document_id}`}
                      </Link>
                    ) : (row.document_number || "").trim() ? (
                      row.document_number
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.user?.trim() ? row.user : "—"}</td>
                  <td className="max-w-[220px] px-3 py-2">
                    {row.location ? (
                      <LocationTypeBadge
                        locationText={row.location_label}
                        storageType={row.location.storage_type}
                        layoutSpread
                      />
                    ) : (
                      <span className="text-slate-600">{row.location_label}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-700">
                    {(row.batch_number ?? "").trim() || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatExpiryPl(row.expiry_date)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{fmtQty(row.quantity_before)}</td>
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
                      row.delta > 0 ? "text-emerald-700" : row.delta < 0 ? "text-red-700" : "text-slate-600"
                    }`}
                  >
                    {fmtDelta(row.delta)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{fmtQty(row.quantity_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeTab === "deliveries" && deliveryItems.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Data</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Dokument</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Dostawca</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-700">Ilość</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-700">Cena netto szt.</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-700">Cena brutto szt.</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-700">Wartość netto</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-700">Wartość brutto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {deliveryItems.map((row) => (
                <tr key={row.document_id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-800">{formatPlDate(row.date)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.document || "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{row.supplier || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{fmtQty(row.qty)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{fmtMoney(row.unit_net)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{fmtMoney(row.unit_gross)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{fmtMoney(row.total_net)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{fmtMoney(row.total_gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeTotal > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, activeTotal)} z {activeTotal}
          </span>
          {totalPages > 1 ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Poprzednia
              </button>
              <span className="py-1.5">
                Strona {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Następna
              </button>
            </div>
          ) : (
            <span className="text-slate-500">Strona 1 / 1</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
