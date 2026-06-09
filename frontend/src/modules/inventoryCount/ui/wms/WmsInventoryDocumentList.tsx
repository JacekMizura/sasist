import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { fetchWmsActiveInventoryDocuments, type WmsActiveInventoryDocumentRead } from "@/api/inventoryCountApi";
import {
  inventoryDocumentStatusLabel,
  inventoryTypeLabel,
} from "@/modules/inventoryCount/inventoryCountUiLabels";
import { wmsInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import { setActiveInventoryDocumentId } from "@/modules/inventoryCount/wmsActiveDocumentStorage";
import { useWarehouse } from "@/context/WarehouseContext";
import { WMS_OPERATIONAL_CONTAINER } from "@/components/wms/execution/wmsLayoutTokens";

const TENANT_ID = 1;

function fmtActivity(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function InventoryDocCard({
  doc,
  onOpen,
}: {
  doc: WmsActiveInventoryDocumentRead;
  onOpen: (doc: WmsActiveInventoryDocumentRead) => void;
}) {
  const canCount = doc.can_count;
  const ctaLabel = !canCount ? "Do zatwierdzenia" : doc.counted_lines > 0 ? "Kontynuuj" : "Liczenie";

  return (
    <button
      type="button"
      disabled={!canCount}
      onClick={() => onOpen(doc)}
      className="flex h-full flex-col rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-[#5a4fcf]/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="mb-4 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-600">
          <ClipboardList size={24} strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-mono text-lg font-black leading-none text-slate-900">{doc.number}</h3>
          {doc.title?.trim() ? (
            <p className="mt-1 truncate text-sm font-semibold text-slate-600">{doc.title.trim()}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-600">
              {inventoryTypeLabel(doc.inventory_type)}
            </span>
            <span className="inline-flex items-center rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-700">
              {inventoryDocumentStatusLabel(doc.status)}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-4 space-y-1 text-xs text-slate-500">
        <p>
          Pokrycie <strong className="text-slate-700">{doc.coverage_percent}%</strong>
        </p>
        <p>
          {doc.operator_count} operatorów · {doc.conflict_count} konfliktów
        </p>
        <p className="text-[11px] text-slate-400">{fmtActivity(doc.last_activity_at ?? doc.updated_at)}</p>
      </div>

      <div className="mt-auto border-t border-slate-100 pt-4">
        <span className="inline-flex w-full items-center justify-center rounded-xl bg-[#23438e] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white">
          {ctaLabel}
        </span>
      </div>
    </button>
  );
}

/** Start screen — active inventory documents (fullscreen queue, no sidebar). */
export default function WmsInventoryDocumentList() {
  const navigate = useNavigate();
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
      <div className={`${WMS_OPERATIONAL_CONTAINER} py-12`}>
        <p className="text-sm font-bold text-slate-500">Wybierz magazyn, aby rozpocząć inwentaryzację.</p>
      </div>
    );
  }

  return (
    <div className={`${WMS_OPERATIONAL_CONTAINER} py-6 sm:py-8`}>
      <div className="mb-8">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Inwentaryzacja WMS</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Wybierz dokument do liczenia</h1>
        <p className="mt-2 text-sm font-medium text-slate-500">
          Zeskanuj lokalizację i policz stany w wybranym dokumencie inwentaryzacji.
        </p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie dokumentów…
        </p>
      ) : null}

      {!loading && docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-slate-300" strokeWidth={1.5} />
          <p className="mt-4 text-sm font-bold text-slate-700">Brak aktywnych inwentaryzacji</p>
          <p className="mt-1 text-xs text-slate-500">W tym magazynie nie ma dokumentów do liczenia.</p>
        </div>
      ) : null}

      {!loading && docs.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {docs.map((doc) => (
            <InventoryDocCard key={doc.id} doc={doc} onOpen={openDocument} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
