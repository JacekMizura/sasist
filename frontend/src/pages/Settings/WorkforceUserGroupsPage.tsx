import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";

import {
  createWorkforceUserGroup,
  fetchWorkforceUserGroups,
  updateWorkforceUserGroup,
  type WorkforceUserGroupDto,
} from "../../api/workforceGroupsApi";
import { useAuth } from "../../context/AuthContext";
import { isSuperRole } from "../../auth/isSuperRole";

const inputCls =
  "h-10 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300/40";

export default function WorkforceUserGroupsPage() {
  const { user, hasPermission } = useAuth();
  const can = hasPermission("settings.users") || isSuperRole(user?.role ?? "");
  const [rows, setRows] = useState<WorkforceUserGroupDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!can) return;
    setLoading(true);
    try {
      setRows(await fetchWorkforceUserGroups(true));
    } catch {
      toast.error("Nie udało się wczytać grup.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [can]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async () => {
    if (!name.trim()) {
      toast.error("Podaj nazwę grupy.");
      return;
    }
    setBusy(true);
    try {
      await createWorkforceUserGroup({ name: name.trim(), color });
      toast.success("Grupa utworzona.");
      setName("");
      await load();
    } catch {
      toast.error("Nie udało się utworzyć grupy.");
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async (g: WorkforceUserGroupDto) => {
    try {
      await updateWorkforceUserGroup(g.id, { archived_at: g.archived_at ? null : new Date().toISOString() });
      toast.success(g.archived_at ? "Grupa przywrócona." : "Grupa zarchiwizowana.");
      await load();
    } catch {
      toast.error("Operacja nie powiodła się.");
    }
  };

  if (!can) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-700">Brak uprawnienia.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
        <h2 className="text-base font-semibold text-slate-900">Nowa grupa</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] flex-1 text-sm font-medium text-slate-700">
            Nazwa
            <input className={`${inputCls} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Magazyn" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Kolor
            <input type="color" className="mt-1 h-10 w-14 cursor-pointer rounded border border-slate-200 p-1" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onCreate()}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
          >
            Dodaj grupę
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Grupa</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: g.color }} aria-hidden />
                      <span className="font-semibold text-slate-900">{g.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{g.archived_at ? "Zarchiwizowana" : "Aktywna"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-sm font-semibold text-cyan-700 hover:underline"
                      onClick={() => void toggleArchive(g)}
                    >
                      {g.archived_at ? "Przywróć" : "Archiwizuj"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        <Link to="/settings/administrators" className="font-semibold text-cyan-700 underline">
          ← Lista użytkowników
        </Link>
      </p>
    </div>
  );
}
