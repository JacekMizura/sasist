import type { ReactNode } from "react";

/** Status wdrożenia ustawienia pakowania (audyt 2026-08). */
export type PackingSettingCapability = "none" | "partial";

const BADGE_CLASS =
  "mt-0.5 inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-semibold uppercase tracking-wide";

/**
 * Widoczna informacja o stanie funkcji — nie błąd systemu.
 * `none` = zapisuje się, ale nie zmienia runtime pakowania.
 * `partial` = częściowo podpięte / stub.
 */
export function PackingCapabilityBadge({
  kind,
  note,
}: {
  kind: PackingSettingCapability;
  /** Krótki opis braków dla „częściowo”. */
  note?: string;
}) {
  if (kind === "none") {
    return (
      <span className={`${BADGE_CLASS} text-amber-800`} title="Ustawienie jest zapisane, ale na razie nie wpływa na pakowanie.">
        <span className="rounded bg-amber-100 px-1.5 py-0.5">Brak funkcjonalności</span>
        <span className="font-normal normal-case tracking-normal text-amber-900/80">
          — na razie nie zmienia działania pakowania
        </span>
      </span>
    );
  }
  return (
    <span className={`${BADGE_CLASS} text-sky-800`} title={note || "Funkcja działa tylko częściowo."}>
      <span className="rounded bg-sky-100 px-1.5 py-0.5">Częściowo wdrożone</span>
      {note ? (
        <span className="font-normal normal-case tracking-normal text-sky-900/80">— {note}</span>
      ) : null}
    </span>
  );
}

export function PackingFieldLabel({
  children,
  capability,
  capabilityNote,
}: {
  children: ReactNode;
  capability?: PackingSettingCapability;
  capabilityNote?: string;
}) {
  return (
    <span className="block">
      <span className="text-sm font-medium text-slate-700">{children}</span>
      {capability ? (
        <span className="mt-1 block">
          <PackingCapabilityBadge kind={capability} note={capabilityNote} />
        </span>
      ) : null}
    </span>
  );
}
