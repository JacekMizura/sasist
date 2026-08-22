import { useCallback, useEffect, useState } from "react";
import { Cable, Pencil, Plus, Trash2 } from "lucide-react";

import { AppEmptyState } from "../../components/app-shell";
import { OperationalActionButton } from "../../components/operational";
import {
  moduleListTableClass,
  moduleListThClass,
  moduleListTdClass,
  moduleTableCardClass,
} from "../../components/listPage/moduleList";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { useAuth } from "../../context/AuthContext";
import { usePocztaModuleContext } from "../../modules/poczta/context/PocztaModuleContext";
import {
  deactivateMailAccount,
  listMailAccounts,
  testMailAccountConnection,
  type MailAccountDto,
} from "../../modules/poczta/services/mailApi";
import { MailAccountFormModal } from "./MailAccountFormModal";

function fmtSync(row: MailAccountDto): string {
  if (row.last_sync_error) return "Błąd synchronizacji";
  if (!row.last_sync_at) return "—";
  try {
    return new Date(row.last_sync_at).toLocaleString("pl-PL");
  } catch {
    return row.last_sync_at;
  }
}

function modeLabel(row: MailAccountDto): string {
  return row.is_send_only ? "Tylko wysyłanie" : "Odbiór + wysyłka";
}

export default function MailAccountsPage() {
  const { tenantId, refreshSignal, triggerRefresh } = usePocztaModuleContext();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("mail.manage_accounts");
  const [rows, setRows] = useState<MailAccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<MailAccountDto | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

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
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleTest = async (row: MailAccountDto) => {
    setBusyId(row.id);
    try {
      const res = await testMailAccountConnection(row.id, tenantId);
      setToast(res.ok ? "Połączenie działa poprawnie." : res.message);
    } catch {
      setToast("Test połączenia nie powiódł się.");
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Konta pocztowe</h1>
          <p className="text-sm text-slate-500">Konfiguracja skrzynek IMAP/SMTP dla modułu Poczta.</p>
        </div>
        {canManage ? (
          <button
            type="button"
            className={`${brandPrimaryButtonClass} inline-flex items-center gap-2`}
            onClick={() => {
              setEditRow(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Dodaj konto
          </button>
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
          title="Brak kont pocztowych"
          description="Dodaj pierwsze konto, aby rozpocząć synchronizację korespondencji."
          action={
            canManage ? (
              <button type="button" className={brandPrimaryButtonClass} onClick={() => setModalOpen(true)}>
                Dodaj konto pocztowe
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className={moduleTableCardClass}>
          <table className={moduleListTableClass}>
            <thead>
              <tr>
                <th className={th}>Nazwa</th>
                <th className={th}>Adres</th>
                <th className={th}>IMAP</th>
                <th className={th}>SMTP</th>
                <th className={th}>Tryb</th>
                <th className={th}>Status</th>
                <th className={th}>Ostatnia synchronizacja</th>
                {canManage ? <th className={`${th} w-[132px] text-right`}>Akcje</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={`${td} font-medium text-slate-900`}>{row.name}</td>
                  <td className={td}>{row.email_address}</td>
                  <td className={`${td} text-slate-600`}>
                    {row.is_send_only ? "—" : row.imap_host ? `${row.imap_host}:${row.imap_port ?? ""}` : "—"}
                  </td>
                  <td className={`${td} text-slate-600`}>
                    {row.smtp_host ? `${row.smtp_host}:${row.smtp_port ?? ""}` : "—"}
                  </td>
                  <td className={td}>{modeLabel(row)}</td>
                  <td className={td}>
                    <span
                      className={
                        row.is_active
                          ? "inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200"
                          : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
                      }
                    >
                      {row.is_active ? "Aktywne" : "Nieaktywne"}
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
          onClose={() => {
            setModalOpen(false);
            setEditRow(null);
          }}
          onSaved={() => {
            setModalOpen(false);
            setEditRow(null);
            triggerRefresh();
            void load();
            setToast("Konto zapisane.");
          }}
        />
      ) : null}
    </div>
  );
}
