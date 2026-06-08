import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Loader2 } from "lucide-react";

import { fetchWmsActiveInventoryDocuments, type WmsActiveInventoryDocumentRead } from "@/api/inventoryCountApi";
import {
  inventoryDocumentStatusLabel,
  inventoryMovementPolicyLabel,
  inventoryTypeLabel,
} from "@/modules/inventoryCount/inventoryCountUiLabels";
import { erpInventoryCountPaths, wmsInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import { setActiveInventoryDocumentId } from "@/modules/inventoryCount/wmsActiveDocumentStorage";
import { WMS_INV } from "@/modules/inventoryCount/wmsIndustrialTheme";
import { useAuth } from "@/context/AuthContext";
import { useWarehouse } from "@/context/WarehouseContext";

const TENANT_ID = 1;

function fmtActivity(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function WmsInventoryCountLandingPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { warehouse } = useWarehouse();
  const canCreateDocument = hasPermission("inventory.submit");
  const warehouseId = warehouse?.id;
  const tenantId = TENANT_ID;
  const [docs, setDocs] = useState<WmsActiveInventoryDocumentRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    setErr(null);
    try {
      const items = await fetchWmsActiveInventoryDocuments(tenantId, warehouseId);
      setDocs(items);
    } catch {
      setErr("Nie udało się wczytać aktywnych inwentaryzacji.");
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
    return <p className={`py-4 text-sm font-bold ${WMS_INV.textMuted}`}>Wybierz magazyn.</p>;
  }

  return (
    <div className={WMS_INV.shell}>
      <h1 className={`${WMS_INV.textLabel} mb-2`}>Inwentaryzacja</h1>
      <p className="mb-3 text-[11px] text-slate-500">Wybierz aktywny dokument, aby rozpocząć liczenie w magazynie.</p>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </p>
      ) : null}
      {err ? <p className="text-xs text-rose-600">{err}</p> : null}

      {!loading && docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-slate-300" strokeWidth={1.5} />
          <p className="mt-2 text-sm font-bold text-slate-700">Brak aktywnych inwentaryzacji</p>
          <p className="mt-1 text-xs text-slate-500">
            W magazynie nie ma dokumentów w trakcie liczenia ani oczekujących zatwierdzenia.
          </p>
          {canCreateDocument ? (
            <Link
              to={erpInventoryCountPaths.wizard}
              className="mt-3 inline-block rounded-md bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white"
            >
              Utwórz dokument
            </Link>
          ) : null}
        </div>
      ) : null}

      <ul className="space-y-2">
        {docs.map((doc) => {
          const canCount = doc.can_count;
          const movement = doc.movement_policy ?? doc.lock_mode;
          return (
            <li key={doc.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-slate-900">{doc.number}</p>
                  <p className="truncate text-sm font-semibold text-slate-800">{doc.title?.trim() || "—"}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {inventoryTypeLabel(doc.inventory_type)} · {inventoryDocumentStatusLabel(doc.status)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canCount}
                  onClick={() => openDocument(doc)}
                  className="shrink-0 rounded-md bg-[#1e4d8c] px-3 py-1.5 text-[11px] font-bold text-white disabled:bg-slate-300"
                >
                  {canCount
                    ? doc.counted_lines > 0
                      ? "Kontynuuj liczenie"
                      : "Rozpocznij liczenie"
                    : "Do zatwierdzenia"}
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-600 sm:grid-cols-4">
                <span>Zakres: {doc.scope_summary || "—"}</span>
                <span>Postęp: {doc.coverage_percent}%</span>
                <span>Operatorzy: {doc.operator_count}</span>
                <span>Konflikty: {doc.conflict_count}</span>
                <span className="col-span-2 sm:col-span-4">Ruchy: {inventoryMovementPolicyLabel(movement)}</span>
                <span className="col-span-2 sm:col-span-4">
                  Ostatnia aktywność: {fmtActivity(doc.last_activity_at ?? doc.updated_at)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
