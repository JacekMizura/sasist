import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Search, WifiOff } from "lucide-react";

import {
  fetchWmsInventoryTaskQueue,
  openWmsInventorySession,
  type InventoryTaskCompact,
} from "../../../api/inventoryCountApi";
import WmsInventoryTaskFiltersBar, {
  type TaskQueueFilters,
} from "../../../modules/inventoryCount/components/WmsInventoryTaskFiltersBar";
import WmsInventoryTaskQueue from "../../../modules/inventoryCount/components/WmsInventoryTaskQueue";
import WmsInventoryUniversalSearchModal from "../../../modules/inventoryCount/components/WmsInventoryUniversalSearchModal";
import { wmsInventoryCountPaths } from "../../../modules/inventoryCount/inventoryCountPaths";
import { useInventoryCountOfflineStatus } from "../../../modules/inventoryCount/offline/useInventoryCountOfflineStatus";
import { WMS_INV } from "../../../modules/inventoryCount/wmsIndustrialTheme";
import { useWarehouse } from "../../../context/WarehouseContext";

const DEFAULT_FILTERS: TaskQueueFilters = {
  search: "",
  zone: "",
  status: "",
  recountOnly: false,
  unresolvedOnly: false,
  varianceOnly: false,
  completedOnly: false,
};

const TENANT_ID = 1;

export default function WmsInventoryCountTasksPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = TENANT_ID;
  const warehouseId = warehouse?.id;
  const { online, pendingOps } = useInventoryCountOfflineStatus();

  const [filters, setFilters] = useState<TaskQueueFilters>(DEFAULT_FILTERS);
  const [items, setItems] = useState<InventoryTaskCompact[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const loadPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (!warehouseId) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const page = await fetchWmsInventoryTaskQueue(tenantId, warehouseId, {
          search: filters.search || undefined,
          zone: filters.zone || undefined,
          status: filters.status || undefined,
          recountOnly: filters.recountOnly,
          unresolvedOnly: filters.unresolvedOnly,
          varianceOnly: filters.varianceOnly,
          completedOnly: filters.completedOnly,
          offset: nextOffset,
          limit: 60,
        });
        setItems((prev) => (append ? [...prev, ...page.items] : page.items));
        setTotal(page.total);
        setOffset(nextOffset + page.items.length);
        setHasMore(page.has_more);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters, tenantId, warehouseId],
  );

  useEffect(() => {
    const t = window.setTimeout(() => void loadPage(0, false), filters.search ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [filters, loadPage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openTask = async (task: InventoryTaskCompact) => {
    if (!warehouseId) return;
    const session = await openWmsInventorySession(tenantId, warehouseId, {
      document_id: task.inventory_document_id,
      task_id: task.id,
    });
    navigate(wmsInventoryCountPaths.count(task.id), { state: { sessionId: session.id } });
  };

  if (!warehouseId) {
    return <p className={`py-8 text-center ${WMS_INV.textMuted}`}>Wybierz magazyn w ustawieniach.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={`flex items-center gap-2 text-xl font-black ${WMS_INV.text}`}>
            <ClipboardList className="h-6 w-6 text-[#1e4d8c]" aria-hidden />
            Kolejka liczenia
          </h1>
          <p className={`text-sm font-semibold ${WMS_INV.textMuted}`}>
            {total > 0 ? `${total.toLocaleString("pl-PL")} lokalizacji` : "Brak zadań"}
            {!online ? (
              <span className="ml-2 inline-flex items-center gap-1 text-[#b45309]">
                <WifiOff className="h-3.5 w-3.5" /> Offline
              </span>
            ) : null}
            {pendingOps > 0 ? (
              <span className="ml-2 text-[#1e4d8c]">Kolejka sync: {pendingOps}</span>
            ) : null}
          </p>
        </div>
        <button type="button" className={WMS_INV.btnPrimary} onClick={() => setSearchOpen(true)}>
          <Search className="mr-2 h-4 w-4" />
          Szukaj
        </button>
      </header>

      <WmsInventoryTaskFiltersBar
        filters={filters}
        onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <WmsInventoryTaskQueue
        items={items}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={() => void loadPage(offset, true)}
        onSelectTask={(t) => void openTask(t)}
      />

      <Link to="/wms/menu" className={`text-sm font-semibold ${WMS_INV.textMuted} hover:text-[#1e4d8c]`}>
        ← Menu WMS
      </Link>

      <WmsInventoryUniversalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        tenantId={tenantId}
        warehouseId={warehouseId}
        onPickTask={(taskId) => navigate(wmsInventoryCountPaths.count(taskId))}
      />
    </div>
  );
}
