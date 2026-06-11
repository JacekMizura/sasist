import api from "./axios";

import type {
  ComplaintDetail,
  ComplaintListItem,
  ComplaintProcessStatus,
  ComplaintStatusCode,
  ComplaintStatusSummaryDto,
} from "../types/complaint";

function complaintQueryParams(tenantId: number, warehouseId?: number): Record<string, number> {
  const p: Record<string, number> = { tenant_id: tenantId };
  if (warehouseId != null) p.warehouse_id = warehouseId;
  return p;
}

export type ListComplaintsParams = {
  tenant_id: number;
  warehouse_id?: number;
  q?: string;
  limit?: number;
  offset?: number;
  sort_by?: "id" | "title" | "created_at" | "deadline_urgency";
  sort_dir?: "asc" | "desc";
  /** Dokładny status z API: NOWE | WERYFIKACJA | … */
  status?: ComplaintStatusCode;
};

export type CreateComplaintFromOrderPayload = {
  order_id: number;
  lines: {
    order_item_id: number;
    quantity: number;
    defect_ids?: string[] | null;
    defects?: string[] | null;
    reasons?: string[] | null;
    complaint_reasons?: string[] | null;
  }[];
  note?: string | null;
  photo_urls?: string[] | null;
  defect_ids?: string[] | null;
};

function normalizeLineDefectIds(line: Record<string, unknown>): string[] {
  const pools: unknown[] = [line.defect_ids, line.defects, line.reasons, line.complaint_reasons];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: unknown) => {
    const s = String(v ?? "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  for (const pool of pools) {
    if (!pool) continue;
    if (Array.isArray(pool)) {
      for (const item of pool) {
        if (typeof item === "string") push(item);
        else if (item && typeof item === "object") {
          const row = item as Record<string, unknown>;
          push(row.id ?? row.value ?? row.name ?? row.label);
        }
      }
    }
  }
  return out;
}

function normalizeComplaintDetail(raw: ComplaintDetail): ComplaintDetail {
  const lines = Array.isArray(raw.lines) ? raw.lines : [];
  const nextLines = lines.map((ln) => {
    const anyLine = ln as Record<string, unknown>;
    const normalizedDefects = normalizeLineDefectIds(anyLine);
    const defectObjects = Array.isArray(anyLine.defects)
      ? (anyLine.defects as { id?: string; name?: string }[])
          .map((d) => ({ id: String(d?.id ?? "").trim(), name: String(d?.name ?? d?.id ?? "").trim() }))
          .filter((d) => d.id && d.name)
      : normalizedDefects.map((id) => ({ id, name: id }));
    return {
      ...ln,
      defect_ids: normalizedDefects,
      defects: defectObjects,
      customer_photos: Array.isArray(anyLine.customer_photos) ? (anyLine.customer_photos as string[]).filter(Boolean) : [],
      warehouse_photos: Array.isArray(anyLine.warehouse_photos) ? (anyLine.warehouse_photos as string[]).filter(Boolean) : [],
    };
  });
  if (import.meta.env.DEV) console.log("[complaints] fetched lines", nextLines);
  return { ...raw, lines: nextLines };
}

export type CreateComplaintFromOrderFiles = {
  complaintPhotos?: File[] | null;
  /** Zdjęcia per pozycja zamówienia — pola multipart `line_photo_{order_item_id}`. */
  linePhotos?: { order_item_id: number; files: File[] }[] | null;
};

export async function getComplaintStatusSummary(
  tenantId: number,
  warehouseId?: number,
): Promise<ComplaintStatusSummaryDto> {
  const sp = new URLSearchParams();
  sp.set("tenant_id", String(tenantId));
  if (warehouseId != null) sp.set("warehouse_id", String(warehouseId));
  const res = await api.get<ComplaintStatusSummaryDto>(`/complaints/status-summary?${sp.toString()}`);
  return res.data;
}

