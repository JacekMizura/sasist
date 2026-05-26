/**
 * Module list page title — plain heading only.
 * Sub-routes and “create” belong in the sidebar / list toolbars, not in a fake title dropdown.
 */
export type PageModuleHeaderProps = {
  title: string;
  subtitle?: string;
};

export function PageModuleHeader({ title, subtitle }: PageModuleHeaderProps) {
  return (
    <div className="min-w-0">
      <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm leading-snug text-slate-600">{subtitle}</p> : null}
    </div>
  );
}
