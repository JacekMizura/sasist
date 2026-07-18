/** Shared panel Activity Log — object history timeline. */

export type ActivitySeverity = "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "AUDIT";

export type ActivityObjectType =
  | "cart"
  | "order"
  | "basket"
  | "rack"
  | "carrier"
  | "product"
  | "operator"
  | "document"
  | "return"
  | "production";

export type ActivityLink = {
  object_type: string;
  object_id: number;
  role?: string | null;
  object_label?: string | null;
  href?: string | null;
};

export type ActivityEventItem = {
  id: number;
  event_code: string;
  description: string;
  severity: ActivitySeverity | string;
  category: string;
  occurred_at: string | null;
  actor_user_id: number | null;
  actor_name: string | null;
  source_module: string | null;
  metadata: Record<string, unknown>;
  links: ActivityLink[];
};

export type ActivityLogResponse = {
  object_type: string;
  object_id: number;
  items: ActivityEventItem[];
};

export type ActivityLogQuery = {
  objectType: ActivityObjectType | string;
  objectId: number;
  limit?: number;
  severity?: string;
  category?: string;
  actorUserId?: number;
  dateFrom?: string;
  dateTo?: string;
};
