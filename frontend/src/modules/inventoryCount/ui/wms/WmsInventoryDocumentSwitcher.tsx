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
import { WMS_INV } from "./theme";

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
      <div className={`${WMS_INV.docSwitcherBar} z-10`}>
        <span className="text-xs text-slate-400">Inwentaryzacja…</span>
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className={`${WMS_INV.docSwitcherBar} z-10`}>
        <span className="text-xs font-bold text-slate-500">Inwentaryzacja</span>
        <Link to={wmsInventoryCountPaths.root} className="text-xs font-semibold text-[#23438e] underline">
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
    <div ref={rootRef} className={`relative ${WMS_INV.docSwitcherBar} z-10`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={WMS_INV.docSwitcherBtn}
      >
        <ChevronDown className="h-4 w-4 rotate-90 text-slate-400" />
        <span className="truncate max-w-[min(100vw-8rem,32rem)]">{label}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <Link
        to={wmsInventoryCountPaths.root}
        className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600"
      >
        Lista
      </Link>
      {open ? (
        <ul className="absolute left-4 right-4 top-full z-40 mt-1 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg sm:left-6 sm:right-auto sm:min-w-[20rem]">
          {docs.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => switchDoc(d)}
                className={`w-full px-4 py-3 text-left text-sm hover:bg-slate-50 ${
                  d.id === activeId ? "bg-slate-50 font-bold" : ""
                }`}
              >
                <span className="font-mono text-slate-800">{d.number}</span>
                {d.title?.trim() ? <span className="text-slate-600"> · {d.title.trim()}</span> : null}
                <span className="mt-0.5 block text-xs text-slate-400">
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
