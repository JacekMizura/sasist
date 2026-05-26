import type { ReactNode } from "react";

export type PrintQueueMode =
  | "location"
  | "cart_basket"
  | "rack"
  | "rack_strip"
  | "pdf_import"
  | "csv_import";

const PRINT_TYPE_CARDS: Array<{
  id: PrintQueueMode;
  title: string;
  description: string;
  emoji: string;
}> = [
  {
    id: "location",
    title: "Lokalizacje",
    description: "Etykiety lokalizacji z układu regałów.",
    emoji: "📍",
  },
  {
    id: "cart_basket",
    title: "Wózki i koszyki",
    description: "Etykiety koszyków na wskazanym wózku.",
    emoji: "🛒",
  },
  {
    id: "rack",
    title: "Regały (generator)",
    description: "Siatka lokalizacji dla jednego regału.",
    emoji: "🧱",
  },
  {
    id: "rack_strip",
    title: "Pasek regałowy",
    description: "Lista segmentów pod szablon z powtarzaczem.",
    emoji: "📏",
  },
  {
    id: "pdf_import",
    title: "Import PDF",
    description: "Odczyt kodów z PDF i wygenerowanie etykiet.",
    emoji: "📄",
  },
  {
    id: "csv_import",
    title: "Import CSV",
    description: "Masowy import i mapowanie kolumn.",
    emoji: "📊",
  },
];

export function PrintQueueWorkflowStep({
  step,
  title,
  subtitle,
}: {
  step: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-cyan-600 px-1.5 text-[11px] font-bold text-white">
          {step}
        </span>
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
      </div>
      {subtitle ? <p className="mt-1 text-[12px] leading-snug text-slate-600">{subtitle}</p> : null}
    </header>
  );
}

export function PrintModeCards({ value, onChange }: { value: PrintQueueMode; onChange: (m: PrintQueueMode) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {PRINT_TYPE_CARDS.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={[
              "flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-all",
              active
                ? "border-cyan-500 bg-white shadow-md ring-2 ring-cyan-400/50"
                : "border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-sm",
            ].join(" ")}
          >
            <span className="text-xl leading-none" aria-hidden>
              {c.emoji}
            </span>
            <span className="text-[14px] font-semibold text-slate-900">{c.title}</span>
            <span className="text-[11px] leading-snug text-slate-600">{c.description}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PrintQueueSurfaceCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200/95 bg-white p-3 shadow-sm sm:p-4 ${className}`.trim()}
    >
      <h3 className="text-[14px] font-semibold text-slate-900">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{subtitle}</p> : null}
      <div className="mt-2.5 space-y-3">{children}</div>
    </section>
  );
}

export function PrintQueuePrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      type="button"
      className={`inline-flex w-full items-center justify-center rounded-lg bg-cyan-600 px-3 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-45 ${className}`.trim()}
      {...rest}
    />
  );
}

export function PrintQueueSecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      type="button"
      className={`inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 ${className}`.trim()}
      {...rest}
    />
  );
}

export function PrintQueueGhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      type="button"
      className={`text-[13px] font-medium text-cyan-800 underline-offset-2 hover:underline disabled:opacity-40 ${className}`.trim()}
      {...rest}
    />
  );
}

/** Mapuje komunikaty techniczne z sanitacji szablonu na zrozumiały język polski. */
export function humanizeCsvSanitizeWarning(msg: string): string {
  if (msg.startsWith("Template looks like A4")) {
    return "Szablon ma bardzo duże wymiary (jak arkusz A4). Przed PDF rozmiar może zostać zmniejszony do bezpiecznej etykiety — warto poprawić i zapisać szablon w projektancie.";
  }
  if (msg.startsWith("PDF page size was changed")) {
    return "Wymiary zapisane w szablonie zostały tymczasowo dopasowane do typowej etykiety. Otwórz projektanta, ustaw prawidłowy rozmiar w milimetrach i zapisz szablon.";
  }
  return msg;
}
