import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { MoreHorizontal, Pencil, Plus, Shield, Users } from "lucide-react";
import toast from "react-hot-toast";

import {
  deleteUser,
  fetchUsers,
  resetUserPassword,
  updateUser,
  type AppUserListItem,
} from "../../api/authApi";
import {
  listSellasistTableBodyCellGrid,
  listSellasistTableHeaderCellGrid,
} from "../../components/listPage/listSellasistTokens";
import {
  OperationalActionButton,
  OperationalActionColumn,
  operationalActionsColumnWidthClass,
} from "../../components/operational";
import { isSuperRole } from "../../auth/isSuperRole";
import { useAuth } from "../../context/AuthContext";
import { WMS_OPERATIONAL_MODE_LABELS_PL } from "../../constants/wmsOperationalModes";

function initials(row: AppUserListItem) {
  const a = (row.first_name?.[0] ?? "").toUpperCase();
  const b = (row.last_name?.[0] ?? "").toUpperCase();
  if (a || b) return `${a}${b}`;
  return (row.login?.slice(0, 2) ?? "?").toUpperCase();
}

function fmtDt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function displayName(row: AppUserListItem) {
  const n = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return n || row.login;
}

function modeBadgeClass(key: string): string {
  const palette = [
    "bg-sky-50 text-sky-900 ring-sky-200",
    "bg-violet-50 text-violet-900 ring-violet-200",
    "bg-amber-50 text-amber-900 ring-amber-200",
    "bg-emerald-50 text-emerald-900 ring-emerald-200",
    "bg-rose-50 text-rose-900 ring-rose-200",
  ];
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

type ActionsMenuState = { userId: number; top: number; left: number };

export default function AdministratorsPage() {
  const { user, loading: authLoading, hasPermission, sessionReady } = useAuth();
  const canManageUsers = hasPermission("settings.users") || isSuperRole(user?.role ?? "");
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState<AppUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [menu, setMenu] = useState<ActionsMenuState | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const list = await fetchUsers();
      setRows(list);
    } catch {
      setErr("Nie udało się wczytać listy użytkowników.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const goToNewUser = () => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[Admin] ADD USER CLICK — navigate /settings/administrators/new");
    }
    navigate("/settings/administrators/new");
  };

  useEffect(() => {
    if (!canManageUsers) {
      setLoading(false);
      return;
    }
    if (!sessionReady) {
      setLoading(true);
      return;
    }
    void load();
  }, [canManageUsers, load, sessionReady]);

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
      if (el.closest("[data-admin-actions-menu]") || el.closest("[data-admin-actions-trigger]")) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  const openActionsMenu = (row: AppUserListItem, triggerEl: HTMLElement) => {
    const r = triggerEl.getBoundingClientRect();
    const mw = 228;
    setMenu({
      userId: row.id,
      top: r.bottom + 6,
      left: Math.min(window.innerWidth - mw - 8, Math.max(8, r.right - mw)),
    });
  };

  const onToggleActive = async (row: AppUserListItem) => {
    try {
      await updateUser(row.id, { is_active: !row.is_active });
      toast.success(row.is_active ? "Użytkownik dezaktywowany" : "Użytkownik aktywowany");
      await load();
    } catch {
      toast.error("Operacja nie powiodła się");
    }
    setMenu(null);
  };

  const onResetPassword = async (row: AppUserListItem) => {
    const pw = window.prompt(`Nowe hasło dla ${row.login} (min. 6 znaków):`);
    if (pw == null) return;
    if (pw.length < 6) {
      toast.error("Hasło za krótkie");
      return;
    }
    try {
      await resetUserPassword(row.id, pw);
      toast.success("Hasło zostało ustawione — użytkownik musi je zmienić przy logowaniu.");
      await load();
    } catch {
      toast.error("Reset hasła nie powiódł się");
    }
    setMenu(null);
  };

  const onDelete = async (row: AppUserListItem) => {
    if (row.is_system_seed) {
      toast.error("Nie można usunąć konta systemowego seed.");
      return;
    }
    if (!window.confirm(`Usunąć konto ${row.login}? Ta operacja jest nieodwracalna.`)) return;
    try {
      await deleteUser(row.id);
      toast.success("Użytkownik usunięty");
      await load();
    } catch {
      toast.error("Usunięcie nie powiodło się");
    }
    setMenu(null);
  };

  if (!authLoading && !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!authLoading && user && !canManageUsers) {
    return (
      <div className="px-1 pb-2 pt-1">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">Brak uprawnienia „Ustawienia → Administratorzy”.</p>
        </div>
      </div>
    );
  }

  const th = listSellasistTableHeaderCellGrid;
  const td = listSellasistTableBodyCellGrid;
  const theadCls = "sticky top-0 z-[20] bg-slate-50 shadow-[0_1px_0_0_rgb(226_232_240)]";

  const menuPortal =
    menu && typeof document !== "undefined"
      ? createPortal(
          <div
            data-admin-actions-menu
            className="fixed z-[200] min-w-[228px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/70"
            style={{ top: menu.top, left: menu.left }}
            role="menu"
          >
            <Link
              to={`/settings/administrators/${menu.userId}`}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
              role="menuitem"
              onClick={() => setMenu(null)}
            >
              <Pencil className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              Edytuj
            </Link>
            <Link
              to={`/settings/administrators/${menu.userId}?tab=permissions`}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
              role="menuitem"
              onClick={() => setMenu(null)}
            >
              <Shield className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              Uprawnienia
            </Link>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
              role="menuitem"
              onClick={() => {
                const row = rows.find((x) => x.id === menu.userId);
                if (row) void onResetPassword(row);
              }}
            >
              Reset hasła
            </button>
            <button
              type="button"
              className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
              role="menuitem"
              onClick={() => {
                const row = rows.find((x) => x.id === menu.userId);
                if (row) void onToggleActive(row);
              }}
            >
              {rows.find((x) => x.id === menu.userId)?.is_active ? "Dezaktywuj" : "Aktywuj"}
            </button>
            <div className="my-1 border-t border-slate-100" role="separator" />
            <button
              type="button"
              disabled={Boolean(rows.find((x) => x.id === menu.userId)?.is_system_seed)}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              role="menuitem"
              onClick={() => {
                const row = rows.find((x) => x.id === menu.userId);
                if (row) void onDelete(row);
              }}
            >
              Usuń
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="min-w-0 space-y-4">
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
          <Users className="h-10 w-10 text-slate-300" strokeWidth={1.5} aria-hidden />
          <p className="mt-4 text-base font-semibold text-slate-800">Dodaj pierwszego administratora</p>
          <p className="mt-1 max-w-md text-sm text-slate-600">
            Utwórz pierwsze konto z dostępem do panelu i magazynu — później dodasz kolejnych użytkowników i role.
          </p>
          <button
            type="button"
            onClick={goToNewUser}
            className="relative z-10 mt-6 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dodaj użytkownika
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[920px] border-collapse">
            <thead className={theadCls}>
              <tr>
                <th className={`${th} text-left`}>Użytkownik</th>
                <th className={`${th} text-left`}>Rola</th>
                <th className={`${th} text-left`}>Magazyny</th>
                <th className={`${th} text-left`}>Aktywny</th>
                <th className={`${th} text-left`}>Ostatnie logowanie</th>
                <th className={`${th} text-left`}>Utworzono</th>
                <th className={`${th} ${operationalActionsColumnWidthClass} text-center align-top`}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="group cursor-default transition-colors hover:bg-slate-50/90 [&>td]:align-middle"
                >
                  <td className={td}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-xs font-bold text-slate-700 shadow-inner ring-1 ring-slate-200/80"
                        aria-hidden
                      >
                        {initials(r)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900">{displayName(r)}</div>
                        <div className="truncate text-xs text-slate-500">{r.login}</div>
                        {r.email ? (
                          <div className="truncate text-xs text-slate-400" title={r.email}>
                            {r.email}
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {r.primary_workforce_group ? (
                            <span
                              className="inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset"
                              style={{
                                backgroundColor: `${r.primary_workforce_group.color}22`,
                                color: "#0f172a",
                                borderColor: r.primary_workforce_group.color,
                              }}
                              title="Grupa operacyjna"
                            >
                              {r.primary_workforce_group.name}
                            </span>
                          ) : null}
                          {(r.wms_operational_modes ?? []).map((m) => (
                            <span
                              key={m}
                              className={`inline-flex max-w-[10rem] truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${modeBadgeClass(m)}`}
                              title="Tryb WMS"
                            >
                              {WMS_OPERATIONAL_MODE_LABELS_PL[m] ?? m}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={`${td} font-mono text-xs text-slate-800`}>{r.role}</td>
                  <td className={`${td} max-w-[260px]`}>
                    {(r.warehouse_names?.length ?? 0) > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.warehouse_names!.map((name) => (
                          <span
                            key={name}
                            className="inline-flex max-w-full truncate rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-800 ring-1 ring-slate-200"
                            title={name}
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : r.warehouse_summary?.trim() ? (
                      <span className="truncate text-slate-700" title={r.warehouse_summary}>
                        {r.warehouse_summary}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className={td}>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        r.is_active ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                      }`}
                    >
                      {r.is_active ? "tak" : "nie"}
                    </span>
                  </td>
                  <td className={`${td} whitespace-nowrap text-xs text-slate-600`}>{fmtDt(r.last_login_at)}</td>
                  <td className={`${td} whitespace-nowrap text-xs text-slate-600`}>{fmtDt(r.created_at)}</td>
                  <td className={`${td} ${operationalActionsColumnWidthClass} !px-1 !py-1 text-center !align-top`}>
                    <OperationalActionColumn
                      aria-label="Akcje użytkownika"
                      slots={[
                        <OperationalActionButton
                          key="menu"
                          data-admin-actions-trigger
                          aria-label="Więcej akcji"
                          aria-expanded={menu?.userId === r.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (menu?.userId === r.id) setMenu(null);
                            else openActionsMenu(r, e.currentTarget);
                          }}
                        >
                          <MoreHorizontal className="text-slate-600" strokeWidth={2} aria-hidden />
                        </OperationalActionButton>,
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {menuPortal}
    </div>
  );
}
