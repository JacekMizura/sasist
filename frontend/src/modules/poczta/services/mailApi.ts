import api from "../../../api/axios";

export type MailAccountDto = {
  id: number;
  tenant_id: number;
  name: string;
  email_address: string;
  imap_host: string | null;
  imap_port: number | null;
  imap_security: string | null;
  imap_username: string | null;
  has_imap_password: boolean;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_security: string | null;
  smtp_username: string | null;
  has_smtp_password: boolean;
  is_send_only: boolean;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_uid: number;
  last_sync_error: string | null;
};

export type MailSetupStatus = {
  has_accounts: boolean;
  has_active_accounts: boolean;
  has_conversations: boolean;
  account_count: number;
};

export type MailAccountPayload = {
  tenant_id: number;
  name: string;
  email_address: string;
  imap_host?: string | null;
  imap_port?: number | null;
  imap_security?: string | null;
  imap_username?: string | null;
  imap_password?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_security?: string | null;
  smtp_username?: string | null;
  smtp_password?: string | null;
  is_send_only?: boolean;
  is_active?: boolean;
};

export async function fetchMailSetupStatus(tenantId: number): Promise<MailSetupStatus> {
  const res = await api.get<MailSetupStatus>("/mail/setup-status", { params: { tenant_id: tenantId } });
  return res.data;
}

export async function listMailAccounts(tenantId: number): Promise<MailAccountDto[]> {
  const res = await api.get<MailAccountDto[]>("/mail/accounts", { params: { tenant_id: tenantId } });
  return res.data;
}

export async function createMailAccount(payload: MailAccountPayload): Promise<MailAccountDto> {
  const res = await api.post<MailAccountDto>("/mail/accounts", payload);
  return res.data;
}

export async function updateMailAccount(
  accountId: number,
  tenantId: number,
  payload: Partial<MailAccountPayload>,
): Promise<MailAccountDto> {
  const res = await api.patch<MailAccountDto>(`/mail/accounts/${accountId}`, payload, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function deactivateMailAccount(accountId: number, tenantId: number): Promise<MailAccountDto> {
  const res = await api.post<MailAccountDto>(`/mail/accounts/${accountId}/deactivate`, null, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function testMailAccountConnection(
  accountId: number,
  tenantId: number,
  overrides?: Partial<MailAccountPayload>,
): Promise<{ ok: boolean; message: string; imap_ok?: boolean | null; smtp_ok?: boolean | null }> {
  const res = await api.post(`/mail/accounts/${accountId}/test`, overrides ?? {}, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function testMailAccountConfig(
  payload: MailAccountPayload,
): Promise<{ ok: boolean; message: string; imap_ok?: boolean | null; smtp_ok?: boolean | null }> {
  const res = await api.post("/mail/accounts/test-config", payload);
  return res.data;
}
