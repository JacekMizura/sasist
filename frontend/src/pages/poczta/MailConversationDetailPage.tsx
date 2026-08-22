import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";

import { MessageTemplatePicker } from "../../components/messaging/MessageTemplatePicker";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { listSellasistInputClass } from "../../components/listPage/listSellasistTokens";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { useAuth } from "../../context/AuthContext";
import api from "../../api/axios";
import { usePocztaModuleContext } from "../../modules/poczta/context/PocztaModuleContext";
import {
  MAIL_DELIVERY_LABELS,
  MAIL_PRIORITY_LABELS,
  MAIL_STATUS_LABELS,
} from "../../modules/poczta/mailLabels";
import {
  fetchMailConversationDetail,
  fetchMailConversationHistory,
  fetchMailConversationMessages,
  listMailAccounts,
  markMailConversationRead,
  patchMailConversation,
  replyMailConversation,
  type MailAccountDto,
  type MailConversationDetail,
  type MailConversationHistoryEvent,
  type MailConversationMessage,
} from "../../modules/poczta/services/mailApi";

type AppUserListItem = { id: number; login: string; first_name?: string | null; last_name?: string | null };

function userLabel(u: AppUserListItem): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return name || u.login;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL");
  } catch {
    return iso;
  }
}

function historyLabel(ev: MailConversationHistoryEvent): string {
  switch (ev.event_type) {
    case "CONVERSATION_CREATED":
      return "Utworzono rozmowę";
    case "STATUS_CHANGED":
      return `Status: ${String(ev.payload.from ?? "?")} → ${String(ev.payload.to ?? "?")}`;
    case "PRIORITY_CHANGED":
      return `Priorytet: ${String(ev.payload.from ?? "?")} → ${String(ev.payload.to ?? "?")}`;
    case "ASSIGNMENT_CHANGED":
      return "Zmiana przypisania";
    case "REPLY_SENT":
      return "Wysłano odpowiedź";
    default:
      return ev.event_type;
  }
}

