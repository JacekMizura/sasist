import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/** Sekcja formularza w karcie — wzorzec zakładki Magazyn w edycji produktu. */
export function WmFormSectionCard({ title, description, children, className = "" }: Props) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`.trim()}>
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
