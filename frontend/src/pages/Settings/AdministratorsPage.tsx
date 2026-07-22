import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Ban,
  Filter,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Shield,
  Trash2,
  Users,
  Search,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import {
  deleteUser,
  fetchUsers,
  resetUserPassword,
  updateUser,
  type AppUserListItem,
} from "../../api/authApi";
import { isSuperRole } from "../../auth/isSuperRole";
import { useAuth } from "../../context/AuthContext";
import { WMS_OPERATIONAL_MODE_LABELS_PL } from "../../constants/wmsOperationalModes";
import { PLATFORM_ROLE_OPTIONS } from "../../settings/platformRoles";
import { printOrDownloadUserLoginCode } from "../../utils/userLoginCodeLabel";

function initials(row: AppUserListItem) {
  const a = (row.first_name?.[0] ?? "").toUpperCase();
  const b = (row.last_name?.[0] ?? "").toUpperCase();
  if (a || b) return `${a}${b}`;
  return (row.login?.slice(0, 2) ?? "?").toUpperCase();
}

function fmtDt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function displayName(row: AppUserListItem) {
  const n = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return n || row.login;
}

/** Screenshot palette: soft green chips; rose for reklamacje/zwroty. */
function modeBadgeClass(key: string): string {
  const k = key.toLowerCase();
  if (k === "returns" || k === "complaints" || k.includes("reklam")) {
    return "bg-rose-50 text-rose-800 ring-rose-200";
  }
  return "bg-emerald-50 text-emerald-800 ring-emerald-200";
}

type ActiveFilter = "all" | "active" | "inactive";

type ActionsMenuState = { userId: number; top: number; left: number };

