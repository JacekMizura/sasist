/** WMS workstations — business types (no API jargon). */

export type StationType =
  | "picking"
  | "packing"
  | "receiving"
  | "returns"
  | "production"
  | "qc"
  | "shipping"
  | "other";

/** @deprecated Use PrintProfile — legacy per-document buckets. */
export type PrintType = "shipping_label" | "invoice" | "labels" | "order" | "other";

export type PrintProfile = "LABELS" | "DOCUMENTS" | "SHIPPING_LABELS" | "REPORTS";

export type ConnectionStatus = "connected" | "offline" | "unpaired";

export type WorkstationAgentSummary = {
  id: number;
  computer_name: string;
  machine_id: string;
  os: string | null;
  agent_version: string | null;
  last_ip: string | null;
  last_seen_at: string | null;
  created_at?: string | null;
  uptime_seconds?: number | null;
  is_online: boolean;
  status: "online" | "offline" | "stale";
};

export type WorkstationListItem = {
  id: number;
  name: string;
  station_type: StationType | string;
  station_type_label: string;
  warehouse_id: number;
  warehouse_name: string | null;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  connection_status: ConnectionStatus;
  computer_name: string | null;
  device_count: number;
  last_sync_at: string | null;
  agent: WorkstationAgentSummary | null;
  /** Display name of the preferred mapped printer on this station. */
  default_printer_name?: string | null;
};

export type WorkstationDetail = WorkstationListItem & {
  pairing_active: boolean;
  pairing_expires_at: string | null;
};

export type PairingResponse = {
  pairing_code: string;
  expires_at: string;
  message: string;
};

export type DeviceItem = {
  id: number;
  name: string;
  device_kind: string;
  status: string;
  last_seen_at: string | null;
  agent_printer_id: number | null;
  detail: string | null;
};

export type DevicesGrouped = {
  printers: DeviceItem[];
  scanners: DeviceItem[];
  scales: DeviceItem[];
  cameras: DeviceItem[];
  rfid: DeviceItem[];
  barcode_readers: DeviceItem[];
  other: DeviceItem[];
};

export type PrinterOption = {
  id: number;
  name: string;
  system_name: string | null;
  status: string;
  is_online: boolean;
};

export type PrinterMappingRow = {
  print_profile: PrintProfile | string;
  print_profile_label: string;
  print_profile_icon?: string | null;
  /** @deprecated Prefer print_profile */
  print_type?: PrintType | string;
  /** @deprecated Prefer print_profile_label */
  print_type_label?: string;
  agent_printer_id: number | null;
  printer_name: string | null;
  status: string | null;
};

export type PrintersConfig = {
  mappings: PrinterMappingRow[];
  available_printers: PrinterOption[];
};

export type HistoryEvent = {
  id: number;
  event_type: string;
  title: string;
  detail: string | null;
  created_at: string;
};

export const STATION_TYPE_OPTIONS: { value: StationType; label: string }[] = [
  { value: "picking", label: "Kompletacja" },
  { value: "packing", label: "Pakowanie" },
  { value: "receiving", label: "Przyjęcia" },
  { value: "returns", label: "Zwroty" },
  { value: "production", label: "Produkcja" },
  { value: "qc", label: "Kontrola jakości" },
  { value: "shipping", label: "Wysyłka" },
  { value: "other", label: "Inne" },
];

export const STATION_TYPE_STYLE: Record<
  string,
  { emoji: string; className: string }
> = {
  picking: { emoji: "🛒", className: "bg-blue-50 text-blue-800 ring-blue-200" },
  packing: { emoji: "📦", className: "bg-orange-50 text-orange-800 ring-orange-200" },
  receiving: { emoji: "⬇", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  returns: { emoji: "↩", className: "bg-violet-50 text-violet-800 ring-violet-200" },
  production: { emoji: "⚙", className: "bg-slate-100 text-slate-700 ring-slate-300" },
  qc: { emoji: "🛡", className: "bg-teal-50 text-teal-800 ring-teal-200" },
  shipping: { emoji: "🚚", className: "bg-indigo-50 text-indigo-800 ring-indigo-200" },
  other: { emoji: "📍", className: "bg-slate-50 text-slate-600 ring-slate-200" },
};
