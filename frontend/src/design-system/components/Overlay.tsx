import type { HTMLAttributes, ReactNode } from "react";
import { colors, radius, shadows, zIndex } from "../tokens";

export type TooltipProps = HTMLAttributes<HTMLSpanElement> & {
  content: ReactNode;
  children: ReactNode;
};

/** Lightweight CSS tooltip (title-like); prefer native title for critical a11y until portal version. */
export function Tooltip({ content, children, className = "", ...props }: TooltipProps) {
  return (
    <span className={`group relative inline-flex${className ? ` ${className}` : ""}`.trim()} {...props}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap ${radius.sm} bg-slate-900 px-2 py-1 text-[11px] text-white ${shadows.md} group-hover:block group-focus-within:block`}
      >
        {content}
      </span>
    </span>
  );
}

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Accessible label when title omitted. */
  "aria-label"?: string;
  /** Override root stacking (e.g. designer portals). */
  rootClassName?: string;
  /** Extra classes on the dialog panel. */
  panelClassName?: string;
  /** Max width utility; default max-w-lg. */
  size?: "sm" | "md" | "lg";
};

const dialogSizeClass = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

/** Minimal modal dialog — layout chrome only. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  "aria-label": ariaLabel,
  rootClassName = "",
  panelClassName = "",
  size = "md",
}: DialogProps) {
  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 ${zIndex.modal} flex items-center justify-center p-4${rootClassName ? ` ${rootClassName}` : ""}`.trim()}
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Zamknij"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={title ? "sasist-dialog-title" : undefined}
        className={`relative z-10 w-full ${dialogSizeClass[size]} ${radius.lg} border ${colors.border.default} ${colors.surface.page} ${shadows.md}${panelClassName ? ` ${panelClassName}` : ""}`.trim()}
      >
        {title ? (
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 id="sasist-dialog-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
          </div>
        ) : null}
        <div className="px-4 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  side?: "right" | "left";
};

export function Drawer({ open, onClose, title, children, side = "right" }: DrawerProps) {
  if (!open) return null;
  const sideClass = side === "right" ? "right-0" : "left-0";
  return (
    <div className={`fixed inset-0 ${zIndex.modal}`} role="presentation">
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Zamknij" onClick={onClose} />
      <aside
        className={`absolute top-0 ${sideClass} flex h-full w-full max-w-md flex-col ${colors.surface.page} ${shadows.rail}`}
        role="dialog"
        aria-modal="true"
      >
        {title ? (
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
              Zamknij
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </aside>
    </div>
  );
}