export default function MailConversationDetailPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const convId = Number(conversationId);
  const navigate = useNavigate();
  const { tenantId } = usePocztaModuleContext();
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("mail.manage_conversations");
  const canReply = hasPermission("mail.reply");

  const [detail, setDetail] = useState<MailConversationDetail | null>(null);
  const [messages, setMessages] = useState<MailConversationMessage[]>([]);
  const [history, setHistory] = useState<MailConversationHistoryEvent[]>([]);
  const [accounts, setAccounts] = useState<MailAccountDto[]>([]);
  const [users, setUsers] = useState<AppUserListItem[]>([]);
  const [tab, setTab] = useState<"messages" | "history">("messages");
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState("");
  const [templateId, setTemplateId] = useState<number | "">("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accountId = detail?.reply_defaults.account_id ?? accounts[0]?.id ?? null;

  const load = useCallback(async () => {
    if (!Number.isFinite(convId)) return;
    setLoading(true);
    setErr(null);
    try {
      const [d, m, h] = await Promise.all([
        fetchMailConversationDetail(tenantId, convId),
        fetchMailConversationMessages(tenantId, convId),
        fetchMailConversationHistory(tenantId, convId),
      ]);
      setDetail(d);
      setMessages(m);
      setHistory(h);
      await markMailConversationRead(tenantId, convId);
    } catch {
      setErr("Nie udało się wczytać rozmowy.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, convId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listMailAccounts(tenantId).then(setAccounts).catch(() => setAccounts([]));
    void api
      .get<AppUserListItem[]>("/auth/users")
      .then((r) => setUsers(r.data))
      .catch(() => setUsers([]));
  }, [tenantId]);

  const entityScope = useMemo(() => {
    if (detail?.relations.order) return "ORDER";
    if (detail?.relations.return) return "RETURN";
    if (detail?.relations.complaint) return "COMPLAINT";
    return undefined;
  }, [detail]);

  const handlePatch = async (payload: Parameters<typeof patchMailConversation>[2]) => {
    if (!canManage || !detail) return;
    const updated = await patchMailConversation(tenantId, convId, payload);
    setDetail(updated);
    const h = await fetchMailConversationHistory(tenantId, convId);
    setHistory(h);
  };

  const handleSend = async () => {
    if (!canReply || !replyBody.trim()) return;
    setSending(true);
    setErr(null);
    const idempotencyKey = `reply-${convId}-${crypto.randomUUID()}`;
    try {
      await replyMailConversation(tenantId, convId, {
        body: replyBody.trim(),
        idempotency_key: idempotencyKey,
        account_id: accountId ?? undefined,
        template_id: templateId === "" ? undefined : templateId,
      });
      setReplyBody("");
      setTemplateId("");
      const [m, d, h] = await Promise.all([
        fetchMailConversationMessages(tenantId, convId),
        fetchMailConversationDetail(tenantId, convId),
        fetchMailConversationHistory(tenantId, convId),
      ]);
      setMessages(m);
      setDetail(d);
      setHistory(h);
    } catch {
      setErr("Wysyłka nie powiodła się.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Ładowanie rozmowy…</p>;
  }

  if (!detail) {
    return (
      <div className="space-y-3">
        <ModuleListBreadcrumb
          items={[
            { label: "Poczta", to: "/poczta/korespondencja" },
            { label: "Korespondencja", to: `/poczta/korespondencja?tenant_id=${tenantId}` },
            { label: "Nie znaleziono" },
          ]}
        />
        <p className="text-sm text-red-600">{err || "Rozmowa nie istnieje."}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-4">
        <ModuleListBreadcrumb
          items={[
            { label: "Poczta", to: "/poczta/korespondencja" },
            { label: "Korespondencja", to: `/poczta/korespondencja?tenant_id=${tenantId}` },
            { label: detail.subject || `#${detail.conversation_id}` },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900">{detail.subject}</h1>
            <p className="text-xs text-slate-500">
              {detail.customer.display_name || detail.customer.email || "—"}
              {detail.customer.email ? ` · ${detail.customer.email}` : ""}
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <select
                className={listSellasistInputClass}
                value={detail.status}
                onChange={(e) => void handlePatch({ status: e.target.value })}
              >
                {Object.entries(MAIL_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                className={listSellasistInputClass}
                value={detail.priority}
                onChange={(e) => void handlePatch({ priority: e.target.value })}
              >
                {Object.entries(MAIL_PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                className={listSellasistInputClass}
                value={detail.assigned_user.id ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") void handlePatch({ clear_assignment: true });
                  else if (v === "me") void handlePatch({ assigned_user_id: user?.id });
                  else void handlePatch({ assigned_user_id: Number(v) });
                }}
              >
                <option value="">Nieprzypisane</option>
                <option value="me">Ja</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 border-b border-slate-200 text-sm">
          <button
            type="button"
            className={`border-b-2 px-2 py-1 ${tab === "messages" ? "border-slate-800 font-semibold" : "border-transparent text-slate-500"}`}
            onClick={() => setTab("messages")}
          >
            Wiadomości
          </button>
          <button
            type="button"
            className={`border-b-2 px-2 py-1 ${tab === "history" ? "border-slate-800 font-semibold" : "border-transparent text-slate-500"}`}
            onClick={() => setTab("history")}
          >
            Historia
          </button>
        </div>

        {tab === "messages" ? (
          <div className="space-y-3">
            {messages.map((msg) => (
              <article key={msg.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-600">
                  <div>
                    <span className="font-semibold text-slate-800">
                      {msg.direction === "INBOUND"
                        ? msg.sender
                        : msg.user.display_name || msg.from_account.email_address || "System"}
                    </span>
                    {msg.direction === "OUTBOUND" && msg.from_account.email_address ? (
                      <span className="ml-2 text-slate-500">od {msg.from_account.email_address}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {msg.delivery_status ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">
                        {MAIL_DELIVERY_LABELS[msg.delivery_status] || msg.delivery_status}
                      </span>
                    ) : null}
                    <time>{fmtDate(msg.created_at)}</time>
                  </div>
                </header>
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">{msg.text_body}</pre>
              </article>
            ))}
          </div>
        ) : (
          <ul className="space-y-2 text-sm">
            {history.map((ev, idx) => (
              <li key={`${ev.event_type}-${idx}`} className="rounded border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="font-medium">{historyLabel(ev)}</div>
                <div className="text-xs text-slate-500">
                  {fmtDate(ev.created_at)}
                  {ev.user?.display_name ? ` · ${ev.user.display_name}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canReply && tab === "messages" ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
              <div>
                <span className="font-medium">Od:</span>{" "}
                {accounts.find((a) => a.id === accountId)?.email_address || "—"}
              </div>
              <div>
                <span className="font-medium">Do:</span> {detail.reply_defaults.recipient_email}
              </div>
            </div>
            <MessageTemplatePicker
              tenantId={tenantId}
              entityType={entityScope}
              value={templateId}
              onChange={setTemplateId}
              disabled={sending}
            />
            <textarea
              className={`${listSellasistInputClass} mt-2 min-h-[120px] w-full`}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Treść odpowiedzi…"
              disabled={sending}
            />
            {err ? <p className="mt-1 text-xs text-red-600">{err}</p> : null}
            <button
              type="button"
              className={`${brandPrimaryButtonClass} mt-2`}
              disabled={sending || !replyBody.trim()}
              onClick={() => void handleSend()}
            >
              {sending ? "Wysyłanie…" : "Wyślij"}
            </button>
          </div>
        ) : null}
      </div>

      <aside className="w-full shrink-0 space-y-4 lg:w-72">
        <section className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <h2 className="mb-2 font-semibold">Klient</h2>
          <p>{detail.customer.display_name || "—"}</p>
          <p className="text-slate-600">{detail.customer.email || "—"}</p>
          {detail.customer.phone ? <p className="text-slate-600">{detail.customer.phone}</p> : null}
          {detail.customer.id ? (
            <Link
              to={`/customers/${detail.customer.id}`}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
            >
              Otwórz klienta <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <h2 className="mb-2 font-semibold">Powiązania</h2>
          <ul className="space-y-1 text-xs">
            {detail.relations.order ? (
              <li>
                <Link to={`/orders/${detail.relations.order.id}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                  {detail.relations.order.label} <ExternalLink className="h-3 w-3" />
                </Link>
              </li>
            ) : null}
            {detail.relations.return ? (
              <li>
                <Link to={`/orders/returns/${detail.relations.return.id}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                  {detail.relations.return.label} <ExternalLink className="h-3 w-3" />
                </Link>
              </li>
            ) : null}
            {detail.relations.complaint ? (
              <li>
                <Link to={`/complaints/${detail.relations.complaint.id}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                  {detail.relations.complaint.label} <ExternalLink className="h-3 w-3" />
                </Link>
              </li>
            ) : null}
            {!detail.relations.order && !detail.relations.return && !detail.relations.complaint ? (
              <li className="text-slate-500">Brak powiązań</li>
            ) : null}
          </ul>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <div>ID rozmowy: {detail.conversation_id}</div>
          <div>Status: {MAIL_STATUS_LABELS[detail.status] || detail.status}</div>
          <div>Priorytet: {MAIL_PRIORITY_LABELS[detail.priority] || detail.priority}</div>
        </section>
      </aside>
    </div>
  );
}
