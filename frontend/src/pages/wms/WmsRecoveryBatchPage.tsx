import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, MapPin, Package } from "lucide-react";
import { extractApiErrorMessage } from "../../api/authApi";
import { getWmsRecoveryBatch, type WmsRecoveryBatchSessionApi } from "../../api/wmsRecoveryBatchApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWarehouseExecution } from "../../context/WarehouseExecutionContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WMS_ROUTES } from "./wmsRoutes";

/** Ekran grupowej dogrywki — trasa po lokalizacjach, wiele zamówień. */
export default function WmsRecoveryBatchPage() {
  const { batchId: batchIdParam } = useParams();
  const batchId = Number(batchIdParam);
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { setActiveContext } = useWarehouseExecution();

  const [batch, setBatch] = useState<WmsRecoveryBatchSessionApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(batchId) || batchId < 1) {
      setErr("Nieprawidłowa sesja batch.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await getWmsRecoveryBatch(DAMAGE_TENANT_ID, batchId);
      setBatch(data);
    } catch (e: unknown) {
      setBatch(null);
      setErr(extractApiErrorMessage(e, "Nie udało się wczytać batch dogrywki."));
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!batch) {
      setActiveContext(null);
      return;
    }
    setActiveContext({
      operationType: batch.label || "DOGRYWKA BATCH",
      currentStep: `${batch.order_count} zamówień · ${batch.line_count} linii`,
      scanHint: "Wybierz lokalizację lub zamówienie do dogrywki",
    });
    return () => setActiveContext(null);
  }, [batch, setActiveContext]);

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-600">
        Wybierz magazyn w nagłówku.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <Loader2 className="h-10 w-10 animate-spin" />
        <p className="mt-3 text-sm">Ładowanie trasy dogrywki…</p>
      </div>
    );
  }

  if (err || !batch) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6">
        <p className="text-center font-medium text-red-800">{err ?? "Błąd"}</p>
        <Link to={WMS_ROUTES.braki()} className="font-semibold text-blue-600 underline">
          Wróć do Braki
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 pb-24">
      <header className="border-b border-slate-200 bg-white px-4 py-4 md:px-6">
        <Link to={WMS_ROUTES.braki()} className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Braki
        </Link>
        <h1 className="mt-2 text-2xl font-black text-slate-900">{batch.label}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {batch.order_count} zamówień · {batch.line_count} linii · {batch.route_groups.length} lokalizacji
        </p>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Zamówienia w batch</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {batch.order_ids.map((oid) => (
              <button
                key={oid}
                type="button"
                onClick={() => navigate(WMS_ROUTES.pickingRecovery(oid))}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-900 hover:bg-indigo-100"
              >
                #{oid}
              </button>
            ))}
          </div>
        </section>

        {batch.route_groups.map((grp) => (
          <section
            key={grp.location_code}
            className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                <MapPin size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-mono text-lg font-black text-slate-900">{grp.location_code}</h3>
                <p className="text-sm text-slate-600">
                  {grp.line_count} linii · zamówienia: {grp.order_ids.map((id) => `#${id}`).join(", ")}
                </p>
                <ul className="mt-3 space-y-2">
                  {grp.lines.slice(0, 8).map((ln, idx) => (
                    <li
                      key={`${grp.location_code}-${idx}`}
                      className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <Package size={14} className="shrink-0 text-slate-400" />
                      <span className="font-semibold text-slate-800">
                        {(ln.product_name as string) || `SKU ${ln.product_id}`}
                      </span>
                      <span className="text-slate-500">#{ln.order_id as number}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
