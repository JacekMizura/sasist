import { useEffect, useMemo } from "react";
import { isRouteErrorResponse, Link, useNavigate, useRouteError } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Home, RefreshCw } from "lucide-react";

import MainPanelLayout from "../../layout/MainPanelLayout";
import {
  hasStaleChunkReloadBeenAttempted,
  isStaleChunkError,
  tryStaleChunkReload,
} from "../../utils/staleChunkRecovery";

function correlationId(): string {
  return `ERR-${Date.now().toString(36).toUpperCase()}`;
}

/** Branded ERP route error — no developer-facing default page. */
export default function ErpPanelRouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const ref = useMemo(() => correlationId(), []);
  const staleChunk = isStaleChunkError(error);
  const reloadAlreadyTried = hasStaleChunkReloadBeenAttempted();

  useEffect(() => {
    if (!staleChunk) return;
    if (reloadAlreadyTried) return;
    tryStaleChunkReload();
  }, [staleChunk, reloadAlreadyTried]);

  if (staleChunk && !reloadAlreadyTried) {
    return (
      <MainPanelLayout>
        <div className="flex min-h-[40vh] items-center justify-center px-6 text-sm text-slate-600">
          Odświeżanie aplikacji po aktualizacji…
        </div>
      </MainPanelLayout>
    );
  }

  const status = isRouteErrorResponse(error) ? error.status : undefined;
  const is404 = status === 404;
  const title = staleChunk
    ? "Aplikacja została zaktualizowana"
    : is404
      ? "Nie znaleziono strony"
      : "Wystąpił błąd";
  const message = staleChunk
    ? "Wersja w tej karcie jest nieaktualna. Odśwież aplikację, aby wczytać najnowsze pliki."
    : is404
      ? "Żądany adres nie istnieje lub został przeniesiony."
      : isRouteErrorResponse(error) && typeof error.data === "string"
        ? error.data
        : error instanceof Error
          ? error.message
          : "Spróbuj ponownie lub wróć do pulpitu.";

  return (
    <MainPanelLayout>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <div className="rounded-full bg-rose-50 p-3 text-rose-600">
          <AlertTriangle className="h-8 w-8" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="max-w-md text-sm text-slate-600">{message}</p>
        <p className="text-[10px] font-mono text-slate-400">ID: {ref}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> {staleChunk ? "Odśwież aplikację" : "Spróbuj ponownie"}
          </button>
          <button
            type="button"
            onClick={() => void navigate(-1)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Wstecz
          </button>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            <Home className="h-4 w-4" /> Pulpit ERP
          </Link>
        </div>
      </div>
    </MainPanelLayout>
  );
}
