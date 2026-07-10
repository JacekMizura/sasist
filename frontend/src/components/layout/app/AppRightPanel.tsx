import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { appLayoutClasses, appLayoutTokens } from "../../../layout/appLayoutTokens";

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 360;
const MAX_WIDTH = 420;

export type AppRightPanelProps = {
  children: ReactNode;
  /** When false the panel is not rendered. */
  open: boolean;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  className?: string;
  /** Children supply their own header/footer (e.g. designer rack panel). */
  bare?: boolean;
  /** Enable drag resize (360–420px). */
  resizable?: boolean;
  widthStorageKey?: string;
  "aria-label"?: string;
};

function readStoredWidth(key: string | undefined): number {
  if (!key) return DEFAULT_WIDTH;
  try {
    const n = Number(localStorage.getItem(key));
    if (Number.isFinite(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH;
}

/**
 * In-flow right detail panel — never fixed to viewport.
 */
export function AppRightPanel({
  children,
  open,
  onClose,
  title,
  subtitle,
  className,
  bare = false,
  resizable = false,
  widthStorageKey,
  "aria-label": ariaLabel,
}: AppRightPanelProps) {
  const [panelWidth, setPanelWidth] = useState(() => readStoredWidth(widthStorageKey));
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    if (!resizable) return;
    const onMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, r.startW + (r.startX - e.clientX)));
      setPanelWidth(next);
    };
    const onUp = () => {
      if (resizeRef.current && widthStorageKey) {
        try {
          localStorage.setItem(widthStorageKey, String(panelWidth));
        } catch {
          /* ignore */
        }
      }
      resizeRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panelWidth, resizable, widthStorageKey]);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (!resizable) return;
      e.preventDefault();
      resizeRef.current = { startX: e.clientX, startW: panelWidth };
    },
    [panelWidth, resizable],
  );

  if (!open) return null;

  const resizeHandle = resizable ? (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Zmień szerokość panelu"
      className="absolute left-0 top-0 bottom-0 z-10 w-1.5 cursor-col-resize hover:bg-blue-200/60"
      onMouseDown={onResizeStart}
    />
  ) : null;

  if (bare) {
    return (
      <aside
        className={[appLayoutClasses.rightPanel, "relative", className ?? ""].filter(Boolean).join(" ")}
        style={resizable ? { width: panelWidth, maxWidth: MAX_WIDTH } : undefined}
        aria-label={ariaLabel ?? title ?? "Panel boczny"}
      >
        {resizeHandle}
        {children}
      </aside>
    );
  }

  return (
    <aside
      className={[appLayoutClasses.rightPanel, "relative", className ?? ""].filter(Boolean).join(" ")}
      style={resizable ? { width: panelWidth, maxWidth: MAX_WIDTH } : undefined}
      aria-label={ariaLabel ?? title ?? "Panel boczny"}
    >
      {resizeHandle}
      {(title || onClose) && (
        <header
          className={`relative flex shrink-0 items-start justify-between gap-2 border-b ${appLayoutTokens.appBorder} px-4 py-3`}
        >
          <div className="min-w-0">
            {subtitle ? (
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{subtitle}</p>
            ) : null}
            {title ? <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2> : null}
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Zamknij panel"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </header>
      )}
      <div className={appLayoutClasses.rightPanelScroll}>{children}</div>
    </aside>
  );
}
