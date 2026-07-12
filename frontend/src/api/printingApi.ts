import api from "./axios";
import type {
  AgentPrinterRead,
  PrintJobDetailRead,
  PrintJobRead,
  PrinterAgentDownloadInfo,
  PrinterAgentRead,
  PrintingAutoPrintRead,
  PrintingDefaultsRead,
  QueuePrintRequest,
} from "../types/printing";
import type { PrintJobStatusFilter } from "../pages/Settings/printing/printingQueuePresentation";

export async function fetchPrintingAgents(
  tenantId: number,
  warehouseId?: number | null,
): Promise<PrinterAgentRead[]> {
  const { data } = await api.get<PrinterAgentRead[]>("/printing/agents", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId ?? undefined },
  });
  return Array.isArray(data) ? data : [];
}

/** Best-effort — returns null when endpoint is unavailable or URL is invalid. */
export async function fetchPrinterAgentDownloadInfo(
  tenantId: number,
): Promise<PrinterAgentDownloadInfo | null> {
  try {
    const { data } = await api.get<PrinterAgentDownloadInfo>("/printing/agent/download-info", {
      params: { tenant_id: tenantId },
    });
    if (!data?.download_url) return null;
    return data;
  } catch {
    return null;
  }
}

export async function fetchSystemPrinters(
  tenantId: number,
  opts?: { warehouseId?: number | null; onlineOnly?: boolean },
): Promise<string[]> {
  const { data } = await api.get<string[]>("/printing/printers/system", {
    params: {
      tenant_id: tenantId,
      warehouse_id: opts?.warehouseId ?? undefined,
      online_only: opts?.onlineOnly ?? undefined,
    },
  });
  return Array.isArray(data) ? data.filter((name) => typeof name === "string" && name.trim()) : [];
}

export async function fetchAgentPrinters(
  tenantId: number,
  opts?: { warehouseId?: number | null; agentId?: number | null },
): Promise<AgentPrinterRead[]> {
  const { data } = await api.get<AgentPrinterRead[]>("/printing/printers", {
    params: {
      tenant_id: tenantId,
      warehouse_id: opts?.warehouseId ?? undefined,
      agent_id: opts?.agentId ?? undefined,
    },
  });
  return Array.isArray(data) ? data : [];
}

export async function patchAgentPrinter(
  tenantId: number,
  printerId: number,
  body: Partial<Pick<AgentPrinterRead, "name" | "printer_type" | "is_default" | "is_active">>,
): Promise<AgentPrinterRead> {
  const { data } = await api.patch<AgentPrinterRead>(`/printing/printers/${printerId}`, body, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function fetchPrintingDefaults(
  tenantId: number,
  warehouseId?: number | null,
): Promise<PrintingDefaultsRead> {
  const { data } = await api.get<PrintingDefaultsRead>("/printing/defaults", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId ?? undefined },
  });
  return data;
}

export async function updatePrintingDefaults(
  tenantId: number,
  body: {
    warehouse_id?: number | null;
    a4_printer_id?: number | null;
    label_printer_id?: number | null;
    receipt_printer_id?: number | null;
  },
  warehouseId?: number | null,
): Promise<PrintingDefaultsRead> {
  const { data } = await api.put<PrintingDefaultsRead>("/printing/defaults", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId ?? undefined },
  });
  return data;
}

export async function queuePrintJob(
  tenantId: number,
  body: QueuePrintRequest,
): Promise<PrintJobRead> {
  const { data } = await api.post<PrintJobRead>("/printing/jobs/queue", body, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function fetchPrintJobs(
  tenantId: number,
  opts?: {
    warehouseId?: number | null;
    status?: PrintJobStatusFilter;
    q?: string;
    limit?: number;
  },
): Promise<PrintJobRead[]> {
  const { data } = await api.get<PrintJobRead[]>("/printing/jobs", {
    params: {
      tenant_id: tenantId,
      warehouse_id: opts?.warehouseId ?? undefined,
      status: opts?.status && opts.status !== "all" ? opts.status : undefined,
      q: opts?.q?.trim() || undefined,
      limit: opts?.limit,
    },
  });
  return Array.isArray(data) ? data : [];
}

export async function fetchPrintJob(
  tenantId: number,
  jobId: number,
): Promise<PrintJobDetailRead> {
  const { data } = await api.get<PrintJobDetailRead>(`/printing/jobs/${jobId}`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function retryPrintJob(tenantId: number, jobId: number): Promise<PrintJobRead> {
  const { data } = await api.post<PrintJobRead>(`/printing/jobs/${jobId}/retry`, null, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function cancelPrintJob(tenantId: number, jobId: number): Promise<PrintJobRead> {
  const { data } = await api.post<PrintJobRead>(`/printing/jobs/${jobId}/cancel`, null, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function deletePrintJob(tenantId: number, jobId: number): Promise<PrintJobRead> {
  const { data } = await api.delete<PrintJobRead>(`/printing/jobs/${jobId}`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function sendAgentTestPage(tenantId: number, agentId: number): Promise<PrintJobRead> {
  const { data } = await api.post<PrintJobRead>(`/printing/agents/${agentId}/test-page`, null, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function fetchPrintJobsByDocument(
  tenantId: number,
  opts: {
    documentType: "stock_document" | "sale_document";
    documentId: number;
    warehouseId?: number | null;
  },
): Promise<PrintJobRead[]> {
  const { data } = await api.get<PrintJobRead[]>("/printing/jobs/by-document", {
    params: {
      tenant_id: tenantId,
      document_type: opts.documentType,
      document_id: opts.documentId,
      warehouse_id: opts.warehouseId ?? undefined,
    },
  });
  return Array.isArray(data) ? data : [];
}

export async function fetchPrintingAutoPrint(tenantId: number): Promise<PrintingAutoPrintRead> {
  const { data } = await api.get<PrintingAutoPrintRead>("/printing/auto-print", {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function updatePrintingAutoPrint(
  tenantId: number,
  body: Partial<Omit<PrintingAutoPrintRead, "tenant_id">>,
): Promise<PrintingAutoPrintRead> {
  const { data } = await api.put<PrintingAutoPrintRead>("/printing/auto-print", body, {
    params: { tenant_id: tenantId },
  });
  return data;
}
