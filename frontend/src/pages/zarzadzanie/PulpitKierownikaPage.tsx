import { ManagerDecisionsPanel } from "./ManagerDecisionsPanel";
import { PulpitActionAlerts } from "./PulpitActionAlerts";
import { PulpitCrewLoad } from "./PulpitCrewLoad";
import { PulpitSecondaryLinks } from "./PulpitSecondaryLinks";
import { PulpitWarehouseStatus } from "./PulpitWarehouseStatus";
import { usePulpitOpsSummary } from "./usePulpitOpsSummary";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { useSupplyFlowPlan } from "../wms/supply-flow/hooks/useSupplyFlowPlan";

/**
 * Strona główna Zarządzania magazynem.
 * Prowadzi zmianę: decyzje → stan → alerty → obciążenie. Bez Centrum Operacyjnego.
 */
export default function PulpitKierownikaPage() {
  const { hasActiveWarehouse, warehouseId } = useActiveWarehouseContext();
  const { board, loading, refreshing, error, refresh } = useSupplyFlowPlan(
    hasActiveWarehouse ? warehouseId : null,
  );
  const { summary: ops, loading: opsLoading } = usePulpitOpsSummary(
    hasActiveWarehouse ? warehouseId : null,
  );

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Pulpit kierownika</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Zacznij od decyzji — reszta to tylko kontekst zmiany.
        </p>
      </header>

      <section aria-labelledby="pulpit-decyzje">
        <h2 id="pulpit-decyzje" className="mb-3 text-sm font-black uppercase tracking-wide text-slate-800">
          Co wymaga decyzji
        </h2>
        <ManagerDecisionsPanel
          board={board}
          loading={loading}
          refreshing={refreshing}
          error={error}
          refresh={refresh}
          warehouseId={warehouseId}
          hasActiveWarehouse={hasActiveWarehouse}
        />
      </section>

      <section aria-labelledby="pulpit-stan">
        <h2 id="pulpit-stan" className="mb-2 text-sm font-black uppercase tracking-wide text-slate-800">
          Stan magazynu
        </h2>
        <PulpitWarehouseStatus state={board.warehouseState} ops={ops} />
      </section>

      <section aria-labelledby="pulpit-alerty">
        <h2 id="pulpit-alerty" className="mb-3 text-sm font-black uppercase tracking-wide text-slate-800">
          Alerty
        </h2>
        <PulpitActionAlerts alerts={board.alerts} blockedOrders={ops?.blocked_orders ?? 0} />
      </section>

      <section aria-labelledby="pulpit-operatorzy">
        <h2 id="pulpit-operatorzy" className="mb-3 text-sm font-black uppercase tracking-wide text-slate-800">
          Operatorzy i obciążenie
        </h2>
        <PulpitCrewLoad ops={ops} loading={opsLoading} />
      </section>

      <PulpitSecondaryLinks />
    </div>
  );
}
