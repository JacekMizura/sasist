import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";

import { extractApiErrorMessage } from "@/api/authApi";
import {
  consumeLoginNotice,
  getLastLoginEmail,
  getRememberMePreference,
  setLastLoginEmail,
  type LoginNotice,
} from "@/auth/authSessionPrefs";
import { resolveAxiosBaseURL } from "@/config/apiBase";
import { useAuth } from "@/context/AuthContext";

type Props = {
  onSuccess: () => void;
};

function noticeMessage(notice: LoginNotice | null): string | null {
  if (notice === "session_expired") return "Sesja wygasła — zaloguj się ponownie.";
  if (notice === "logged_out") return "Wylogowano pomyślnie.";
  if (notice === "account_inactive") return "Konto jest nieaktywne — skontaktuj się z administratorem.";
  return null;
}

function envLabel(): string {
  return import.meta.env.PROD ? "Produkcja" : "Development";
}

/** Right-side login form — premium SaaS styling. */
export default function LoginFormPanel({ onSuccess }: Props) {
  const { login } = useAuth();
  const emailRef = useRef<HTMLInputElement>(null);

  const [ident, setIdent] = useState(() => getLastLoginEmail());
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => getRememberMePreference());
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [err, setErr] = useState<string | null>(() => noticeMessage(consumeLoginNotice()));
  const [busy, setBusy] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const base = resolveAxiosBaseURL().replace(/\/+$/, "");
    const healthUrl = `${base}/system/health`;
    void fetch(healthUrl, { method: "GET", mode: "cors" })
      .then((r) => {
        if (!cancelled) setApiOnline(r.ok);
      })
      .catch(() => {
        if (!cancelled) setApiOnline(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onCapsLock = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(e.getModifierState?.("CapsLock") ?? false);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const trimmed = ident.trim();
    try {
      await login(trimmed, password, rememberMe);
      setLastLoginEmail(trimmed);
      onSuccess();
    } catch (error) {
      const msg = extractApiErrorMessage(error, "Nieprawidłowy login lub hasło.");
      if (/nieaktyw|inactive|disabled/i.test(msg)) {
        setErr("Konto jest zablokowane lub nieaktywne.");
      } else if (!navigator.onLine) {
        setErr("Brak połączenia z siecią — sprawdź internet i spróbuj ponownie.");
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col justify-center bg-white p-8 lg:w-[45%] lg:p-16">
      <div className="mx-auto w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-3 duration-500">
        <div className="mb-10 flex items-center justify-center gap-2 lg:hidden">
          <Layers className="h-8 w-8 text-indigo-600" strokeWidth={2} />
          <span className="text-2xl font-bold tracking-tight text-slate-900">Sasist</span>
        </div>

        <div className="mb-8 text-center lg:text-left">
          <h2 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Witaj ponownie</h2>
          <p className="text-sm text-slate-500">Zaloguj się do systemu Sasist</p>
        </div>

        {err ? (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
            <span>{err}</span>
          </div>
        ) : null}

        <form className="space-y-5" onSubmit={(e) => void onSubmit(e)}>
          <div>
            <label
              htmlFor="login-ident"
              className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Adres e-mail lub login
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                ref={emailRef}
                id="login-ident"
                type="text"
                autoComplete="username"
                required
                value={ident}
                onChange={(e) => setIdent(e.target.value)}
                placeholder="twoj.adres@firma.pl"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3.5 pl-11 pr-4 text-sm font-medium text-slate-900 transition-all placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Hasło
              </label>
              <button
                type="button"
                className="text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-700"
                onClick={() => setErr("Reset hasła — skontaktuj się z administratorem systemu.")}
              >
                Zapomniałeś hasła?
              </button>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onCapsLock}
                onKeyUp={onCapsLock}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3.5 pl-11 pr-12 text-sm font-medium text-slate-900 transition-all placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {capsLockOn ? (
              <p className="mt-1.5 text-xs font-medium text-amber-700">Włączony Caps Lock</p>
            ) : null}
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600/30"
            />
            <span>Zapamiętaj mnie na tym urządzeniu</span>
          </label>

          <button
            type="submit"
            disabled={busy}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Logowanie…
              </>
            ) : (
              <>
                Zaloguj się
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-6 text-[11px] text-slate-400">
          <span>Wersja {import.meta.env.VITE_APP_VERSION ?? "0.0.0"}</span>
          <span>{envLabel()}</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                apiOnline === null ? "bg-slate-300" : apiOnline ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            API {apiOnline === null ? "…" : apiOnline ? "online" : "offline"}
          </span>
        </div>
      </div>
    </div>
  );
}
