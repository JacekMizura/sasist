import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { fetchStatusAccessMatrix, putStatusAccessMatrix } from "../../api/workforceApi";
import { getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import type { OrderUiStatusWithCount } from "../../types/orderUiStatus";
import { useAuth } from "../../context/AuthContext";
import { isSuperRole } from "../../auth/isSuperRole";
import { PLATFORM_ROLE_OPTIONS } from "../../settings/platformRoles";
import { translateMainGroup } from "../../utils/workforceUiLabels";

const TENANT = 1;
const WAREHOUSE = 1;

type FlagKey = "can_visible" | "can_edit" | "can_transition" | "can_process" | "can_print" | "can_complete";

function defaultFlags(): Record<FlagKey, boolean> {
  return {
    can_visible: true,
    can_edit: false,
    can_transition: false,
    can_process: false,
    can_print: false,
    can_complete: false,
  };
}

function hasWorkAccess(f: Record<FlagKey, boolean>): boolean {
  return f.can_edit || f.can_transition || f.can_process || f.can_print || f.can_complete;
}

function withWorkFlags(f: Record<FlagKey, boolean>, work: boolean): Record<FlagKey, boolean> {
  return {
    ...f,
    can_edit: work,
    can_transition: work,
    can_process: work,
    can_print: work,
    can_complete: work,
  };
}

export default function WorkforceStatusMatrixPage() {
  const { user, hasPermission } = useAuth();
  const canRead = hasPermission("workforce.status_matrix.read") || isSuperRole(user?.role ?? "");
  const canWrite = hasPermission("workforce.status_matrix.write") || isSuperRole(user?.role ?? "");

  const [role, setRole] = useState("picker");
  const [statuses, setStatuses] = useState<OrderUiStatusWithCount[]>([]);
  const [flagsByStatusId, setFlagsByStatusId] = useState<Record<number, Record<FlagKey, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const summary = await getOrderUiStatusSummary(TENANT, WAREHOUSE);
      const flat: OrderUiStatusWithCount[] = [];
      for (const g of summary.groups ?? []) {
        for (const s of g.sub_statuses ?? []) {
          flat.push(s);
        }
      }
      setStatuses(flat);
      const matrix = await fetchStatusAccessMatrix(TENANT, WAREHOUSE);
      const map: Record<number, Record<FlagKey, boolean>> = {};
      for (const s of flat) {
        const row = matrix.find((m) => m.order_ui_status_id === s.id && m.role === role);
        map[s.id] = row
          ? {
              can_visible: row.can_visible,
              can_edit: row.can_edit,
              can_transition: row.can_transition,
              can_process: row.can_process,
              can_print: row.can_print,
              can_complete: row.can_complete,
            }
          : defaultFlags();
      }
      setFlagsByStatusId(map);
    } catch {
      toast.error("Nie udało się wczytać ustawień dostępu do statusów.");
    } finally {
      setLoading(false);
    }
  }, [canRead, role]);

  useEffect(() => {
    void load();
  }, [load]);

  const setVisible = (statusId: number, value: boolean) => {
    if (!canWrite) return;
    setFlagsByStatusId((prev) => {
      const cur = { ...(prev[statusId] ?? defaultFlags()) };
      cur.can_visible = value;
      if (!value) return { ...prev, [statusId]: withWorkFlags(cur, false) };
      return { ...prev, [statusId]: cur };
    });
  };

  const setWork = (statusId: number, value: boolean) => {
    if (!canWrite) return;
    setFlagsByStatusId((prev) => {
      const cur = { ...(prev[statusId] ?? defaultFlags()) };
      const next = withWorkFlags(cur, value);
      if (value) next.can_visible = true;
      return { ...prev, [statusId]: next };
    });
  };

  const save = async () => {
    if (!canWrite) return;
    setSaving(true);
    try {
      const items = statuses.map((s) => ({
        tenant_id: TENANT,
        warehouse_id: WAREHOUSE,
        role,
        order_ui_status_id: s.id,
        ...(flagsByStatusId[s.id] ?? defaultFlags()),
      }));
      await putStatusAccessMatrix(items);
      toast.success("Zapisano domyślny dostęp dla wybranej roli.");
    } catch {
      toast.error("Zapis nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = useMemo(
    () => PLATFORM_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? "Rola",
    [role],
  );

  if (!canRead) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Brak uprawnienia do podglądu macierzy statusów.
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Role i uprawnienia</h2>
        <p className="mt-1 text-sm text-slate-500">
          Domyślny dostęp do statusów zamówień dla wybranej roli w magazynie. Uprawnienia konta
          (permission tree) nadal edytujesz w karcie użytkownika.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
        <div className="min-w-[14rem] flex-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rola w systemie</label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {PLATFORM_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">Wybrana rola: {roleLabel}</p>
        </div>
        {canWrite ? (
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Zapisywanie…" : "Zapisz"}
          </button>
        ) : null}
      </div>

      {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Ładowanie…</div> : null}

      {!loading ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Etap</th>
                  <th className="px-3 py-3 text-center">Widoczny</th>
                  <th className="px-3 py-3 text-center">Dostęp (praca)</th>
                </tr>
              </thead>
              <tbody>
                {statuses.map((s) => {
                  const f = flagsByStatusId[s.id] ?? defaultFlags();
                  const work = hasWorkAccess(f);
                  return (
                    <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                      <td className="px-3 py-3 font-medium leading-snug text-slate-900">{s.name}</td>
                      <td className="px-3 py-3 whitespace-normal text-slate-600">{translateMainGroup(s.main_group)}</td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-cyan-600"
                          checked={f.can_visible}
                          disabled={!canWrite}
                          onChange={() => setVisible(s.id, !f.can_visible)}
                          aria-label={`Widoczny: ${s.name}`}
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-cyan-600"
                          checked={work}
                          disabled={!canWrite || !f.can_visible}
                          onChange={() => setWork(s.id, !work)}
                          aria-label={`Praca: ${s.name}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
