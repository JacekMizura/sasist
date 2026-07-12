export type AgentHealthStatus = "online" | "stale" | "offline";

export type PrinterAgentRead = {
  id: number;
  tenant_id: number;
  warehouse_id: number | null;
  machine_id: string;
  name: string;
  version: string | null;
  last_seen_at: string | null;
  last_poll_at: string | null;
  last_error: string | null;
  is_online: boolean;
  health_status: AgentHealthStatus;
  printer_count: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PrinterAgentDiagnosticsRead = {
  version: string | null;
  latest_version: string | null;
  last_heartbeat: string | null;
  last_poll: string | null;
  printer_count: number;
  config_version: string | null;
  machine_id: string;
  warehouse_id: number | null;
  update_available: boolean;
};

export type AgentPrinterRead = {
  id: number;
  agent_id: number;
  name: string;
  system_name: string;
  printer_type: string;
  is_default: boolean;
  is_active: boolean;
  agent_name?: string | null;
  machine_id?: string | null;
  agent_is_online?: boolean;
  agent_health_status?: AgentHealthStatus;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PrintingDefaultsRead = {
  tenant_id: number;
  warehouse_id: number | null;
  a4_printer_id: number | null;
  label_printer_id: number | null;
  receipt_printer_id: number | null;
};

export type PrinterAssignmentRepairRead = {
  defaults_remapped: number;
  jobs_migrated: number;
  primary_agent_id: number;
  primary_machine_id: string;
};

export type QueuePrintRequest = {
  document_type: "stock_document" | "sale_document" | "label";
  document_id?: number | null;
  document_id_str?: string | null;
  warehouse_id?: number | null;
  template_version_id?: number | null;
  copies?: number;
  label?: {
    template_id: number;
    records: Record<string, unknown>[];
    exclude_floors?: string[] | null;
    printer_profile_id?: number | null;
    template_json?: string | null;
    print_mode?: boolean;
    group_mode?: boolean;
    group_by_rack?: boolean;
    floor_sets?: string[][] | null;
  } | null;
};

export type PrintJobStatus =
  | "pending"
  | "processing"
  | "printed"
  | "failed"
  | "cancelled";

export type PrintingAutoPrintRead = {
  tenant_id: number;
  labels: boolean;
  stock_documents: boolean;
  sale_documents: boolean;
  shipping_labels: boolean;
};

export type PrintJobRead = {
  id: number;
  tenant_id: number;
  warehouse_id: number | null;
  printer_id: number;
  printer_name?: string | null;
  agent_id?: number | null;
  agent_name?: string | null;
  machine_id?: string | null;
  document_type: string;
  document_id: number | null;
  payload_json: Record<string, unknown> | string;
  status: PrintJobStatus | string;
  error_message?: string | null;
  copies: number;
  parent_job_id?: number | null;
  retry_number: number;
  source_module?: string | null;
  job_type?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_seconds?: number | null;
  retry_count?: number | null;
};

export type PrintJobParentSummary = {
  id: number;
  status: string;
  retry_number: number;
  created_at?: string | null;
};

export type PrintJobDetailRead = PrintJobRead & {
  parent_job?: PrintJobParentSummary | null;
};

export type PrinterAgentDownloadInfo = {
  download_url: string;
  latest_version: string;
  source?: "github" | "env" | "fallback";
};
