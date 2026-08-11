/**
 * Kolejność dostaw — kolejka operacyjna otwartych PZ wymagających pracy magazynu.
 * Dane z /wms/delivery-work-queue (nie z planu Supply Flow).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ListOrdered,
  RefreshCw,
  Search,
} from "lucide-react";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { PageHeader } from "../../components/layout/PageHeader";
import { AppEmptyState } from "../../components/app-shell";
import { SecondaryButton, StatusBadge, typography } from "@/design-system";
import { brandOutlineButtonClass } from "../../design-system/brandUi";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import {
  getDeliveryWorkQueue,
  reorderDeliveryWorkQueue,
  setDeliveryWorkQueuePriority,
  type DeliveryWorkQueueItem,
  type DeliveryWorkQueuePriority,
} from "../../api/deliveryWorkQueueApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";

type PriorityFilter = "all" | DeliveryWorkQueuePriority;

const PRIORITY_FILTERS: Array<{ id: PriorityFilter; label: string }> = [
  { id: "all", label: "Wszystkie" },
  { id: "urgent", label: "Pilne" },
  { id: "first", label: "Najpierw" },
  { id: "next", label: "Następne" },
  { id: "later", label: "Do wykonania" },
];

const PRIORITY_OPTIONS: Array<{ id: DeliveryWorkQueuePriority; label: string }> = [
  { id: "urgent", label: "Pilne" },
  { id: "first", label: "Najpierw" },
  { id: "next", label: "Następne" },
  { id: "later", label: "Do wykonania" },
];

function urgencyTone(band: DeliveryWorkQueuePriority): "danger" | "warning" | "info" | "neutral" {
  switch (band) {
    case "urgent":
      return "danger";
    case "first":
      return "warning";
    case "next":
      return "info";
    default:
      return "neutral";
  }
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pl-PL");
}

export default function KolejnoscDostawPage() {
  const { hasActiveWarehouse, warehouseId } = useActiveWarehouseContext();
  const [items, setItems] = useState<DeliveryWorkQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<PriorityFilter>("all");

  const load = useCallback(async () => {
    if (!hasActiveWarehouse || warehouseId == null) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getDeliveryWorkQueue(DAMAGE_TENANT_ID, warehouseId);
      setItems(data.items ?? []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        "Nie udało się wczytać kolejki dostaw";
      setError(String(msg));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [hasActiveWarehouse, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    if (!hasActiveWarehouse || warehouseId == null) return;
    setRefreshing(true);
    setError(null);
    try {
      const data = await getDeliveryWorkQueue(DAMAGE_TENANT_ID, warehouseId);
      setItems(data.items ?? []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        "Nie udało się odświeżyć kolejki";
      setError(String(msg));
    } finally {
      setRefreshing(false);
    }
  }, [hasActiveWarehouse, warehouseId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((row) => {
      if (priority !== "all" && row.priority !== priority) return false;
      if (!q) return true;
      const hay = [
        row.document_number,
        row.supplier_name ?? "",
        row.delivery_name ?? "",
        row.status_label,
        String(row.pz_id),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, priority]);

  const moveRow = async (pzId: number, direction: -1 | 1) => {
    if (warehouseId == null || busyId != null) return;
    const idx = items.findIndex((x) => x.pz_id === pzId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;
    const next = [...items];
    const a = next[idx]!;
    const b = next[swapIdx]!;
    next[idx] = b;
    next[swapIdx] = a;
    const ordered = next.map((x) => x.pz_id);
    setBusyId(pzId);
    setError(null);
    try {
      const data = await reorderDeliveryWorkQueue(DAMAGE_TENANT_ID, warehouseId, ordered);
      setItems(data.items ?? []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        "Nie udało się zapisać kolejności";
      setError(String(msg));
      void load();
    } finally {
      setBusyId(null);
    }
  };

  const changePriority = async (pzId: number, nextPriority: DeliveryWorkQueuePriority) => {
    if (warehouseId == null || busyId != null) return;
    setBusyId(pzId);
    setError(null);
    try {
      const updated = await setDeliveryWorkQueuePriority(
        DAMAGE_TENANT_ID,
        warehouseId,
        pzId,
        nextPriority,
      );
      setItems((prev) =>
        [...prev]
          .map((x) => (x.pz_id === pzId ? { ...x, ...updated } : x))
          .sort((a, b) => a.queue_sort - b.queue_sort),
      );
      // Reload to respect full sort (priority + queue_sort).
      const data = await getDeliveryWorkQueue(DAMAGE_TENANT_ID, warehouseId);
      setItems(data.items ?? []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        "Nie udało się zapisać priorytetu";
      setError(String(msg));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Kolejność dostaw"
        subtitle="Co przyjąć / rozlokować teraz i w jakiej kolejności — na podstawie otwartych PZ."
        breadcrumbs={[
          { label: "Zarządzanie", to: "/zarzadzanie-magazynem/pulpit" },
          { label: "Kolejność dostaw" },
        ]}
        actions={
          <SecondaryButton
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || loading || !hasActiveWarehouse}
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Odśwież
          </SecondaryButton>
        }
      />

      {!hasActiveWarehouse ? (
        <ActiveWarehouseRequiredBanner hint="Wybierz aktywny magazyn, aby zobaczyć kolejność dostaw." />
      ) : null}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      {hasActiveWarehouse ? (
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="block min-w-0 flex-1 sm:max-w-sm">
            <span className={`mb-0.5 block ${typography.label}`}>Szukaj</span>
            <span className="relative block">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="PZ, dostawca…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
            </span>
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtr priorytetu">
            {PRIORITY_FILTERS.map((f) => {
              const active = priority === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPriority(f.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border-orange-200 bg-orange-50 text-orange-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <p className={typography.bodyMuted}>Ładowanie kolejki…</p>
      ) : null}

      {!loading && hasActiveWarehouse && filtered.length === 0 ? (
        <AppEmptyState
          icon={ListOrdered}
          title="Brak dostaw w kolejce"
          description={
            items.length === 0
              ? "Wszystkie aktualne dostawy są zakończone albo nie wymagają obsługi przyjęcia / rozlokowania."
              : "Żadna pozycja nie pasuje do filtrów."
          }
        />
      ) : null}

      {filtered.length > 0 ? (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={`px-3 py-3 ${typography.tableHead}`}>#</th>
                <th className={`px-3 py-3 ${typography.tableHead}`}>Dokument</th>
                <th className={`px-3 py-3 ${typography.tableHead}`}>Dostawca</th>
                <th className={`px-3 py-3 ${typography.tableHead}`}>Status</th>
                <th className={`px-3 py-3 ${typography.tableHead}`}>Pozycje / szt.</th>
                <th className={`px-3 py-3 ${typography.tableHead}`}>Termin</th>
                <th className={`px-3 py-3 ${typography.tableHead}`}>Priorytet</th>
                <th className={`px-3 py-3 ${typography.tableHead}`}>Kolejność</th>
                <th className={`px-3 py-3 text-right ${typography.tableHead}`}>Akcja</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const globalIdx = items.findIndex((x) => x.pz_id === row.pz_id);
                const canUp = globalIdx > 0;
                const canDown = globalIdx >= 0 && globalIdx < items.length - 1;
                return (
                  <tr
                    key={row.pz_id}
                    className={`border-b border-slate-50 hover:bg-slate-50/50 ${
                      row.priority === "urgent" ? "bg-orange-50/40" : ""
                    }`}
                  >
                    <td className={`px-3 py-3 tabular-nums ${typography.caption}`}>
                      {row.queue_sort || idx + 1}
                    </td>
                    <td className="px-3 py-3">
                      <p className={typography.bodyStrong}>{row.document_number}</p>
                      <p className={`mt-0.5 ${typography.caption}`}>
                        {row.started ? "W toku" : "Do rozpoczęcia"}
                        {row.work_phase === "putaway" ? " · rozlokowanie" : " · przyjęcie"}
                      </p>
                    </td>
                    <td className={`px-3 py-3 ${typography.body}`}>
                      {row.supplier_name || "—"}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge tone="neutral" density="compact">
                        {row.status_label}
                      </StatusBadge>
                    </td>
                    <td className={`px-3 py-3 tabular-nums ${typography.body}`}>
                      {row.line_count} poz. · {fmtQty(row.quantity_ordered)} szt.
                    </td>
                    <td className={`px-3 py-3 ${typography.body}`}>
                      {fmtDate(row.expected_date || row.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                        value={row.priority}
                        disabled={busyId === row.pz_id}
                        onChange={(e) =>
                          void changePriority(row.pz_id, e.target.value as DeliveryWorkQueuePriority)
                        }
                        aria-label={`Priorytet ${row.document_number}`}
                      >
                        {PRIORITY_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1">
                        <StatusBadge tone={urgencyTone(row.priority)} density="compact">
                          {PRIORITY_OPTIONS.find((o) => o.id === row.priority)?.label ?? row.priority}
                        </StatusBadge>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                          disabled={!canUp || busyId != null || priority !== "all" || !!query.trim()}
                          onClick={() => void moveRow(row.pz_id, -1)}
                          aria-label="Wyżej w kolejce"
                          title={
                            priority !== "all" || query.trim()
                              ? "Wyczyść filtr, aby zmieniać kolejność"
                              : "Wyżej"
                          }
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                          disabled={!canDown || busyId != null || priority !== "all" || !!query.trim()}
                          onClick={() => void moveRow(row.pz_id, 1)}
                          aria-label="Niżej w kolejce"
                          title={
                            priority !== "all" || query.trim()
                              ? "Wyczyść filtr, aby zmieniać kolejność"
                              : "Niżej"
                          }
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        to={row.cta_path}
                        className={`${brandOutlineButtonClass} gap-1 px-3 py-1.5 text-xs`}
                      >
                        {row.cta_label}
                        <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
