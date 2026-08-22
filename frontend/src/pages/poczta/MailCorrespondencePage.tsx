import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, Inbox, Mail } from "lucide-react";

import { AppEmptyState } from "../../components/app-shell";
import { MailCorrespondenceSidebar } from "../../components/poczta/MailCorrespondenceSidebar";
import { OperationalActionLink } from "../../components/operational";
import {
  ModuleListBreadcrumb,
  ModuleStatusSidebarShell,
  ModuleTableCard,
  moduleListContentColumnClass,
  moduleListEmptyStateClass,
  moduleListRowClass,
  moduleListTableClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
  moduleListTwoColumnShellClass,
  moduleTablePaginationFooterClass,
} from "../../components/listPage/moduleList";
import { listSellasistInputClass } from "../../components/listPage/listSellasistTokens";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { usePocztaModuleContext } from "../../modules/poczta/context/PocztaModuleContext";
import {
  MAIL_PRIORITY_LABELS,
  MAIL_STATUS_LABELS,
  showPriorityBadge,
  type MailCorrespondenceBucket,
} from "../../modules/poczta/mailLabels";
import {
  fetchMailSetupStatus,
  fetchMailSidebarCounts,
  listMailAccounts,
  listMailConversations,
  type MailAccountDto,
  type MailConversationListItem,
  type MailSetupStatus,
} from "../../modules/poczta/services/mailApi";

