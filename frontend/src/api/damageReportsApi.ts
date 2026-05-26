import axios from "axios";

import api from "./axios";
import { normalizeWmsUploadUrl } from "./damageUploadApi";
import type {
  DamageEntry,
  DamageEntryCreatePayload,
  DamageEntryReviewPayload,
  DamageReport,
  DamageReportCreatePayload,
  DamageType,
} from "../types/damageReport";

const DAMAGE_TYPE_VALUES: DamageType[] = ["mechanical", "missing_parts", "flood", "other"];

function normalizeDamageType(v: unknown): DamageType {
  if (typeof v === "string" && (DAMAGE_TYPE_VALUES as string[]).includes(v)) return v as DamageType;
  return "other";
}

/**
 * Normalize evidence URLs for POST /damage-entries/. Only `/uploads/…`. Rejects data:/blob:/http(s).
 */
export function coercePhotoUrlForDamageEntry(u: unknown): string | null {
  const s0 = typeof u === "string" ? u.trim() : String(u ?? "").trim();
  if (!s0 || s0.length > 4096) return null;
  const head = s0.slice(0, 8).toLowerCase();
  if (head.startsWith("data:") || head.startsWith("blob:")) return null;
  if (head.startsWith("http://") || head.startsWith("https://")) return null;
  const s = s0.startsWith("uploads/") ? `/${s0}` : s0;
  return normalizeWmsUploadUrl(s);
}

/** Build body matching `DamageEntryCreate` — only `photo_urls` (no `photo_url`). */
function normalizeDamageEntryCreatePayload(p: DamageEntryCreatePayload): Record<string, unknown> {
  const raw = (p.photo_urls ?? [])
    .map((u) => coercePhotoUrlForDamageEntry(u))
    .filter((x): x is string => x != null);
  const photo_urls = [...new Set(raw)].slice(0, 15);

  const tenant_id = Number(p.tenant_id);
  const warehouse_id = Number(p.warehouse_id);
  const product_id = Number(p.product_id);
  const quantity = Number(p.quantity);
  const location_uuid = String(p.location_uuid ?? "").trim();
  const damage_type = normalizeDamageType(p.damage_type);

  const out: Record<string, unknown> = {
    tenant_id,
    warehouse_id,
    product_id,
    quantity,
    damage_type,
    photo_urls,
  };
  if (location_uuid) out.location_uuid = location_uuid;

  const cb = p.created_by?.trim();
  if (cb) out.created_by = cb;

  return out;
}

export async function listDamageReports(tenantId: number, warehouseId?: number | null): Promise<DamageReport[]> {
  const res = await api.get<DamageReport[]>("/damage-reports/", {
    params: {
      tenant_id: tenantId,
      ...(warehouseId != null ? { warehouse_id: warehouseId } : {}),
    },
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function getDamageReport(reportId: number, tenantId: number): Promise<DamageReport> {
  const res = await api.get<DamageReport>(`/damage-reports/${reportId}`, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function createDamageReport(payload: DamageReportCreatePayload): Promise<DamageReport> {
  const res = await api.post<DamageReport>("/damage-reports/", payload);
  return res.data;
}

export async function confirmDamageReport(reportId: number, tenantId: number): Promise<DamageReport> {
  const res = await api.post<DamageReport>(`/damage-reports/${reportId}/confirm`, null, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function listDamageEntries(
  tenantId: number,
  warehouseId?: number | null,
  statuses?: string[]
): Promise<DamageEntry[]> {
  const res = await api.get<DamageEntry[]>("/damage-entries/", {
    params: {
      tenant_id: tenantId,
      ...(warehouseId != null ? { warehouse_id: warehouseId } : {}),
      ...(statuses?.length ? { statuses: statuses.join(",") } : {}),
    },
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function createDamageEntry(payload: DamageEntryCreatePayload): Promise<DamageEntry> {
  const body = normalizeDamageEntryCreatePayload(payload);

  console.log("FINAL PAYLOAD", body);

  try {
    const res = await api.post<DamageEntry>("/damage-entries/", body);
    return res.data;
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      console.log("ERROR RESPONSE", e.response?.data);
    }
    throw e;
  }
}

export async function reviewDamageEntry(
  entryId: number,
  tenantId: number,
  payload: DamageEntryReviewPayload
): Promise<DamageEntry> {
  const res = await api.post<DamageEntry>(`/damage-entries/${entryId}/review`, payload, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}
