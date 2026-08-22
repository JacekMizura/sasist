import api from "../../../api/axios";

export type MailAccountDto = {
  id: number;
  tenant_id: number;
  name: string;
  email_address: string;
  provider_type: "MANUAL" | "GOOGLE_OAUTH";
  google_connected: boolean;
  google_email: string | null;
  oauth_connected_at: string | null;
  oauth_last_error: string | null;
  google_granted_scopes: string | null;
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

export type MailProtocolProbeResult = {
  status: "OK" | "AUTH_ERROR" | "NETWORK_ERROR" | "TIMEOUT" | "CONFIG_ERROR" | "SKIPPED";
  message: string;
  diagnostics?: Record<string, unknown>;
};

export type MailConnectionTestResult = {
  ok: boolean;
  message: string;
  imap?: MailProtocolProbeResult | null;
  smtp?: MailProtocolProbeResult | null;
  imap_ok?: boolean | null;
  smtp_ok?: boolean | null;
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
): Promise<MailConnectionTestResult> {
  const res = await api.post<MailConnectionTestResult>(`/mail/accounts/${accountId}/test`, overrides ?? {}, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function testMailAccountConfig(payload: MailAccountPayload): Promise<MailConnectionTestResult> {
  const res = await api.post<MailConnectionTestResult>("/mail/accounts/test-config", payload);
  return res.data;
}

export async function startGoogleMailConnect(
  tenantId: number,
  accountId?: number,
): Promise<{ authorization_url: string }> {
  const res = await api.post<{ authorization_url: string }>("/mail/google/connect", {
    tenant_id: tenantId,
    account_id: accountId ?? null,
  });
  return res.data;
}

export async function disconnectGoogleMailAccount(accountId: number, tenantId: number): Promise<MailAccountDto> {
  const res = await api.post<MailAccountDto>(`/mail/accounts/${accountId}/google/disconnect`, null, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export type MailConversationListItem = {
  conversation_id: number;
  subject: string;
  customer: { id: number | null; display_name: string | null; email: string | null };
  latest_message: { direction: string | null; preview: string; created_at: string | null };
  status: string;
  priority: string;
  assigned_user: { id: number | null; display_name: string | null };
  unread: boolean;
  relations: {
    order: { id: number; label: string } | null;
    return: { id: number; label: string } | null;
    complaint: { id: number; label: string } | null;
  };
  last_message_at: string | null;
};

export type MailSidebarCounts = {
  awaiting_me: number;
  assigned_to_me: number;
  unassigned: number;
  open: number;
  in_progress: number;
  waiting_customer: number;
  closed: number;
  spam: number;
  trash: number;
};

export type MailConversationDetail = {
  conversation_id: number;
  subject: string;
  status: string;
  priority: string;
  assigned_user: { id: number | null; display_name: string | null };
  customer: { id: number | null; display_name: string | null; email: string | null; phone: string | null };
  relations: MailConversationListItem["relations"];
  requires_response: boolean;
  unread: boolean;
  reply_defaults: { account_id: number | null; recipient_email: string };
};

export type MailConversationMessage = {
  id: number;
  direction: string;
  sender: string;
  to: string[];
  text_body: string;
  created_at: string;
  delivery_status: string | null;
  user: { id: number | null; display_name: string | null };
  from_account: { id: number | null; email_address: string | null; name: string | null };
};

export type MailConversationHistoryEvent = {
  event_type: string;
  created_at: string | null;
  user: { id: number | null; display_name: string | null } | null;
  payload: Record<string, unknown>;
};

export async function listMailConversations(params: {
  tenantId: number;
  bucket?: string;
  q?: string;
  accountId?: number;
  status?: string;
  assignedUserId?: number;
  unassigned?: boolean;
  priority?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: MailConversationListItem[]; total: number; page: number; page_size: number }> {
  const res = await api.get("/mail/conversations", {
    params: {
      tenant_id: params.tenantId,
      bucket: params.bucket,
      q: params.q,
      account_id: params.accountId,
      status: params.status,
      assigned_user_id: params.assignedUserId,
      unassigned: params.unassigned,
      priority: params.priority,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 25,
    },
  });
  return res.data;
}

export async function fetchMailSidebarCounts(tenantId: number): Promise<MailSidebarCounts> {
  const res = await api.get<MailSidebarCounts>("/mail/conversations/sidebar-counts", {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function fetchMailConversationDetail(
  tenantId: number,
  conversationId: number,
): Promise<MailConversationDetail> {
  const res = await api.get<MailConversationDetail>(`/mail/conversations/${conversationId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function patchMailConversation(
  tenantId: number,
  conversationId: number,
  payload: { status?: string; priority?: string; assigned_user_id?: number; clear_assignment?: boolean },
): Promise<MailConversationDetail> {
  const res = await api.patch<MailConversationDetail>(`/mail/conversations/${conversationId}`, payload, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function fetchMailConversationMessages(
  tenantId: number,
  conversationId: number,
): Promise<MailConversationMessage[]> {
  const res = await api.get<MailConversationMessage[]>(`/mail/conversations/${conversationId}/messages`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function markMailConversationRead(tenantId: number, conversationId: number): Promise<void> {
  await api.post(`/mail/conversations/${conversationId}/mark-read`, null, {
    params: { tenant_id: tenantId },
  });
}

export async function fetchMailConversationHistory(
  tenantId: number,
  conversationId: number,
): Promise<MailConversationHistoryEvent[]> {
  const res = await api.get<MailConversationHistoryEvent[]>(`/mail/conversations/${conversationId}/history`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function replyMailConversation(
  tenantId: number,
  conversationId: number,
  payload: {
    body: string;
    idempotency_key: string;
    account_id?: number;
    subject?: string;
    template_id?: number;
  },
): Promise<{ mail_message_id: number; delivery_status: string }> {
  const res = await api.post(`/mail/conversations/${conversationId}/reply`, payload, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}
