import { useCallback, useEffect, useState } from "react";
import { Cable, Link2, Pencil, Plus, Trash2, Unlink } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { AppEmptyState } from "../../components/app-shell";
import { OperationalActionButton } from "../../components/operational";
import {
  moduleListTableClass,
  moduleListThClass,
  moduleListTheadClass,
  moduleListTdClass,
  moduleTableCardClass,
  ModuleListBreadcrumb,
} from "../../components/listPage/moduleList";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { useAuth } from "../../context/AuthContext";
import { usePocztaModuleContext } from "../../modules/poczta/context/PocztaModuleContext";
import {
  deactivateMailAccount,
  disconnectGoogleMailAccount,
  listMailAccounts,
  startGoogleMailConnect,
  testMailAccountConnection,
  type MailAccountDto,
  type MailConnectionTestResult,
} from "../../modules/poczta/services/mailApi";
import { formatMailConnectionTestSummary } from "./MailConnectionTestResults";
import { MailAccountFormModal } from "./MailAccountFormModal";

function fmtSync(row: MailAccountDto): string {
  if (row.oauth_last_error && row.oauth_last_error !== "disconnected") return "Błąd synchronizacji";
  if (row.last_sync_error) return "Błąd synchronizacji";
  if (!row.last_sync_at) return "—";
  try {
    return new Date(row.last_sync_at).toLocaleString("pl-PL");
  } catch {
    return row.last_sync_at;
  }
}

function modeLabel(row: MailAccountDto): string {
  if (row.provider_type === "GOOGLE_OAUTH") return "Google";
  return row.is_send_only ? "Tylko wysyłanie" : "Odbiór + wysyłka";
}

function statusLabel(row: MailAccountDto): string {
  if (!row.is_active) return "Nieaktywne";
  if (row.provider_type === "GOOGLE_OAUTH") {
    return row.google_connected ? "Połączone" : "Wymaga ponownego połączenia";
  }
  return "Aktywne";
}

