/** Edge Device Registry — UI abstraction over all local device types. */

export type EdgeDeviceType =
  | "printer"
  | "scanner"
  | "scale"
  | "camera"
  | "rfid"
  | "usb"
  | "serial"
  | "custom";

export type EdgeDeviceStatus =
  | "online"
  | "offline"
  | "error"
  | "warning"
  | "busy"
  | "idle"
  | "unknown";

export type CapabilityDescriptor = {
  name: string;
  version: string;
  supported_operations: string[];
  limits?: Record<string, unknown> | null;
};

export type DeviceConfiguration = {
  values: Record<string, unknown>;
  configuration_version: string;
  updated_at?: string | null;
};

export type DeviceHealth = {
  health_score: number;
  warnings?: string[];
  errors?: string[];
  recommended_actions?: string[];
};

export type EdgeDevice = {
  id: string;
  type: EdgeDeviceType | string;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  driver?: string | null;
  firmware?: string | null;
  status: EdgeDeviceStatus | string;
  capabilities: CapabilityDescriptor[];
  last_seen?: string | null;
  metadata?: Record<string, unknown>;
  agent_id?: number | null;
  module_id?: string | null;
  display_name?: string | null;
  is_active?: boolean;
  is_default?: boolean;
  configuration?: DeviceConfiguration | null;
  health?: DeviceHealth | null;
  configuration_version?: string | null;
  legacy_printer_id?: number | null;
  registry_id?: number | null;
};

export type EdgeModule = {
  id: string;
  agent_id: number;
  agent_name?: string | null;
  machine_id?: string | null;
  state: string;
  version?: string | null;
  device_count: number;
  capabilities: string[];
  last_seen?: string | null;
  is_online: boolean;
  last_error?: string | null;
  metadata?: Record<string, unknown>;
};

export type EdgeDeviceEvent = {
  id: number;
  agent_id: number;
  device_id?: string | null;
  event_type: string;
  module_id?: string | null;
  device_type?: string | null;
  occurred_at: string;
  payload?: Record<string, unknown>;
};

export type EdgeDeviceAction = {
  id: number;
  agent_id: number;
  correlation_id: string;
  action: string;
  module_id?: string | null;
  device_id?: string | null;
  status: string;
  parameters?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

export const EDGE_DEVICE_TYPE_LABELS: Record<EdgeDeviceType, string> = {
  printer: "Drukarki",
  scanner: "Skanery",
  scale: "Wagi",
  camera: "Kamery",
  rfid: "RFID",
  usb: "USB",
  serial: "Serial",
  custom: "Inne",
};

export const EDGE_DEVICE_STATUS_LABELS: Record<EdgeDeviceStatus, string> = {
  online: "Online",
  offline: "Offline",
  error: "Błąd",
  warning: "Ostrzeżenie",
  busy: "Zajęte",
  idle: "Bezczynne",
  unknown: "Nieznany",
};

export function filterDevicesByType(devices: EdgeDevice[], type: EdgeDeviceType | "all"): EdgeDevice[] {
  if (type === "all") return devices;
  return devices.filter((d) => d.type === type);
}

export function deviceDisplayName(d: EdgeDevice): string {
  return d.display_name || d.model || d.id;
}
