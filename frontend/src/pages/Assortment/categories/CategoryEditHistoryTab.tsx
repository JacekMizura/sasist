import ActivityLogPanel from "../../../components/activityLog/ActivityLogPanel";
import { pimHintClass, pimPanelClass } from "../pimUi";

type Props = {
  categoryId: number;
  refreshKey?: number;
};

/**
 * Category change history via shared activity log.
 */
export function CategoryEditHistoryTab({ categoryId, refreshKey = 0 }: Props) {
  return (
    <section className={pimPanelClass}>
      <h2 className="text-sm font-semibold text-slate-900">Historia</h2>
      <p className={pimHintClass}>Zmiany kategorii (utworzenie / aktualizacja) trafiają do dziennika aktywności.</p>
      <div className="mt-4">
        <ActivityLogPanel
          objectType="product_category"
          objectId={categoryId}
          title="Historia czynności"
          defaultCollapsed={false}
          refreshKey={refreshKey}
        />
      </div>
    </section>
  );
}
