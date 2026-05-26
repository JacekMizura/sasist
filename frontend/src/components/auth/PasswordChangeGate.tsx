import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";
import { useLocation } from "react-router-dom";

import { changePassword } from "../../api/authApi";
import { useAuth } from "../../context/AuthContext";

/** Blocks the shell until the seeded superadmin sets a new password; optional loud dev warning. */
export default function PasswordChangeGate() {
  const { user, loading, refreshSession } = useAuth();
  const location = useLocation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading || !user || location.pathname === "/login") {
    return null;
  }

  const mustChange = Boolean(user.password_must_change);
  const devWarn =
    import.meta.env.DEV &&
    (Boolean(user.show_dev_credentials_warning) ||
      (Boolean(user.is_system_seed) && mustChange));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 6) {
      toast.error("Nowe hasło: minimum 6 znaków");
      return;
    }
    if (next !== confirm) {
      toast.error("Powtórzenie hasła nie jest zgodne");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      toast.success("Hasło zostało zmienione");
      setCurrent("");
      setNext("");
      setConfirm("");
      await refreshSession();
    } catch {
      toast.error("Zmiana hasła nie powiodła się (sprawdź obecne hasło)");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {devWarn && (
        <div
          className="pointer-events-none fixed left-0 right-0 top-0 z-[110] border-b border-red-800 bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-md"
          role="status"
        >
          Deweloperskie środowisko: aktywne domyślne konto seed (admin / admin). Zmień hasło przed
          wdrożeniem produkcyjnym.
        </div>
      )}
      {mustChange && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 ${devWarn ? "pt-14" : ""}`}
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Wymagana zmiana hasła</h2>
            <p className="mt-2 text-sm text-slate-600">
              To konto startowe ma domyślne hasło. Ustaw nowe hasło, aby kontynuować.
            </p>
            <form className="mt-4 space-y-3" onSubmit={onSubmit}>
              <label className="block text-sm font-medium text-slate-700">
                Obecne hasło
                <input
                  type="password"
                  autoComplete="current-password"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Nowe hasło (min. 6 znaków)
                <input
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  required
                  minLength={6}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Powtórz nowe hasło
                <input
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="mt-2 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {busy ? "Zapisywanie…" : "Zmień hasło"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
