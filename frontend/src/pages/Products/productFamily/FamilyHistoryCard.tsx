import ActivityLogPanel from "../../../components/activityLog/ActivityLogPanel";
import { pimHintClass, pimPanelClass } from "../../Assortment/pimUi";

type Props = {
  familyId: number;
  refreshKey?: number;
};

/**
 * Family activity timeline (attach / generate events when logged on BE).
 */
export function FamilyHistoryCard({ familyId, refreshKey = 0 }: Props) {
  return (
    <section className={pimPanelClass}>
      <h2 className="text-sm font-semibold text-slate-900">Historia</h2>
      <p className={pimHintClass}>
        Operacje na rodzinie (przypisanie, generator, zmiany) w dzienniku aktywności.
      </p>
      <div className="mt-4">
        <ActivityLogPanel
          objectType="product_family"
          objectId={familyId}
          title="Historia czynności"
          defaultCollapsed={false}
          refreshKey={refreshKey}
        />
      </div>
    </section>
  );
}