export async function listComplaints(params: ListComplaintsParams): Promise<{ items: ComplaintListItem[]; total: number }> {
  const sp = new URLSearchParams();
  sp.set("tenant_id", String(params.tenant_id));
  if (params.warehouse_id != null) sp.set("warehouse_id", String(params.warehouse_id));
  if (params.q?.trim()) sp.set("q", params.q.trim());
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.offset != null) sp.set("offset", String(params.offset));
  if (params.sort_by) sp.set("sort_by", params.sort_by);
  if (params.sort_dir) sp.set("sort_dir", params.sort_dir);
  if (params.status) sp.set("status", params.status);
  const res = await api.get<ComplaintListItem[]>(`/complaints/?${sp.toString()}`);
  const totalHeader = res.headers?.["x-total-count"];
  const total = totalHeader != null ? parseInt(String(totalHeader), 10) : (Array.isArray(res.data) ? res.data.length : 0);
  return { items: Array.isArray(res.data) ? res.data : [], total };
}

export async function getComplaint(id: number, tenantId: number, warehouseId?: number): Promise<ComplaintDetail> {
  const res = await api.get<ComplaintDetail>(`/complaints/${id}/`, {
    params: complaintQueryParams(tenantId, warehouseId),
  });
  return normalizeComplaintDetail(res.data);
}

export type ComplaintDeleteResult = {
  success: boolean;
  mode: "archived" | "deleted";
};

export async function softDeleteComplaint(
  id: number,
  tenantId: number,
  warehouseId?: number,
): Promise<ComplaintDeleteResult> {
  const res = await api.delete<ComplaintDeleteResult>(`/complaints/${id}/`, {
    params: complaintQueryParams(tenantId, warehouseId),
  });
  return res.data ?? { success: true, mode: "archived" };
}

export async function patchComplaintStatus(
  id: number,
  tenantId: number,
  warehouseId: number | undefined,
  status: ComplaintStatusCode | ComplaintProcessStatus,
): Promise<ComplaintDetail> {
  const res = await api.patch<ComplaintDetail>(
    `/complaints/${id}/status`,
    { status },
    { params: complaintQueryParams(tenantId, warehouseId) },
  );
  return normalizeComplaintDetail(res.data);
}

export type ComplaintDecisionPatchPayload = {
  major_defect?: boolean;
  repair_failed?: boolean;
  replacement_failed?: boolean;
  operational_decision?: string | null;
  financial_decision?: string | null;
  defect_ids?: string[] | null;
};

export async function patchComplaintDecisions(
  id: number,
  tenantId: number,
  warehouseId: number | undefined,
  body: ComplaintDecisionPatchPayload,
): Promise<ComplaintDetail> {
  const res = await api.patch<ComplaintDetail>(`/complaints/${id}/decisions`, body, {
    params: complaintQueryParams(tenantId, warehouseId),
  });
  return res.data;
}

export type ComplaintResolutionPayload = {
  resolution_type: "REPLACEMENT" | "REFUND" | "PARTIAL_REFUND" | "REJECTION";
  resolution_amount?: number | null;
  resolution_currency?: string | null;
};

export async function patchComplaintResolution(
  id: number,
  tenantId: number,
  warehouseId: number | undefined,
  body: ComplaintResolutionPayload,
): Promise<ComplaintDetail> {
  const res = await api.patch<ComplaintDetail>(`/complaints/${id}/resolution`, body, {
    params: complaintQueryParams(tenantId, warehouseId),
  });
  return res.data;
}

export async function regenerateComplaintDocuments(
  id: number,
  tenantId: number,
  warehouseId: number | undefined,
  types?: ("DECISION" | "CORRECTION" | "RMA")[] | null,
): Promise<ComplaintDetail> {
  const res = await api.post<ComplaintDetail>(
    `/complaints/${id}/documents/regenerate`,
    types?.length ? { types } : {},
    { params: complaintQueryParams(tenantId, warehouseId) },
  );
  return res.data;
}

export type ComplaintPanelPhotoKind = "customer" | "warehouse" | "defect_evidence";

