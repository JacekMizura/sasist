import { Component, type ErrorInfo, type ReactNode } from "react";

import { isStaleChunkError, tryStaleChunkReload } from "../utils/staleChunkRecovery";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null };

/**
 * Catches render errors so one broken page (e.g. Orders) doesn't freeze the whole app.
 * Shows message + stack on screen so production "white screen" reports are diagnosable.
 * Stale Vite chunks after deploy: one controlled full reload (not ordinary TypeErrors).
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Caught error:", error, errorInfo.componentStack);
    if (isStaleChunkError(error)) {
      tryStaleChunkReload();
    }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      const err = this.state.error;
      console.error("[ErrorBoundary] render fallback UI", err, this.state.errorInfo?.componentStack);
      const stack = typeof err.stack === "string" ? err.stack : "";
      const compStack = this.state.errorInfo?.componentStack ?? "";
      return (
        <div className="w-full rounded-lg border border-red-300 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-bold text-red-900">Błąd renderowania strony</h2>
          <p className="mb-4 font-mono text-sm text-red-800">{err.message || String(err)}</p>
          {stack ? (
            <details open className="mb-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Stack trace</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                {stack}
              </pre>
            </details>
          ) : null}
          {compStack ? (
            <details className="mb-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Component stack</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                {compStack}
              </pre>
            </details>
          ) : null}
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
          >
            Spróbuj ponownie
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
