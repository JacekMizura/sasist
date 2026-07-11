import type { ReactNode } from "react";

/** Fixed sidebar width for document-type navigation (MM, PZ, …). */
export const DOCUMENT_SIDEBAR_WIDTH_CLASS = "w-[200px] shrink-0";

type DocumentLayoutProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Two-column shell: sidebar + content (flex row on sm+).
 * No fixed/absolute positioning — sidebar occupies layout space.
 */
export function DocumentLayout({ children, className = "" }: DocumentLayoutProps) {
  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:flex-row ${className}`.trim()}
    >
      {children}
    </div>
  );
}

type DocumentSidebarProps = {
  children: ReactNode;
  "aria-label"?: string;
};

export function DocumentSidebar({ children, "aria-label": ariaLabel }: DocumentSidebarProps) {
  return (
    <aside
      className={`hidden min-h-0 ${DOCUMENT_SIDEBAR_WIDTH_CLASS} overflow-y-auto border-r border-slate-200/90 bg-slate-50/40 sm:flex sm:flex-col`}
      aria-label={ariaLabel}
    >
      {children}
    </aside>
  );
}

type DocumentContentProps = {
  children: ReactNode;
};

export function DocumentContent({ children }: DocumentContentProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}

type DocumentMobileNavProps = {
  children: ReactNode;
  "aria-label"?: string;
};

export function DocumentMobileNav({ children, "aria-label": ariaLabel }: DocumentMobileNavProps) {
  return (
    <nav
      className="shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 sm:hidden"
      aria-label={ariaLabel ?? "Dokumenty — skróty"}
    >
      {children}
    </nav>
  );
}

/** Alias for warehouse document module layout shell. */
export const WarehouseDocumentLayout = DocumentLayout;
