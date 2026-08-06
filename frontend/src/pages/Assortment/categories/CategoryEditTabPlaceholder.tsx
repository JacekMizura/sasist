import type { ReactNode } from "react";
import { pimPanelClass } from "../pimUi";

type Props = {
  title: string;
  description?: string;
  children?: ReactNode;
};

/** Placeholder panel until the tab is implemented in a later stage. */
export function CategoryEditTabPlaceholder({ title, description, children }: Props) {
  return (
    <section className={pimPanelClass}>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      {children ?? (
        <p className="mt-4 text-sm text-slate-400">Ta sekcja zostanie uzupełniona w kolejnym etapie.</p>
      )}
    </section>
  );
}