export async function uploadComplaintPanelPhotos(
  complaintId: number,
  tenantId: number,
  warehouseId: number | undefined,
  files: File[],
  photoKind?: ComplaintPanelPhotoKind,
  isWmsView = false,
  complaintItemId?: number,
): Promise<ComplaintDetail> {
  const resolvedPhotoKind: ComplaintPanelPhotoKind = photoKind ?? (isWmsView ? "warehouse" : "customer");
  if (import.meta.env.DEV) console.log("[complaints] upload photo_kind", resolvedPhotoKind, "complaint_item_id", complaintItemId);
  const fd = new FormData();
  for (const f of files) {
    if (f && f.size > 0) fd.append("photos", f, f.name?.trim() || "image.jpg");
  }
  const qp: Record<string, string | number> = {
    ...complaintQueryParams(tenantId, warehouseId),
    photo_kind: resolvedPhotoKind,
    ...(Number.isFinite(complaintItemId) ? { complaint_item_id: complaintItemId as number } : {}),
  };
  const res = await api.post<ComplaintDetail>(`/complaints/${complaintId}/photos`, fd, {
    params: qp,
    transformRequest: [(data, headers) => {
      if (data instanceof FormData) {
        delete headers["Content-Type"];
      }
      return data;
    }],
  });
  return res.data;
}

export type ComplaintWmsUpdateItemPayload = {
  item_id: string;
  note_warehouse?: string | null;
  photos?: string[] | null;
  /** Cała lista URL zdjęć pozycji — zastępuje zapis (np. po usunięciu zdjęcia). */
  replace_photos?: boolean;
};

export async function wmsUpdateComplaintItems(
  complaintId: number,
  tenantId: number,
  warehouseId: number | undefined,
  items: ComplaintWmsUpdateItemPayload[],
): Promise<ComplaintDetail> {
  const res = await api.post<ComplaintDetail>(
    `/complaints/${complaintId}/wms-update`,
    { items },
    { params: complaintQueryParams(tenantId, warehouseId) },
  );
  return res.data;
}

export type ComplaintLinePatchPayload = {
  status?: ComplaintStatusCode;
  decision?: string | null;
  operation_status?: string | null;
  exchange_kind?: string | null;
  settlement_type?: string | null;
  settlement_amount?: number | null;
  settlement_currency?: string | null;
};

export async function patchComplaintLine(
  complaintId: number,
  lineId: number,
  tenantId: number,
  warehouseId: number | undefined,
  body: ComplaintLinePatchPayload,
): Promise<ComplaintDetail> {
  const res = await api.patch<ComplaintDetail>(`/complaints/${complaintId}/lines/${lineId}`, body, {
    params: complaintQueryParams(tenantId, warehouseId),
  });
  return normalizeComplaintDetail(res.data);
}

export type ComplaintPhysicalReceiptMode = "WAREHOUSE" | "SERVICE_FORWARD" | "DIRECT_SERVICE";

export async function patchComplaintPhysicalReceiptMode(
  complaintId: number,
  tenantId: number,
  warehouseId: number | undefined,
  physicalReceiptMode: ComplaintPhysicalReceiptMode,
): Promise<ComplaintDetail> {
  const res = await api.patch<ComplaintDetail>(
    `/complaints/${complaintId}/physical-receipt-mode`,
    { physical_receipt_mode: physicalReceiptMode },
    { params: complaintQueryParams(tenantId, warehouseId) },
  );
  return normalizeComplaintDetail(res.data);
}

/** Fizyczny odbiór towaru reklamacyjnego — linia Z-PZ (QUARANTINE). */
export async function receiveComplaintLineWarehouse(
  complaintId: number,
  lineId: number,
  tenantId: number,
  warehouseId: number | undefined,
): Promise<ComplaintDetail> {
  const res = await api.post<ComplaintDetail>(
    `/complaints/${complaintId}/lines/${lineId}/warehouse-receive`,
    {},
    { params: complaintQueryParams(tenantId, warehouseId) },
  );
  return normalizeComplaintDetail(res.data);
}

