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
  /** Optional: container and content grow to fill viewport (min-h-screen, flex-1). */
  fillHeight?: boolean;
};

export function PageHeader({ title, actions }: { title: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between shrink-0" style={{ marginBottom: "12px" }}>
      <h1
        className="text-2xl font-semibold text-left text-slate-800"
        style={{ fontSize: "24px", fontWeight: 600, textAlign: "left" }}
      >
        {title}
      </h1>
      {actions != null ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </header>
  );
}

export function PageContent({ children, fillHeight }: { children: React.ReactNode; fillHeight?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-6 ${fillHeight ? "flex-1 min-h-0" : ""}`}
      style={{ gap: "24px" }}
    >
      {children}
    </div>
  );
}

export default function PageLayout({ title, actions, tabs, children, fillHeight = false }: PageLayoutProps) {
  return (
    <div
      className={`w-full ${fillHeight ? "min-h-screen flex flex-col" : ""}`}
      style={{
        width: "100%",
        paddingLeft: "24px",
        paddingRight: "24px",
      }}
    >
      <PageHeader title={title} actions={actions} />
      {tabs != null ? <div className="shrink-0 mb-4">{tabs}</div> : null}
      <PageContent fillHeight={fillHeight}>{children}</PageContent>
    </div>
  );
}
