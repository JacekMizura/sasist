import ActivityLogTable from "./ActivityLogTable";
import type { ActivityObjectType } from "../../types/activityLog";

type ActivityLogPanelProps = {
  objectType: ActivityObjectType | string;
  objectId: number | null | undefined;
  title?: string;
  defaultCollapsed?: boolean;
  refreshKey?: number;
  className?: string;
};

/**
 * Thin wrapper — one Activity Log standard (table: Data | Operator | Akcja).
 * Prefer importing ActivityLogTable directly in new screens.
 */
export default function ActivityLogPanel({
  objectType,
  objectId,
  title = "Historia czynności",
  defaultCollapsed = true,
  refreshKey = 0,
  className = "",
}: ActivityLogPanelProps) {
  return (
    <ActivityLogTable
      objectType={objectType}
      objectId={objectId}
      title={title}
      defaultCollapsed={defaultCollapsed}
      refreshKey={refreshKey}
      className={className}
    />
  );
}
