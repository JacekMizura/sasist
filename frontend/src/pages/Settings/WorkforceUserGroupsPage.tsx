import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Archive, ArchiveRestore, MoreVertical, Plus } from "lucide-react";

import {
  createWorkforceUserGroup,
  fetchWorkforceUserGroups,
  updateWorkforceUserGroup,
  type WorkforceUserGroupDto,
} from "../../api/workforceGroupsApi";
import { useAuth } from "../../context/AuthContext";
import { isSuperRole } from "../../auth/isSuperRole";

const inputCls =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

type ActionsMenuState = { id: number; top: number; left: number };

export default function WorkforceUserGroupsPage() {
  const { user, hasPermission } = useAuth();
  const can = hasPermission("settings.users") || isSuperRole(user?.role ?? "");
  const [rows, setRows] = useState<WorkforceUserGroupDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<ActionsMenuState | null>(null);

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

  useEffect(() => {
    if (!menu) return;
    const onScroll = () => setMenu(null);
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("[data-groups-menu]") || el.closest("[data-groups-trigger]")) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

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
      await updateWorkforceUserGroup(g.id, {
        archived_at: g.archived_at ? null : new Date().toISOString(),
      });
      toast.success(g.archived_at ? "Grupa przywrócona." : "Grupa zarchiwizowana.");
      await load();
    } catch {
      toast.error("Operacja nie powiodła się.");
    }
    setMenu(null);
  };

  const openMenu = (id: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const mw = 180;
    setMenu({
      id,
      top: r.bottom + 6,
      left: Math.min(window.innerWidth - mw - 8, Math.max(8, r.right - mw)),
    });
  };

  if (!can) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-700">Brak uprawnienia.</p>
      </div>
    );
  }

  const menuPortal =
    menu && typeof document !== "undefined"
      ? createPortal(
          <div
            data-groups-menu
            className="fixed z-[200] min-w-[180px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/70"
            style={{ top: menu.top, left: menu.left }}
            role="menu"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
              role="menuitem"
              onClick={() => {
                const g = rows.find((x) => x.id === menu.id);
                if (g) void toggleArchive(g);
              }}
            >
              {rows.find((x) => x.id === menu.id)?.archived_at ? (
                <>
                  <ArchiveRestore className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} />
                  Przywróć
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} />
                  Archiwizuj
                </>
              )}
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="min-w-0 space-y-6">
      {/* Formularz - Inline */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Nowa grupa</h2>
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="w-full sm:w-auto sm:min-w-[16rem] flex-1">
            <label htmlFor="group-name" className="block text-xs font-medium text-slate-700 mb-1.5">
              Nazwa
            </label>
            <input
              id="group-name"
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Magazynierzy"
            />
          </div>
          <div className="w-full sm:w-auto shrink-0">
            <label htmlFor="group-color" className="block text-xs font-medium text-slate-700 mb-1.5">
              Kolor
            </label>
            <input
              id="group-color"
              type="color"
              className="h-10 w-full sm:w-16 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onCreate()}
            className="inline-flex h-10 w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Dodaj grupę
          </button>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-600">Brak utworzonych grup operacyjnych.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-6 py-4">Grupa operacyjna</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((g) => (
                  <tr key={g.id} className="group hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full shadow-sm ring-2 ring-white"
                          style={{ backgroundColor: g.color }}
                          aria-hidden
                        />
                        <span className="font-semibold text-slate-900">{g.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          g.archived_at ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            g.archived_at ? "bg-slate-400" : "bg-emerald-500"
                          }`}
                          aria-hidden
                        />
                        {g.archived_at ? "Zarchiwizowana" : "Aktywna"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        data-groups-trigger
                        aria-label="Opcje grupy"
                        aria-expanded={menu?.id === g.id}
                        className="inline-flex rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menu?.id === g.id) setMenu(null);
                          else openMenu(g.id, e.currentTarget);
                        }}
                      >
                        <MoreVertical className="h-5 w-5" strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {menuPortal}
    </div>
  );
}