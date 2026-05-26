import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LogOut, Settings, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

function initials(u: { first_name: string | null; last_name: string | null; login: string }): string {
  const a = (u.first_name ?? "").trim().charAt(0);
  const b = (u.last_name ?? "").trim().charAt(0);
  if (a && b) return (a + b).toUpperCase();
  if (a) return a.toUpperCase();
  return u.login.slice(0, 2).toUpperCase();
}

type UserAccountMenuProps = {
  /** Dense header row: smaller avatar, tighter padding. */
  compact?: boolean;
};

const MENU_Z = 10050;

export default function UserAccountMenu({ compact = false }: UserAccountMenuProps) {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const updateMenuPos = () => {
    const b = triggerRef.current?.getBoundingClientRect();
    if (!b) return;
    setMenuPos({ top: b.bottom + 8, right: window.innerWidth - b.right });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      updateMenuPos();
    });
    window.addEventListener("scroll", updateMenuPos, true);
    window.addEventListener("resize", updateMenuPos);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", updateMenuPos, true);
      window.removeEventListener("resize", updateMenuPos);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!user) {
    return (
      <Link
        to="/login"
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 transition-colors"
      >
        Zaloguj
      </Link>
    );
  }

  const display =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.login;

  const menuBody = (
    <div
      ref={menuRef}
      className="w-60 rounded-2xl border border-slate-100 bg-white/95 backdrop-blur-xl py-2 shadow-xl shadow-slate-200/50"
      style={
        menuPos
          ? { position: "fixed", top: menuPos.top, right: menuPos.right, zIndex: MENU_Z }
          : { position: "fixed", visibility: "hidden", zIndex: MENU_Z }
      }
      role="menu"
    >
      <div className="border-b border-slate-100 px-4 py-3 mb-1">
        <p className="truncate text-sm font-bold text-slate-900">{display}</p>
        <p className="truncate text-xs font-medium text-slate-500 mt-0.5">{user.login}</p>
        <div className="mt-2.5 inline-flex rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
          {user.role}
        </div>
      </div>
      
      <div className="px-1.5 space-y-0.5">
        {hasPermission("settings.users") ? (
          <Link
            to="/settings/administrators"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            <Users className="h-4 w-4 shrink-0 text-slate-400" />
            Administratorzy
          </Link>
        ) : null}
        <Link
          to="/settings/company"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          onClick={() => setOpen(false)}
          role="menuitem"
        >
          <Settings className="h-4 w-4 shrink-0 text-slate-400" />
          Firma i magazyny
        </Link>
        
        <div className="my-1 border-t border-slate-100 mx-2"></div>
        
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            void (async () => {
              await logout();
              navigate("/login", { replace: true });
            })();
          }}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Wyloguj sesję
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "group flex items-center rounded-xl transition-colors hover:bg-slate-50",
          compact ? "gap-3 p-1" : "gap-3 p-1.5 pr-3 text-left",
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        
        {/* TEKST (Dla wersji compact pokazujemy go po LEWEJ stronie od awatara) */}
        {compact ? (
          <span className="hidden min-w-0 flex-col text-right xl:flex justify-center h-full">
            <span className="max-w-[9.5rem] truncate text-sm font-bold leading-tight text-slate-900">{display}</span>
            <span className="max-w-[9.5rem] truncate text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              {user.role}
            </span>
          </span>
        ) : null}

        {/* AWATAR */}
        <span
          className={[
            "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-blue-50 font-bold text-indigo-700 border border-indigo-200 shadow-sm transition-transform group-hover:scale-105",
            compact ? "h-9 w-9 text-sm" : "h-10 w-10 text-sm",
          ].join(" ")}
        >
          {initials(user)}
        </span>
        
        {/* TEKST (Dla wersji normalnej pokazujemy go po PRAWEJ stronie od awatara) */}
        {!compact ? (
          <span className="hidden max-w-[10rem] truncate text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors sm:inline">
            {display}
          </span>
        ) : null}

        {/* STRZAŁKA */}
        <ChevronDown 
          className={`shrink-0 text-slate-400 group-hover:text-slate-600 transition-colors ${
            compact ? "h-4 w-4 hidden xl:block mr-1" : "h-4 w-4"
          }`} 
          aria-hidden 
        />

      </button>
      {open && typeof document !== "undefined" ? createPortal(menuBody, document.body) : null}
    </div>
  );
}