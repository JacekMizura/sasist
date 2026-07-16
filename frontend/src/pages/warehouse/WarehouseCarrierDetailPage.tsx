import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Printer } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { catalogEntityCardShellClass } from "../../components/catalog/CatalogEntityPageShell";
import {
  emptyWmsCarrier,
  getWmsCarrier,
  listWmsCarrierLogs,
  type WarehouseCarrierDetailRead,
  type WarehouseCarrierLogRead,
} from "../../api/wmsCarrierApi";
import { CarrierItemsTable } from "../../components/warehouse/carriers/CarrierItemsTable";
import { CarrierStatusBadge } from "../../components/warehouse/carriers/CarrierStatusBadge";
import { CarrierIdentity } from "../../components/warehouse/carriers/CarrierIdentity";
import { CarrierLocationLink } from "../../components/warehouse/carriers/CarrierLocationLink";
import { carrierOperationLabel } from "../../components/warehouse/carriers/carrierOperationLabels";
import {
  useWarehouseCarriersPaths,
  useWarehouseCarriersSurface,
  useWarehouseCarriersTenant,
} from "./warehouseCarriersTenant";
import { openCarrierLabelPrint } from "../../utils/carrierLabelPrint";
import { cartsSectionClass } from "../../modules/carts/cartsModuleTokens";
import { wmsBtnSecondary, wmsSectionTitle } from "../../modules/carts/wmsOperationalUi";

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

  const noopSubmit = (e: FormEvent) => e.preventDefault();

  if (loading) {
    return (
      <div className={`${catalogEntityCardShellClass} flex min-h-[40vh] items-center justify-center text-[15px] text-slate-500`}>
        Wczytywanie nośnika…
      </div>
    );
  }

  if (err || !detail) {
    return (
      <div className={`${catalogEntityCardShellClass} p-8 text-center text-red-600`}>{err || "Brak danych"}</div>
    );
  }

  const lastLog = logs[0];
  const groupLabel = (detail.carrier_group_code || "—").trim();

  return (
    <form onSubmit={noopSubmit} className={`${catalogEntityCardShellClass} overflow-hidden`}>
        <header className="border-b border-slate-200 bg-white px-4 py-2.5 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CarrierIdentity carrier={detail} size="lg" />
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px]">
                <span className="font-medium text-slate-600">{groupLabel}</span>
                <CarrierStatusBadge status={detail.status} />
                <CarrierLocationLink
                  tenantId={tenantId}
                  locationCode={detail.current_location_code}
                  locationId={detail.current_location_id}
                  carrierId={detail.id}
                />
                <span className="text-[15px] font-black tabular-nums text-slate-900">{detail.total_qty} szt.</span>
                <span className="text-[14px] font-bold tabular-nums text-slate-600">{detail.sku_count} SKU</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {tenantSelectVisible ? (
                <select
                  value={tenantId}
                  onChange={(e) => setTenantId(Number(e.target.value) || 1)}
                  className="rounded-md border border-slate-300 px-2 py-2 text-[14px]"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || `Podmiot #${t.id}`}
                    </option>
                  ))}
                </select>
              ) : null}
              <Link to={paths.list} state={{ tenantId }} className={wmsBtnSecondary}>
                Lista
              </Link>
              <button type="button" onClick={() => openCarrierLabelPrint(detail)} className={wmsBtnSecondary}>
                <Printer className="mr-1.5 h-4 w-4" />
                Etykieta
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onEmpty()}
                className="inline-flex h-10 items-center rounded-md border border-red-200 bg-white px-4 text-[14px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Opróżnij
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-3 p-3 sm:p-4">
          {(lastLog || detail.notes) && (
            <section className={`${cartsSectionClass} grid gap-3 sm:grid-cols-2`}>
              {lastLog ? (
                <div>
                  <h3 className={wmsSectionTitle}>Ostatnia operacja</h3>
                  <p className="mt-2 text-[15px] font-bold text-slate-900">
                    {carrierOperationLabel(lastLog.operation_type, lastLog.operation_type_label)}
                  </p>
                  <p className="mt-1 text-[13px] text-slate-600">
                    {lastLog.created_at ? new Date(lastLog.created_at).toLocaleString("pl-PL") : "—"}
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-slate-800">
                    Operator: {lastLog.performed_by_name || "—"}
                  </p>
                </div>
              ) : null}
              {detail.notes ? (
                <div>
                  <h3 className={wmsSectionTitle}>Opis operacyjny</h3>
                  <p className="mt-2 text-[15px] text-slate-800">{detail.notes}</p>
                </div>
              ) : null}
            </section>
          )}

          <section className={cartsSectionClass}>
            <h3 className={wmsSectionTitle}>Produkty na nośniku</h3>
            <div className="mt-3">
              <CarrierItemsTable items={detail.items} tenantId={tenantId} />
            </div>
          </section>

          <section className={cartsSectionClass}>
            <h3 className={wmsSectionTitle}>Historia ruchów</h3>
            {logs.length === 0 ? (
              <p className="mt-3 text-[14px] text-slate-600">Brak wpisów.</p>
            ) : (
              <ul className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
                {logs.map((lg) => (
                  <li key={lg.id} className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2.5">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-[14px] font-bold text-slate-900">
                        {carrierOperationLabel(lg.operation_type, lg.operation_type_label)}
                      </span>
                      <span className="text-[13px] text-slate-500">
                        {lg.created_at ? new Date(lg.created_at).toLocaleString("pl-PL") : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-slate-600">{lg.performed_by_name || "—"}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex justify-end border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          <button type="button" onClick={() => navigate(-1)} className={wmsBtnSecondary}>
            Wstecz
          </button>
        </footer>
    </form>
  );
}
