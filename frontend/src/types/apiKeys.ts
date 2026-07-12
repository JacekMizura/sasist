export type ApiKeyType = "printer_agent" | "integration" | "public_api" | "webhook";

export type ApiKeyStatus = "active" | "disabled" | "revoked" | "expired";

export type ApiKeyScope =
  | "printing.agent"
  | "printing.read"
  | "orders.read"
  | "orders.write"
  | "products.read"
  | "products.write"
  | "warehouse.read"
  | "warehouse.write"
  | "api.full_access";

export type ApiKeyRead = {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  key_prefix: string;
  type: ApiKeyType;
  scopes: ApiKeyScope[];
  warehouse_id: number | null;
  warehouse_name: string | null;
  allowed_ips: string[];
  created_by: number | null;
  created_by_user_id: number | null;
  created_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  last_used_user_agent: string | null;
  usage_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  is_active: boolean;
  status: ApiKeyStatus;
};

export type ApiKeyUsageRead = {
  created_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  last_used_user_agent: string | null;
  total_usage_count: number;
};

export type ApiKeyCreateBody = {
  name: string;
  type: ApiKeyType;
  description?: string | null;
  warehouse_id?: number | null;
  scopes?: ApiKeyScope[] | null;
  allowed_ips?: string[] | null;
  expires_at?: string | null;
};

export const API_KEY_TYPE_LABELS: Record<ApiKeyType, string> = {
  printer_agent: "Printer Agent",
  integration: "Integration",
  public_api: "Public API",
  webhook: "Webhook",
};

export const API_KEY_STATUS_LABELS: Record<ApiKeyStatus, string> = {
  active: "Aktywny",
  disabled: "Wyłączony",
  revoked: "Unieważniony",
  expired: "Wygasły",
};

export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  "printing.agent": "Printer Agent",
  "printing.read": "Drukowanie (odczyt)",
  "orders.read": "Zamówienia (odczyt)",
  "orders.write": "Zamówienia (zapis)",
  "products.read": "Produkty (odczyt)",
  "products.write": "Produkty (zapis)",
  "warehouse.read": "Magazyn (odczyt)",
  "warehouse.write": "Magazyn (zapis)",
  "api.full_access": "Pełny dostęp API",
};

export const DEFAULT_SCOPES_BY_TYPE: Record<ApiKeyType, ApiKeyScope[]> = {
  printer_agent: ["printing.agent"],
  integration: ["orders.read", "products.read", "warehouse.read"],
  public_api: ["api.full_access"],
  webhook: ["orders.read"],
};
