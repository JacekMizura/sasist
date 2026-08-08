import type { ReactNode } from "react";

import {
  WmsSettingCapabilityBadge,
  type WmsSettingCapability,
} from "./wmsSettingCapability";

/** @deprecated Prefer {@link WmsSettingCapability}. */
export type PackingSettingCapability = Extract<WmsSettingCapability, "none" | "partial">;

/**
 * Packing-specific copy for capability badges (same visual system as all WMS settings).
 */
export function PackingCapabilityBadge({
  kind,
  note,
}: {
  kind: PackingSettingCapability;
  note?: string;
}) {
  return (
    <WmsSettingCapabilityBadge
      kind={kind}
      note={note}
      inactiveHint="na razie nie zmienia działania pakowania"
    />
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
