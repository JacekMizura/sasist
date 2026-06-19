import type { ReactNode } from "react";

import { flatSectionDividerClass } from "./flatSectionTokens";

export type FlatPageSectionProps = {
  id?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

/** Płaska sekcja: nagłówek, opcjonalny opis, cienka linia, treść — bez karty. */
export function FlatPageSection({ id, title, description, action, children }: FlatPageSectionProps) {
  return (
    <section id={id} className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className={flatSectionDividerClass} aria-hidden />
      {children}
    </section>
  );
}

type FlatColumnHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

/** Nagłówek kolumny w konfiguratorze (lewa / prawa kolumna, grupa statusów). */
export function FlatColumnHeader({ title, description, action }: FlatColumnHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className={flatSectionDividerClass} aria-hidden />
    </div>
  );
}
