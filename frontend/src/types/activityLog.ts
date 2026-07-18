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

export type ActivityDetailRow = {
  label: string;
  value: string;
};

/** Ready-to-display entry from backend — FE must not translate codes. */
export type ActivityEventItem = {
  id: number;
  event_code: string;
  description: string;
  /** Full action sentence (same as description when provided by API). */
  action?: string;
  severity: ActivitySeverity | string;
  category: string;
  occurred_at: string | null;
  occurred_at_display?: string;
  actor_user_id: number | null;
  actor_name: string | null;
  operator_display?: string;
  source_module: string | null;
  metadata: Record<string, unknown>;
  details?: ActivityDetailRow[];
  order_numbers?: string[];
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
