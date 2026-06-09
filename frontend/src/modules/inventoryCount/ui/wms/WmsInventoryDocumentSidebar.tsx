import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { fetchWmsActiveInventoryDocuments, type WmsActiveInventoryDocumentRead } from "@/api/inventoryCountApi";
import {
  inventoryDocumentStatusLabel,
  inventoryTypeLabel,
} from "@/modules/inventoryCount/inventoryCountUiLabels";
import { wmsInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import { setActiveInventoryDocumentId } from "@/modules/inventoryCount/wmsActiveDocumentStorage";
import { useWarehouse } from "@/context/WarehouseContext";
import { WMS_INV } from "./theme";

const TENANT_ID = 1;

function fmtActivity(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/** Left operational document list — same density as MM / picking queues. */
export default function WmsInventoryDocumentSidebar() {
  const navigate = useNavigate();
  const { documentId: documentIdParam } = useParams();
  const activeId = documentIdParam ? Number(documentIdParam) : null;
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id;
  const tenantId = TENANT_ID;
  const [docs, setDocs] = useState<WmsActiveInventoryDocumentRead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    try {
      const items = await fetchWmsActiveInventoryDocuments(tenantId, warehouseId);
      setDocs(items);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDocument = (doc: WmsActiveInventoryDocumentRead) => {
    if (!warehouseId || !doc.can_count) return;
    setActiveInventoryDocumentId(warehouseId, doc.id);
    navigate(wmsInventoryCountPaths.document(doc.id));
  };

  if (!warehouseId) {
    return (
      <aside className={WMS_INV.sidebar}>
        <div className={WMS_INV.sidebarHeader}>
          <p className="text-sm font-bold text-slate-700">Inwentaryzacja</p>
          <p className="mt-1 text-xs text-slate-500">Wybierz magazyn.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className={WMS_INV.sidebar}>
      <div className={WMS_INV.sidebarHeader}>
        <p className={WMS_INV.textLabel}>Inwentaryzacja</p>
        <p className="mt-1 text-sm font-bold text-slate-800">Aktywne dokumenty</p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 px-4 py-6 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </p>
      ) : null}

      {!loading && docs.length === 0 ? (
        <p className="px-4 py-6 text-xs text-slate-500">Brak aktywnych inwentaryzacji w tym magazynie.</p>
      ) : null}

      <ul className="min-h-0 flex-1">
        {docs.map((doc) => {
          const isActive = doc.id === activeId;
          const canCount = doc.can_count;
          const ctaLabel = !canCount
            ? "Do zatwierdzenia"
            : doc.counted_lines > 0
              ? "Kontynuuj"
              : "Liczenie";

          return (
            <li key={doc.id}>
              <button
                type="button"
                disabled={!canCount}
                onClick={() => openDocument(doc)}
                className={`${WMS_INV.listRow} ${isActive ? WMS_INV.listRowActive : ""} disabled:opacity-50`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-black text-slate-900">{doc.number}</p>
                  {doc.title?.trim() ? (
                    <p className="truncate text-xs font-medium text-slate-600">{doc.title.trim()}</p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-slate-500">
                    {inventoryTypeLabel(doc.inventory_type)} · {inventoryDocumentStatusLabel(doc.status)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                    <span>{doc.coverage_percent}%</span>
                    <span>·</span>
                    <span>
                      {doc.operator_count} op. / {doc.conflict_count} konf.
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">
                    {fmtActivity(doc.last_activity_at ?? doc.updated_at)}
                  </p>
                </div>
                <span
                  className={`${WMS_INV.btnCta} ${!canCount ? "pointer-events-none opacity-60" : ""}`}
                  aria-hidden
                >
                  {ctaLabel}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
