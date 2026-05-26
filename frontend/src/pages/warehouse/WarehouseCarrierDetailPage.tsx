import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  emptyWmsCarrier,
  getWmsCarrier,
  listWmsCarrierLogs,
  type WarehouseCarrierDetailRead,
  type WarehouseCarrierLogRead,
} from "../../api/wmsCarrierApi";
import { CarrierBadge } from "../../components/warehouse/carriers/CarrierBadge";
import { CarrierItemsTable } from "../../components/warehouse/carriers/CarrierItemsTable";
import { CarrierStatusBadge } from "../../components/warehouse/carriers/CarrierStatusBadge";
import {
  useWarehouseCarriersPaths,
  useWarehouseCarriersSurface,
  useWarehouseCarriersTenant,
} from "./warehouseCarriersTenant";
import { openCarrierLabelPrint } from "../../utils/carrierLabelPrint";
import { carrierOperationLabel } from "../../components/warehouse/carriers/carrierOperationLabels";

export default function WarehouseCarrierDetailPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const navigate = useNavigate();
  const surface = useWarehouseCarriersSurface();
  const paths = useWarehouseCarriersPaths(surface);
  const { tenantId, setTenantId, tenants, tenantSelectVisible } = useWarehouseCarriersTenant(surface);

  const [detail, setDetail] = useState<WarehouseCarrierDetailRead | null>(null);
  const [logs, setLogs] = useState<WarehouseCarrierLogRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(id) || id < 1) {
      setErr("Nieprawidłowy identyfikator nośnika.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const d = await getWmsCarrier(tenantId, id);
      setDetail(d);
      setLogs(await listWmsCarrierLogs(tenantId, id));
    } catch {
      setErr("Nie udało się wczytać nośnika.");
      setDetail(null);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onEmpty = async () => {
    if (!detail || busy) return;
    if (!window.confirm("Opróżnić nośnik?")) return;
    setBusy(true);
    try {
      const d = await emptyWmsCarrier(tenantId, detail.id);
      setDetail({ ...detail, ...d, items: [] });
      setLogs(await listWmsCarrierLogs(tenantId, id));
    } catch {
      window.alert("Operacja nie powiodła się.");
    } finally {
      setBusy(false);
    }
  };

  const listLinkState = { tenantId };

  return (
    <div className="p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            to={paths.list}
            state={listLinkState}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft size={22} />
          </Link>
          <button type="button" onClick={() => navigate(-1)} className="text-sm font-bold text-indigo-700 hover:underline">
            Wstecz
          </button>
          {tenantSelectVisible ? (
            <label className="ml-auto flex items-center gap-2 text-sm font-bold text-slate-700">
              <span className="text-xs font-bold uppercase text-slate-500">Podmiot</span>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(Number(e.target.value) || 1)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || `Tenant #${t.id}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {loading ? (
          <p className="py-12 text-center text-slate-500">Wczytywanie…</p>
        ) : err || !detail ? (
          <p className="py-12 text-center font-bold text-red-600">{err || "Brak danych"}</p>
        ) : (
          <>
            <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-black text-slate-900">{detail.code}</h1>
                  <p className="mt-1 font-mono text-sm text-slate-600">{detail.barcode}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <CarrierBadge code={detail.code} showMix={detail.is_mixed} />
                    <CarrierStatusBadge status={detail.status} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openCarrierLabelPrint(detail)}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100"
                  >
                    <Printer size={18} />
                    Drukuj etykietę
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onEmpty()}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                  >
                    Opróżnij
                  </button>
                </div>
              </div>
              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase text-slate-500">Status</dt>
                  <dd className="mt-1">
                    <CarrierStatusBadge status={detail.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-slate-500">Lokalizacja</dt>
                  <dd className="mt-1 font-mono text-lg font-semibold text-slate-900">
                    {(detail.current_location_code || "").trim() || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-slate-500">Typ (grupa)</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900">{(detail.carrier_group_code || "—").trim()}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-slate-500">Mix</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900">{detail.is_mixed ? "Tak" : "Nie"}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-slate-500">
                Przesunięcie, rozlokowanie z poziomu WMS (PZ / putaway) oraz rozbicie / scalenie — w kolejnych
                iteracjach API.
              </p>
            </header>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-500">Produkty na nośniku</h2>
              <CarrierItemsTable items={detail.items} />
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-500">Dziennik</h2>
              {logs.length === 0 ? (
                <p className="text-sm text-slate-600">Brak wpisów.</p>
              ) : (
                <ul className="max-h-80 space-y-3 overflow-y-auto text-sm">
                  {logs.map((lg) => (
                    <li key={lg.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-bold text-slate-900">
                          {carrierOperationLabel(lg.operation_type, lg.operation_type_label)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {lg.created_at ? new Date(lg.created_at).toLocaleString("pl-PL") : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">{lg.performed_by_name || "—"}</span>
                        {lg.performed_by_user_id != null ? ` · user #${lg.performed_by_user_id}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
