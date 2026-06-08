import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  fetchWmsActiveInventoryDocuments,
  type WmsActiveInventoryDocumentRead,
} from "@/api/inventoryCountApi";
import { wmsInventoryCountPaths } from "../../inventoryCountPaths";
import { setActiveInventoryDocumentId } from "../../wmsActiveDocumentStorage";
import { useWarehouse } from "@/context/WarehouseContext";

const TENANT_ID = 1;

/** Sticky WMS header — switch between active inventory documents. */
export default function WmsInventoryDocumentSwitcher() {
  const navigate = useNavigate();
  const { documentId: documentIdParam } = useParams();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id;
  const tenantId = TENANT_ID;
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<WmsActiveInventoryDocumentRead[]>([]);
  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  const activeId = documentIdParam ? Number(documentIdParam) : null;
  const current = docs.find((d) => d.id === activeId) ?? null;

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

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!warehouseId) return null;

  if (loading && docs.length === 0) {
    return (
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white py-1.5 text-[11px] text-slate-400">
        Inwentaryzacja…
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white py-1.5">
        <span className="text-[11px] font-bold text-slate-500">Inwentaryzacja</span>
        <Link to={wmsInventoryCountPaths.root} className="text-[10px] font-semibold text-[#1e4d8c] underline">
          Lista
        </Link>
      </div>
    );
  }

  const label = current
    ? `${current.number}${current.title?.trim() ? ` · ${current.title.trim()}` : ""}`
    : "Wybierz dokument";

  const switchDoc = (doc: WmsActiveInventoryDocumentRead) => {
    setOpen(false);
    setActiveInventoryDocumentId(warehouseId, doc.id);
    navigate(wmsInventoryCountPaths.document(doc.id));
  };

  return (
    <div ref={rootRef} className="relative sticky top-0 z-30 border-b border-slate-200 bg-white py-1.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">Inwentaryzacja</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        </button>
        <Link to={wmsInventoryCountPaths.root} className="shrink-0 text-[10px] font-semibold text-slate-500 underline">
          Lista
        </Link>
      </div>
      {open ? (
        <ul className="absolute left-0 right-0 z-40 mt-0.5 max-h-48 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {docs.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => switchDoc(d)}
                className={`w-full px-3 py-2 text-left text-[11px] hover:bg-slate-50 ${
                  d.id === activeId ? "bg-slate-100 font-bold" : ""
                }`}
              >
                <span className="font-mono">{d.number}</span>
                {d.title?.trim() ? <span className="text-slate-600"> · {d.title.trim()}</span> : null}
                <span className="block text-[10px] text-slate-400">
                  {d.coverage_percent}% · {d.status === "in_progress" ? "Liczenie" : "Do zatwierdzenia"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