export default function AdministratorsPage() {
  const { user, loading: authLoading, hasPermission, sessionReady } = useAuth();
  const canManageUsers =
    hasPermission("settings.users") || isSuperRole(user?.role ?? "");
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState<AppUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [menu, setMenu] = useState<ActionsMenuState | null>(null);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterActive, setFilterActive] = useState<ActiveFilter>("all");
  const [filterRole, setFilterRole] = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("");

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
      if (
        el.closest("[data-admin-actions-menu]") ||
        el.closest("[data-admin-actions-trigger]")
      )
        return;
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
    if (row.is_system_user || isSuperRole(row.role)) {
      toast.error("Nie można dezaktywować konta SUPER_ADMIN / użytkownika systemowego.");
      setMenu(null);
      return;
    }
    try {
      await updateUser(row.id, { is_active: !row.is_active });
      toast.success(
        row.is_active ? "Użytkownik dezaktywowany" : "Użytkownik aktywowany"
      );
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
      toast.success(
        "Hasło zostało ustawione — użytkownik musi je zmienić przy logowaniu."
      );
      await load();
    } catch {
      toast.error("Reset hasła nie powiódł się");
    }
    setMenu(null);
  };

  const onDelete = async (row: AppUserListItem) => {
    if (row.is_system_seed || row.is_system_user || row.is_deletable === false || row.is_owner) {
      toast.error("Tego użytkownika nie można usunąć.");
      return;
    }
    if (
      !window.confirm(`Usunąć konto ${row.login}? Ta operacja jest nieodwracalna.`)
    )
      return;
    try {
      await deleteUser(row.id);
      toast.success("Użytkownik usunięty");
      await load();
    } catch {
      toast.error("Usunięcie nie powiodło się");
    }
    setMenu(null);
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const wh = filterWarehouse.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterActive === "active" && !r.is_active) return false;
      if (filterActive === "inactive" && r.is_active) return false;
      if (filterRole && r.role !== filterRole) return false;
      if (wh) {
        const names = (r.warehouse_names ?? []).join(" ").toLowerCase();
        const summary = (r.warehouse_summary ?? "").toLowerCase();
        if (!names.includes(wh) && !summary.includes(wh)) return false;
      }
      if (!q) return true;
      const blob = [
        r.login,
        r.email,
        r.first_name,
        r.last_name,
        r.role,
        ...(r.warehouse_names ?? []),
        r.warehouse_summary,
        ...(r.wms_operational_modes ?? []).map((m) => WMS_OPERATIONAL_MODE_LABELS_PL[m] ?? m),
        r.primary_workforce_group?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search, filterActive, filterRole, filterWarehouse]);

  const filtersActive =
    filterActive !== "all" || Boolean(filterRole) || Boolean(filterWarehouse.trim());

  const clearFilters = () => {
    setFilterActive("all");
    setFilterRole("");
    setFilterWarehouse("");
  };

  if (!authLoading && !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!authLoading && user && !canManageUsers) {
    return (
      <div className="px-1 pb-2 pt-1">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">
            Brak uprawnienia „Ustawienia → Administratorzy”.
          </p>
        </div>
      </div>
    );
  }

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
                setMenu(null);
                if (!row) return;
                void (async () => {
                  try {
                    await printOrDownloadUserLoginCode({ userId: row.id, login: row.login });
                    toast.success("Wygenerowano PDF etykiety kodu logowania.");
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : "";
                    if (msg === "NO_LOGIN_CODE") {
                      toast.error("Brak kodu logowania — uzupełnij go w karcie użytkownika (WMS i magazyny).");
                    } else if (msg === "NO_LOGIN_CODE_TEMPLATE") {
                      toast.error("Brak szablonu etykiety typu „Kod logowania użytkownika”.");
                    } else {
                      toast.error("Nie udało się wydrukować kodu logowania.");
                    }
                  }
                })();
              }}
            >
              <Printer className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              Drukuj kod logowania
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
              role="menuitem"
              onClick={() => {
                const row = rows.find((x) => x.id === menu.userId);
                if (row) void onResetPassword(row);
              }}
            >
              <KeyRound className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              Reset hasła
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              role="menuitem"
              disabled={(() => {
                const row = rows.find((x) => x.id === menu.userId);
                return Boolean(row && (row.is_system_user || isSuperRole(row.role)));
              })()}
              onClick={() => {
                const row = rows.find((x) => x.id === menu.userId);
                if (row) void onToggleActive(row);
              }}
            >
              <Ban className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              {rows.find((x) => x.id === menu.userId)?.is_active
                ? "Dezaktywuj"
                : "Aktywuj"}
            </button>
            <div className="my-1 border-t border-slate-100" role="separator" />
            <button
              type="button"
              disabled={(() => {
                const row = rows.find((x) => x.id === menu.userId);
                return Boolean(
                  row &&
                    (row.is_system_seed ||
                      row.is_system_user ||
                      row.is_owner ||
                      row.is_deletable === false),
                );
              })()}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              role="menuitem"
              onClick={() => {
                const row = rows.find((x) => x.id === menu.userId);
                if (row) void onDelete(row);
              }}
            >
              <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              Usuń
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="min-w-0 space-y-4">
      {err && <p className="text-sm text-red-600">{err}</p>}

      {/* Search + filter bar */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Wyszukaj..."
              aria-label="Wyszukaj użytkowników"
              className="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
            />
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((v) => !v)}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-200 sm:w-auto ${
                filtersActive || filterOpen
                  ? "border-slate-400 bg-slate-50 text-slate-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Filter className="h-4 w-4 text-slate-500" aria-hidden="true" />
              Filtruj
              {filtersActive ? (
                <span className="rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">!</span>
              ) : null}
            </button>
          </div>
        </div>

        {filterOpen ? (
          <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value as ActiveFilter)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-800"
              >
                <option value="all">Wszyscy</option>
                <option value="active">Aktywni</option>
                <option value="inactive">Nieaktywni</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Rola
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-800"
              >
                <option value="">Wszystkie</option>
                {PLATFORM_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Magazyn
              <div className="flex gap-2">
                <input
                  type="text"
                  value={filterWarehouse}
                  onChange={(e) => setFilterWarehouse(e.target.value)}
                  placeholder="Nazwa magazynu…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-800 placeholder:text-slate-400"
                />
                {filtersActive ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    title="Wyczyść filtry"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Wyczyść
                  </button>
                ) : null}
              </div>
            </label>
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
          <Users className="h-10 w-10 text-slate-300" strokeWidth={1.5} aria-hidden />
          <p className="mt-4 text-base font-semibold text-slate-800">
            Dodaj pierwszego administratora
          </p>
          <p className="mt-1 max-w-md text-sm text-slate-600">
            Utwórz pierwsze konto z dostępem do panelu i magazynu — później dodasz kolejnych użytkowników i role.
          </p>
          <button
            type="button"
            onClick={goToNewUser}
            className="mt-6 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dodaj użytkownika
          </button>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-800">Brak wyników</p>
          <p className="mt-1 text-sm text-slate-600">Zmień wyszukiwanie lub filtry.</p>
          {(search || filtersActive) && (
            <button
              type="button"
              className="mt-4 text-sm font-medium text-orange-600 hover:text-orange-700"
              onClick={() => {
                setSearch("");
                clearFilters();
              }}
            >
              Wyczyść wyszukiwanie i filtry
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredRows.map((r) => {
            // Generowanie tagów dla sekcji "Permisje"
            const allTags = [];
            if (r.primary_workforce_group) {
              allTags.push(
                <span
                  key="wg"
                  className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset"
                  style={{
                    backgroundColor: `${r.primary_workforce_group.color}15`,
                    color: r.primary_workforce_group.color,
                    borderColor: `${r.primary_workforce_group.color}30`,
                  }}
                  title="Grupa operacyjna"
                >
                  {r.primary_workforce_group.name}
                </span>
              );
            }
            (r.wms_operational_modes ?? []).forEach((m) => {
              allTags.push(
                <span
                  key={m}
                  className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${modeBadgeClass(
                    m
                  )}`}
                  title="Tryb WMS"
                >
                  {WMS_OPERATIONAL_MODE_LABELS_PL[m] ?? m}
                </span>
              );
            });

            const displayTags = allTags.slice(0, 4);
            const moreTagsCount = allTags.length - 4;

            return (
              <div
                key={r.id}
                className="grid grid-cols-1 items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:grid-cols-[minmax(200px,2.5fr)_1fr_1fr_minmax(150px,2fr)_1fr_minmax(180px,1.5fr)_auto]"
              >
                {/* 1. Użytkownik */}
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-500 text-sm font-bold text-white shadow-sm"
                    aria-hidden
                  >
                    {initials(r)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">
                      {displayName(r)}
                    </div>
                    {r.email ? (
                      <div className="truncate text-sm text-slate-500" title={r.email}>
                        {r.email}
                      </div>
                    ) : (
                      <div className="truncate text-sm text-slate-500">{r.login}</div>
                    )}
                  </div>
                </div>

                {/* 2. Rola */}
                <div className="flex min-w-0 flex-col">
                  <span className="mb-0.5 text-xs text-slate-500">Rola</span>
                  <span className="truncate font-medium text-slate-800">
                    {r.role}
                  </span>
                </div>

                {/* 3. Magazyn */}
                <div className="flex min-w-0 flex-col">
                  <span className="mb-0.5 text-xs text-slate-500">Magazyn</span>
                  <div className="flex flex-wrap gap-1">
                    {(r.warehouse_names?.length ?? 0) > 0 ? (
                      r.warehouse_names!.map((name) => (
                        <span
                          key={name}
                          className="inline-flex max-w-full truncate rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-800 ring-1 ring-slate-200"
                          title={name}
                        >
                          {name}
                        </span>
                      ))
                    ) : r.warehouse_summary?.trim() ? (
                      <span className="truncate font-medium text-slate-800" title={r.warehouse_summary}>
                        {r.warehouse_summary}
                      </span>
                    ) : (
                      <span className="font-medium text-slate-800">—</span>
                    )}
                  </div>
                </div>

                {/* 4. Permisje / Tagi */}
                <div className="flex min-w-0 flex-col">
                  <span className="mb-1 text-xs text-slate-500">Permisje</span>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.length > 0 ? (
                      <>
                        {displayTags}
                        {moreTagsCount > 0 && (
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                            +{moreTagsCount} innych
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="font-medium text-slate-800">—</span>
                    )}
                  </div>
                </div>

                {/* 5. Status */}
                <div className="flex items-center">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                      r.is_active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        r.is_active ? "bg-emerald-500" : "bg-slate-400"
                      }`}
                      aria-hidden
                    ></span>
                    {r.is_active ? "Aktywny" : "Nieaktywny"}
                  </span>
                </div>

                {/* 6. Daty */}
                <div className="flex min-w-0 flex-col space-y-1 text-xs">
                  <div className="truncate">
                    <span className="text-slate-500">Ostatnie logowanie:</span>
                    <br />
                    <span className="font-medium text-slate-800">
                      {fmtDt(r.last_login_at)}
                    </span>
                  </div>
                  <div className="truncate">
                    <span className="text-slate-500">Utworzono:</span>
                    <br />
                    <span className="font-medium text-slate-800">
                      {fmtDt(r.created_at)}
                    </span>
                  </div>
                </div>

                {/* 7. Akcje */}
                <div className="ml-auto flex items-center justify-end pl-2">
                  <button
                    type="button"
                    data-admin-actions-trigger
                    aria-label="Więcej akcji"
                    aria-expanded={menu?.userId === r.id}
                    className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (menu?.userId === r.id) setMenu(null);
                      else openActionsMenu(r, e.currentTarget);
                    }}
                  >
                    <MoreHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {menuPortal}
    </div>
  );
}