/** Operacja fizyczna pozycji reklamacji — PATCH /complaint-lines/:id/operation */
export async function updateLineOperation(
  lineId: number,
  tenantId: number,
  warehouseId: number | undefined,
  action: string,
): Promise<ComplaintDetail> {
  const res = await api.patch<ComplaintDetail>(
    `/complaint-lines/${lineId}/operation`,
    { action },
    { params: complaintQueryParams(tenantId, warehouseId) },
  );
  return res.data;
}

export type ComplaintLogisticsAction =
  | "mark_received"
  | "set_inspection"
  | "send_to_service"
  | "return_from_service";

export type ComplaintLogisticsPatchPayload = {
  action: ComplaintLogisticsAction;
  service_rma?: string | null;
  expected_return_date?: string | null;
};

export async function patchComplaintLogistics(
  id: number,
  tenantId: number,
  warehouseId: number | undefined,
  body: ComplaintLogisticsPatchPayload,
): Promise<ComplaintDetail> {
  const res = await api.patch<ComplaintDetail>(`/complaints/${id}/logistics`, body, {
    params: complaintQueryParams(tenantId, warehouseId),
  });
  return res.data;
}

/** @deprecated używaj patchComplaintStatus */
export const patchComplaintProcessStatus = patchComplaintStatus;

export async function createComplaintFromOrder(
  body: CreateComplaintFromOrderPayload,
  tenantId: number,
  warehouseId: number | undefined,
  files?: CreateComplaintFromOrderFiles | null,
): Promise<ComplaintDetail> {
  const params = complaintQueryParams(tenantId, warehouseId);
  const complaintPhotos = (files?.complaintPhotos ?? []).filter((f) => f && f.size > 0);
  const lineGroups = files?.linePhotos ?? [];
  const lineFileTuples: { order_item_id: number; file: File }[] = [];
  for (const g of lineGroups) {
    for (const f of g.files ?? []) {
      if (f && f.size > 0) lineFileTuples.push({ order_item_id: g.order_item_id, file: f });
    }
  }
  const useMultipart = complaintPhotos.length > 0 || lineFileTuples.length > 0;
  const normalizedLines = body.lines.map((line) => {
    const defectIds = normalizeLineDefectIds(line as unknown as Record<string, unknown>);
    return {
      order_item_id: line.order_item_id,
      quantity: line.quantity,
      defect_ids: defectIds.length ? defectIds : null,
      defects: defectIds.length ? defectIds : null,
    };
  });
  if (useMultipart) {
    const fd = new FormData();
    fd.append(
      "data",
      JSON.stringify({
        order_id: body.order_id,
        lines: normalizedLines,
        note: body.note ?? null,
        photo_urls: body.photo_urls ?? null,
        defect_ids: body.defect_ids?.length ? body.defect_ids : null,
      }),
    );
    for (const f of complaintPhotos) {
      const name = f.name?.trim() || "image.jpg";
      fd.append("photos", f, name);
    }
    for (const { order_item_id, file: f } of lineFileTuples) {
      const name = f.name?.trim() || "image.jpg";
      fd.append(`line_photo_${order_item_id}`, f, name);
    }
    if (import.meta.env.DEV) {
      console.log(
        "[complaints] from-order FormData",
        { complaint: complaintPhotos.length, lines: lineFileTuples.length, line_defects: normalizedLines },
        complaintPhotos.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      );
    }
    const res = await api.post<ComplaintDetail>(`/complaints/from-order`, fd, {
      params,
      transformRequest: [(data, headers) => {
        if (data instanceof FormData) {
          delete headers["Content-Type"];
        }
        return data;
      }],
    });
    return normalizeComplaintDetail(res.data);
  }
  if (import.meta.env.DEV) {
    console.log("[complaints] create from-order payload", {
      ...body,
      lines: body.lines.map((line) => ({
        order_item_id: line.order_item_id,
        quantity: line.quantity,
        defect_ids: line.defect_ids ?? line.defects ?? line.reasons ?? line.complaint_reasons ?? null,
      })),
    });
  }
  const res = await api.post<ComplaintDetail>(
    `/complaints/from-order`,
    { ...body, lines: normalizedLines },
    { params },
  );
  return normalizeComplaintDetail(res.data);
}
