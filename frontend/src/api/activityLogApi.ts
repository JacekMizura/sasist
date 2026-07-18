import api from "./axios";
import type { ActivityLogQuery, ActivityLogResponse } from "../types/activityLog";

export async function fetchActivityLog(q: ActivityLogQuery): Promise<ActivityLogResponse> {
  const res = await api.get<ActivityLogResponse>("/activity-log", {
    params: {
      object_type: q.objectType,
      object_id: q.objectId,
      limit: q.limit ?? 100,
      severity: q.severity,
      category: q.category,
      actor_user_id: q.actorUserId,
      date_from: q.dateFrom,
      date_to: q.dateTo,
    },
  });
  return {
    object_type: res.data.object_type,
    object_id: res.data.object_id,
    items: Array.isArray(res.data.items) ? res.data.items : [],
  };
}
