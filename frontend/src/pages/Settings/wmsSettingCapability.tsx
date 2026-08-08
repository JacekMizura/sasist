import type { ReactNode } from "react";

/** Capability / rollout badge for any WMS settings module. */
export type WmsSettingCapability = "none" | "partial" | "ok";

const BADGE_CLASS =
  "mt-0.5 inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-semibold uppercase tracking-wide";

/**
 * Shared visual for setting rollout state.
 * `none` — saved but does not affect runtime yet.
 * `partial` — partially wired.
 * `ok` — fully active (optional explicit badge).
 */
export function WmsSettingCapabilityBadge({
  kind,
  note,
  inactiveHint = "na razie nie zmienia działania",
}: {
  kind: WmsSettingCapability;
  note?: string;
  /** Shown after „Brak funkcjonalności —”. */
  inactiveHint?: string;
}) {
  if (kind === "ok") {
    return (
      <span className={`${BADGE_CLASS} text-emerald-800`} title={note || "Funkcja działa."}>
        <span className="rounded bg-emerald-100 px-1.5 py-0.5">Działa</span>
        {note ? (
          <span className="font-normal normal-case tracking-normal text-emerald-900/80">— {note}</span>
        ) : null}
      </span>
    );
  }
  if (kind === "none") {
    return (
      <span
        className={`${BADGE_CLASS} text-amber-800`}
        title="Ustawienie jest zapisane, ale na razie nie wpływa na działanie."
      >
        <span className="rounded bg-amber-100 px-1.5 py-0.5">Brak funkcjonalności</span>
        <span className="font-normal normal-case tracking-normal text-amber-900/80">— {inactiveHint}</span>
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

export function WmsSettingCapabilityFooter({
  capability,
  capabilityNote,
  inactiveHint,
}: {
  capability?: WmsSettingCapability;
  capabilityNote?: string;
  inactiveHint?: string;
}): ReactNode {
  if (!capability) return null;
  return (
    <span className="mt-1 block">
      <WmsSettingCapabilityBadge kind={capability} note={capabilityNote} inactiveHint={inactiveHint} />
    </span>
  );
}
