import type { ReactNode } from "react";

type Props = {
  id?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
};

/** Płaska sekcja bez dodatkowej ramki — tylko tytuł i treść. */
export function ConfiguratorSectionShell({ id, title, action, children }: Props) {
  return (
    <section id={id} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Etykieta widoczności w magazynie — jeden wariant w całym module. */
export const WMS_VISIBILITY_LABEL = "Widoczne w magazynie";