const PAGE_SIZES = [25, 50, 100] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function MailCorrespondencePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenantId, refreshSignal } = usePocztaModuleContext();

  const [setup, setSetup] = useState<MailSetupStatus | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [rows, setRows] = useState<MailConversationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof fetchMailSidebarCounts>> | null>(null);
  const [accounts, setAccounts] = useState<MailAccountDto[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);

  const bucket = (searchParams.get("bucket") as MailCorrespondenceBucket | null) || null;
  const q = searchParams.get("q") || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const pageSize = PAGE_SIZES.includes(Number(searchParams.get("page_size")) as (typeof PAGE_SIZES)[number])
    ? Number(searchParams.get("page_size"))
    : 25;
  const accountId = searchParams.get("account_id") ? Number(searchParams.get("account_id")) : undefined;
  const status = searchParams.get("status") || undefined;
  const priority = searchParams.get("priority") || undefined;

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
      if (key !== "page") next.delete("page");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingSetup(true);
    void fetchMailSetupStatus(tenantId)
      .then((s) => {
        if (!cancelled) setSetup(s);
      })
      .finally(() => {
        if (!cancelled) setLoadingSetup(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, refreshSignal]);

  useEffect(() => {
    void listMailAccounts(tenantId).then(setAccounts).catch(() => setAccounts([]));
  }, [tenantId, refreshSignal]);

  const loadCounts = useCallback(async () => {
    try {
      setCounts(await fetchMailSidebarCounts(tenantId));
    } catch {
      setCounts(null);
    }
  }, [tenantId]);

  const loadList = useCallback(async () => {
    if (!setup?.has_accounts) return;
    setLoading(true);
    try {
      const res = await listMailConversations({
        tenantId,
        bucket: bucket ?? undefined,
        q: q || undefined,
        accountId,
        status,
        priority,
        page,
        pageSize,
      });
      setRows(res.items);
      setTotal(res.total);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tenantId, setup?.has_accounts, bucket, q, accountId, status, priority, page, pageSize]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts, refreshSignal]);

  useEffect(() => {
    void loadList();
  }, [loadList, refreshSignal]);

  const hasFilters = useMemo(
    () => Boolean(q || accountId || status || priority || bucket),
    [q, accountId, status, priority, bucket],
  );

  if (loadingSetup) {
    return <p className="text-sm text-slate-500">Ładowanie…</p>;
  }

  if (!setup?.has_accounts) {
    return (
      <AppEmptyState
        icon={Mail}
        title="Poczta"
        description="Nie masz skonfigurowanego konta pocztowego."
        action={
          <Link to={`/poczta/konta?tenant_id=${tenantId}`} className={brandPrimaryButtonClass}>
            Dodaj konto pocztowe
          </Link>
        }
      />
    );
  }

  const sidebarNode = (
    <MailCorrespondenceSidebar
      counts={counts}
      activeBucket={bucket}
      onBucketChange={(b) => setParam("bucket", b)}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
    />
  );

  return (
    <div className={moduleListTwoColumnShellClass}>
      <ModuleStatusSidebarShell
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        mobileOpenLabel="Korespondencja"
        sidebar={sidebarNode}
        mobileDrawerSidebar={sidebarNode}
        statusDrawerOpen={statusDrawerOpen}
        onStatusDrawerOpenChange={setStatusDrawerOpen}
      />
      <div className={moduleListContentColumnClass}>
        <ModuleListBreadcrumb
          items={[{ label: "Poczta", to: "/poczta/korespondencja" }, { label: "Korespondencja" }]}
        />
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-slate-600">
            Szukaj
            <input
              className={listSellasistInputClass}
              value={q}
              placeholder="Temat, klient, numer…"
              onChange={(e) => setParam("q", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Konto
            <select
              className={listSellasistInputClass}
              value={accountId ?? ""}
              onChange={(e) => setParam("account_id", e.target.value || null)}
            >
              <option value="">Wszystkie</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Status
            <select
              className={listSellasistInputClass}
              value={status ?? ""}
              onChange={(e) => setParam("status", e.target.value || null)}
            >
              <option value="">Wszystkie</option>
              {Object.entries(MAIL_STATUS_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Priorytet
            <select
              className={listSellasistInputClass}
              value={priority ?? ""}
              onChange={(e) => setParam("priority", e.target.value || null)}
            >
              <option value="">Wszystkie</option>
              {Object.entries(MAIL_PRIORITY_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ModuleTableCard>
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Ładowanie listy…</p>
          ) : rows.length === 0 ? (
            <div className={moduleListEmptyStateClass}>
              <AppEmptyState
                icon={Inbox}
                title={hasFilters ? "Brak wyników" : "Brak korespondencji"}
                description={
                  hasFilters
                    ? "Brak rozmów spełniających wybrane kryteria."
                    : "Gdy skrzynka zostanie zsynchronizowana, rozmowy pojawią się tutaj."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className={moduleListTableClass}>
                <thead className={moduleListTheadClass}>
                  <tr>
                    <th className={moduleListThClass}>Klient / nadawca</th>
                    <th className={moduleListThClass}>Temat</th>
                    <th className={moduleListThClass}>Powiązanie</th>
                    <th className={moduleListThClass}>Przypisany</th>
                    <th className={moduleListThClass}>Status</th>
                    <th className={moduleListThClass}>Priorytet</th>
                    <th className={moduleListThClass}>Ostatnia wiadomość</th>
                    <th className={moduleListThClass}>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rel =
                      row.relations.order?.label ||
                      row.relations.return?.label ||
                      row.relations.complaint?.label ||
                      "—";
                    return (
                      <tr
                        key={row.conversation_id}
                        className={`${moduleListRowClass} cursor-pointer ${row.unread ? "font-semibold" : ""}`}
                        onClick={() => navigate(`/poczta/korespondencja/${row.conversation_id}?tenant_id=${tenantId}`)}
                      >
                        <td className={moduleListTdClass}>
                          <div>{row.customer.display_name || row.customer.email || "—"}</div>
                          <div className="text-xs font-normal text-slate-500">
                            {row.customer.email || row.latest_message.preview}
                          </div>
                        </td>
                        <td className={moduleListTdClass}>
                          <div>{row.subject}</div>
                          <div className="truncate text-xs font-normal text-slate-500">{row.latest_message.preview}</div>
                        </td>
                        <td className={`${moduleListTdClass} text-xs`}>{rel}</td>
                        <td className={`${moduleListTdClass} text-xs`}>{row.assigned_user.display_name || "—"}</td>
                        <td className={`${moduleListTdClass} text-xs`}>{MAIL_STATUS_LABELS[row.status] || row.status}</td>
                        <td className={`${moduleListTdClass} text-xs`}>
                          {showPriorityBadge(row.priority) ? MAIL_PRIORITY_LABELS[row.priority] : "—"}
                        </td>
                        <td className={`${moduleListTdClass} text-xs`}>{fmtDate(row.last_message_at)}</td>
                        <td className={moduleListTdClass} onClick={(e) => e.stopPropagation()}>
                          <OperationalActionLink
                            to={`/poczta/korespondencja/${row.conversation_id}?tenant_id=${tenantId}`}
                            title="Otwórz rozmowę"
                            aria-label="Otwórz rozmowę"
                          >
                            <Eye className="h-4 w-4" />
                          </OperationalActionLink>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && rows.length > 0 ? (
            <div className={moduleTablePaginationFooterClass}>
              <span className="text-xs text-slate-600">
                {total} rozmów · strona {page}
              </span>
              <div className="flex items-center gap-2">
                <select
                  className={listSellasistInputClass}
                  value={pageSize}
                  onChange={(e) => setParam("page_size", e.target.value)}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n} / str.
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setParam("page", String(page - 1))}
                >
                  Poprzednia
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                  disabled={page * pageSize >= total}
                  onClick={() => setParam("page", String(page + 1))}
                >
                  Następna
                </button>
              </div>
            </div>
          ) : null}
        </ModuleTableCard>
      </div>
    </div>
  );
}
