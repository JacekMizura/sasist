import api from "../api/axios";
import { fetchUser, type MeResponse } from "../api/authApi";
import { DAMAGE_TENANT_ID } from "../constants/panelTenant";

export type LoginCodeLabelRecord = {
  barcode_login_code: string;
  user_login: string;
  user_full_name: string;
  user_first_name: string;
  user_last_name: string;
  barcode_data: string;
  "{barcode_login_code}": string;
  "{user_login}": string;
  "{user_full_name}": string;
  "{user_first_name}": string;
  "{user_last_name}": string;
};

export function buildLoginCodeLabelRecord(u: {
  login: string;
  first_name?: string | null;
  last_name?: string | null;
  barcode_login_code: string;
}): LoginCodeLabelRecord {
  const first = (u.first_name ?? "").trim();
  const last = (u.last_name ?? "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim() || u.login;
  const code = u.barcode_login_code.trim();
  return {
    barcode_login_code: code,
    user_login: u.login,
    user_full_name: full,
    user_first_name: first || u.login,
    user_last_name: last,
    barcode_data: code,
    "{barcode_login_code}": code,
    "{user_login}": u.login,
    "{user_full_name}": full,
    "{user_first_name}": first || u.login,
    "{user_last_name}": last,
  };
}

export function generateBarcodeLoginCode(loginHint?: string): string {
  const prefix = (loginHint || "MAG")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase();
  const body = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix || "MAG"}${body}`.slice(0, 16);
}

async function resolveLoginCodeTemplateId(
  preferredId: number | null | undefined,
): Promise<number> {
  if (preferredId != null && Number.isFinite(preferredId)) {
    return Number(preferredId);
  }
  const res = await api.get<Array<{ id: number; name?: string }>>("/label-templates/by-type/user_login", {
    params: { tenant_id: DAMAGE_TENANT_ID },
  });
  const rows = res.data ?? [];
  if (!rows.length) {
    throw new Error("NO_LOGIN_CODE_TEMPLATE");
  }
  return rows[0].id;
}

export async function renderUserLoginCodePdf(args: {
  userId: number;
  templateId?: number | null;
}): Promise<Blob> {
  const u: MeResponse = await fetchUser(args.userId);
  const code = (u.wms_profile?.barcode_login_code || "").trim();
  if (!code) {
    throw new Error("NO_LOGIN_CODE");
  }
  const preferred =
    args.templateId ??
    (u.wms_profile as { login_code_label_template_id?: number | null } | undefined)
      ?.login_code_label_template_id ??
    null;
  const templateId = await resolveLoginCodeTemplateId(preferred);
  const record = buildLoginCodeLabelRecord({
    login: u.login,
    first_name: u.first_name,
    last_name: u.last_name,
    barcode_login_code: code,
  });
  const res = await api.post(
    "/labels/render-pdf",
    { template_id: templateId, records: [record] },
    { params: { tenant_id: DAMAGE_TENANT_ID }, responseType: "blob" },
  );
  return new Blob([res.data], { type: "application/pdf" });
}

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function printOrDownloadUserLoginCode(args: {
  userId: number;
  login?: string;
  templateId?: number | null;
}): Promise<"ok"> {
  const blob = await renderUserLoginCodePdf(args);
  downloadPdfBlob(blob, `kod-logowania-${args.login || args.userId}.pdf`);
  return "ok";
}
