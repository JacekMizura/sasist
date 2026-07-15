import type { ReactNode } from "react";

import { PrintQueuePrimaryButton, PrintQueueSecondaryButton } from "./printQueueUi";

export type MappingSummaryState =
  | { kind: "ok" }
  | { kind: "missing"; fields: string[] }
  | { kind: "na" };

type SummaryTile = {
  label: string;
  value: ReactNode;
};

type Props = {
  tiles: SummaryTile[];
  mapping: MappingSummaryState;
  generateLabel: string;
  generateDisabled: boolean;
  onGenerate: () => void;
  printLabel?: string;
  printDisabled?: boolean;
  onPrint?: () => void;
  printersSlot?: ReactNode;
  footerNote?: ReactNode;
};

function SummaryCard({ label, value }: SummaryTile) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

/** Sticky right-rail summary + CTAs for the print-queue wizard. */
export default function PrintQueueSummaryPanel({
  tiles,
  mapping,
  generateLabel,
  generateDisabled,
  onGenerate,
  printLabel = "Drukuj etykiety",
  printDisabled,
  onPrint,
  printersSlot,
  footerNote,
}: Props) {
  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-[15px] font-semibold text-slate-900">Podsumowanie</h3>
        <div className="mt-4 grid gap-3">
          {tiles.map((t) => (
            <SummaryCard key={t.label} {...t} />
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Mapa pól</p>
          {mapping.kind === "ok" ? (
            <p className="text-sm font-medium text-emerald-700">✔ Wszystkie wymagane pola zostały zmapowane</p>
          ) : mapping.kind === "missing" ? (
            <div className="space-y-1.5 text-sm text-amber-900">
              <p className="font-semibold">⚠ Brakuje pól:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {mapping.fields.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Mapowanie nie dotyczy tego trybu.</p>
          )}
        </div>

        <div className="mt-4 space-y-2.5">
          <PrintQueuePrimaryButton onClick={onGenerate} disabled={generateDisabled}>
            {generateLabel}
          </PrintQueuePrimaryButton>
          {onPrint ? (
            <PrintQueueSecondaryButton onClick={onPrint} disabled={printDisabled}>
              {printLabel}
            </PrintQueueSecondaryButton>
          ) : null}
        </div>
        {footerNote ? <div className="mt-3 text-xs text-slate-500">{footerNote}</div> : null}
      </section>

      {printersSlot ? (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">{printersSlot}</section>
      ) : null}
    </div>
  );
}
