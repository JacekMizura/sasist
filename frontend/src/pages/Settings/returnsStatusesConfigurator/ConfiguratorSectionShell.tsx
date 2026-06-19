import type { ReactNode } from "react";

type Props = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

export function ConfiguratorSectionShell({ id, eyebrow, title, description, action, children }: Props) {
  return (
    <section id={id} className="rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{eyebrow}</p>
          ) : null}
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">{description}</p> : null}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
