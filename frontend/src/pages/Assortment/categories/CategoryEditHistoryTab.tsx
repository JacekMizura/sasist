import ActivityLogPanel from "../../../components/activityLog/ActivityLogPanel";
import { FormSection } from "../../../design-system";

type Props = {
  categoryId: number;
  refreshKey?: number;
};

/**
 * Category change history via shared activity log.
 */
export function CategoryEditHistoryTab({ categoryId, refreshKey = 0 }: Props) {
  return (
    <FormSection
      title="Historia"
      description="Zmiany kategorii (utworzenie / aktualizacja) trafiają do dziennika aktywności."
    >
      <ActivityLogPanel
        objectType="product_category"
        objectId={categoryId}
        title="Historia czynności"
        defaultCollapsed={false}
        refreshKey={refreshKey}
      />
    </FormSection>
  );
}
