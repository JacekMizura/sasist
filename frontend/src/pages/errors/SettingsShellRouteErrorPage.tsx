import { isRouteErrorResponse, Link, useNavigate, useRouteError } from "react-router-dom";

import ErpShellLayout from "../../layout/ErpShellLayout";

/**
 * Błąd trasy w obrębie ustawień / dokumentów / admin — pełny szkielet ERP (sidebar + nagłówek),
 * bez surowego „Unexpected Application Error”.
 */
export default function SettingsShellRouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  const status = isRouteErrorResponse(error) ? error.status : undefined;
  const title =
    status === 404
      ? "Nie znaleziono strony"
      : isRouteErrorResponse(error) && error.statusText
        ? error.statusText
        : error instanceof Error
          ? error.message
          : "Wystąpił nieoczekiwany błąd";

  return (
    <ErpShellLayout headerMode="settings">
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {status != null ? <p className="text-sm text-slate-500">Kod odpowiedzi: {status}</p> : null}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            onClick={() => void navigate(-1)}
          >
            Powrót
          </button>
          <Link
            to="/settings/company"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Ustawienia — firma
          </Link>
        </div>
      </div>
    </ErpShellLayout>
  );
}
