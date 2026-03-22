/**
 * Standard page layout: full-width container, header (title + optional actions), optional tabs, content.
 * Optimized for WMS/ERP data screens where tables and grids use full horizontal space.
 */

type PageLayoutProps = {
  /** Page title (rendered in PageHeader, left-aligned). */
  title: React.ReactNode;
  /** Optional actions (e.g. nav tabs, buttons) on the right of the header. */
  actions?: React.ReactNode;
  /** Optional tabs row below the header (e.g. module sub-navigation). */
  tabs?: React.ReactNode;
  /** Main content. */
  children: React.ReactNode;
  /** Optional: fill main column height (flex chain + overflow-hidden; no page scroll in designer). */
  fillHeight?: boolean;
};

export function PageHeader({
  title,
  actions,
  compact,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  /** Tighter spacing for fill-height pages (flex height chain). */
  compact?: boolean;
}) {
  return (
    <header
      className={`flex min-w-0 shrink-0 items-center justify-between gap-3 ${compact ? "mb-0 pb-3" : ""}`}
      style={compact ? undefined : { marginBottom: "12px" }}
    >
      <h1
        className="min-w-0 shrink-0 truncate text-2xl font-semibold text-left text-slate-800"
        style={{ fontSize: "24px", fontWeight: 600, textAlign: "left" }}
      >
        {title}
      </h1>
      {actions != null ? (
        <div
          className={`flex min-w-0 items-center gap-2 ${compact ? "flex-1 justify-end overflow-x-auto" : "shrink-0"}`}
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function PageContent({ children, fillHeight }: { children: React.ReactNode; fillHeight?: boolean }) {
  return (
    <div
      className={
        fillHeight
          ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden gap-0"
          : "flex min-w-0 flex-col gap-6"
      }
      style={fillHeight ? undefined : { gap: "24px" }}
    >
      {children}
    </div>
  );
}

export default function PageLayout({ title, actions, tabs, children, fillHeight = false }: PageLayoutProps) {
  return (
    <div
      className={`w-full ${fillHeight ? "flex h-full max-h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : ""}`}
      style={{
        width: "100%",
        paddingLeft: "24px",
        paddingRight: "24px",
      }}
    >
      <PageHeader title={title} actions={actions} compact={fillHeight} />
      {tabs != null ? <div className="mb-4 shrink-0">{tabs}</div> : null}
      <PageContent fillHeight={fillHeight}>{children}</PageContent>
    </div>
  );
}