export default function MailAccountsPage() {
  const { tenantId, refreshSignal, triggerRefresh } = usePocztaModuleContext();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("mail.manage_accounts");
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<MailAccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<MailAccountDto | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listMailAccounts(tenantId);
      setRows(data);
    } catch {
      setErr("Nie udało się wczytać kont pocztowych.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  useEffect(() => {
    const google = searchParams.get("google");
    if (google === "connected") {
      setToast("Konto Google zostało połączone.");
      searchParams.delete("google");
      searchParams.delete("reason");
      setSearchParams(searchParams, { replace: true });
      triggerRefresh();
      void load();
    } else if (google === "error") {
      const reason = searchParams.get("reason");
      setToast(
        reason === "access_denied"
          ? "Połączenie z Google zostało anulowane."
          : "Nie udało się połączyć konta Google. Spróbuj ponownie.",
      );
      searchParams.delete("google");
      searchParams.delete("reason");
      setSearchParams(searchParams, { replace: true });
    }
  }, [load, searchParams, setSearchParams, triggerRefresh]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleGoogleConnect = async () => {
    setGoogleBusy(true);
    try {
      const { authorization_url } = await startGoogleMailConnect(tenantId);
      window.location.href = authorization_url;
    } catch {
      setToast("Nie udało się rozpocząć połączenia z Google.");
      setGoogleBusy(false);
    }
  };

  const handleTest = async (row: MailAccountDto) => {
    setBusyId(row.id);
    try {
      const res: MailConnectionTestResult = await testMailAccountConnection(row.id, tenantId);
      const lines = formatMailConnectionTestSummary(res, row.is_send_only);
      setToast(res.ok ? lines.join(" ") : lines.join(" · "));
    } catch {
      setToast("Test połączenia nie powiódł się.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnectGoogle = async (row: MailAccountDto) => {
    if (!window.confirm(`Rozłączyć konto Google „${row.name}”?`)) return;
    setBusyId(row.id);
    try {
      await disconnectGoogleMailAccount(row.id, tenantId);
      setToast("Konto Google zostało rozłączone.");
      triggerRefresh();
      await load();
    } catch {
      setToast("Nie udało się rozłączyć konta Google.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeactivate = async (row: MailAccountDto) => {
    if (!window.confirm(`Dezaktywować konto „${row.name}”?`)) return;
    setBusyId(row.id);
    try {
      await deactivateMailAccount(row.id, tenantId);
      setToast("Konto dezaktywowane.");
      triggerRefresh();
      await load();
    } catch {
      setToast("Nie udało się dezaktywować konta.");
    } finally {
      setBusyId(null);
    }
  };

  const th = moduleListThClass;
  const td = moduleListTdClass;
  const isGoogle = (row: MailAccountDto) => row.provider_type === "GOOGLE_OAUTH";

  return (
    <div className="space-y-4">
      <ModuleListBreadcrumb
        items={[{ label: "Poczta", to: "/poczta/korespondencja" }, { label: "Konta pocztowe" }]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Konta pocztowe</h1>
          <p className="text-sm text-slate-500">Połącz Google lub skonfiguruj konto IMAP/SMTP ręcznie.</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`${brandPrimaryButtonClass} inline-flex items-center gap-2`}
              disabled={googleBusy}
              onClick={() => void handleGoogleConnect()}
            >
              <Link2 className="h-4 w-4" aria-hidden />
              Połącz z Google
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setEditRow(null);
                setModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Dodaj konto ręcznie
            </button>
          </div>
        ) : null}
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div> : null}
      {toast ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{toast}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <AppEmptyState
          icon={Cable}
          title="Brak kont pocztowych"
          description="Połącz konto Google lub dodaj skrzynkę IMAP/SMTP ręcznie."
          action={
            canManage ? (
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className={brandPrimaryButtonClass} onClick={() => void handleGoogleConnect()}>
                  Połącz z Google
                </button>
                <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setModalOpen(true)}>
                  Dodaj ręcznie
                </button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className={moduleTableCardClass}>
          <table className={moduleListTableClass}>
            <thead className={moduleListTheadClass}>
              <tr>
                <th className={th}>Nazwa</th>
                <th className={th}>Adres</th>
                <th className={th}>Typ</th>
                {!rows.every(isGoogle) ? <th className={th}>IMAP</th> : null}
                {!rows.every(isGoogle) ? <th className={th}>SMTP</th> : null}
                <th className={th}>Status</th>
                <th className={th}>Ostatnia synchronizacja</th>
                {canManage ? <th className={`${th} w-[148px] text-right`}>Akcje</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={`${td} font-medium text-slate-900`}>{row.name}</td>
                  <td className={td}>{row.email_address}</td>
                  <td className={td}>{modeLabel(row)}</td>
                  {!rows.every(isGoogle) ? (
                    <td className={`${td} text-slate-600`}>
                      {isGoogle(row) ? "—" : row.is_send_only ? "—" : row.imap_host ? `${row.imap_host}:${row.imap_port ?? ""}` : "—"}
                    </td>
                  ) : null}
                  {!rows.every(isGoogle) ? (
                    <td className={`${td} text-slate-600`}>{isGoogle(row) ? "—" : row.smtp_host ? `${row.smtp_host}:${row.smtp_port ?? ""}` : "—"}</td>
                  ) : null}
                  <td className={td}>
                    <span
                      className={
                        row.is_active && (row.provider_type !== "GOOGLE_OAUTH" || row.google_connected)
                          ? "inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200"
                          : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
                      }
                    >
                      {statusLabel(row)}
                    </span>
                  </td>
                  <td className={`${td} text-slate-600`}>{fmtSync(row)}</td>
                  {canManage ? (
                    <td className={`${td} text-right`}>
                      <div className="flex justify-end gap-1">
                        <OperationalActionButton
                          title="Edytuj"
                          aria-label="Edytuj konto"
                          onClick={() => {
                            setEditRow(row);
                            setModalOpen(true);
                          }}
                        >
                          <Pencil strokeWidth={2} aria-hidden />
                        </OperationalActionButton>
                        {isGoogle(row) ? (
                          <OperationalActionButton
                            title="Rozłącz Google"
                            aria-label="Rozłącz konto Google"
                            variant="danger"
                            disabled={busyId === row.id}
                            onClick={() => void handleDisconnectGoogle(row)}
                          >
                            <Unlink strokeWidth={2} aria-hidden />
                          </OperationalActionButton>
                        ) : (
                          <>
                            <OperationalActionButton
                              title="Sprawdź połączenie"
                              aria-label="Sprawdź połączenie"
                              disabled={busyId === row.id}
                              onClick={() => void handleTest(row)}
                            >
                              <Cable strokeWidth={2} aria-hidden />
                            </OperationalActionButton>
                            <OperationalActionButton
                              variant="danger"
                              title="Dezaktywuj"
                              aria-label="Dezaktywuj konto"
                              disabled={busyId === row.id || !row.is_active}
                              onClick={() => void handleDeactivate(row)}
                            >
                              <Trash2 strokeWidth={2} aria-hidden />
                            </OperationalActionButton>
                          </>
                        )}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && canManage ? (
        <MailAccountFormModal
          tenantId={tenantId}
          initial={editRow}
          googleNameOnly={editRow?.provider_type === "GOOGLE_OAUTH"}
          onClose={() => {
            setModalOpen(false);
            setEditRow(null);
          }}
          onSaved={() => {
            setModalOpen(false);
            setEditRow(null);
            triggerRefresh();
            void load();
            setToast(editRow?.provider_type === "GOOGLE_OAUTH" ? "Nazwa konta zapisana." : "Konto zapisane.");
          }}
        />
      ) : null}
    </div>
  );
}
