import type { ReactNode } from "react";

import {
  operationalActionColumnGridClass,
  operationalActionColumnInnerClass,
  operationalActionColumnStackClass,
} from "./operationalActionButtonTokens";
import { OperationalActionSlot } from "./OperationalActionSlot";

/** @deprecated Prefer a plain array of actions; length does not need to be 6. */
export type OperationalActionSixSlots = readonly [
  ReactNode | null | undefined,
  ReactNode | null | undefined,
  ReactNode | null | undefined,
  ReactNode | null | undefined,
  ReactNode | null | undefined,
  ReactNode | null | undefined,
];

function normalizeSlots(slots: readonly (ReactNode | null | undefined)[]): ReactNode[] {
  return slots.filter((s): s is ReactNode => s != null && s !== false);
}

/**
 * Shared operational actions column (Orders baseline density).
 *
 * - **≤3 actions** → single vertical stack (`gap-1`), no empty holes.
 * - **>3 actions** → two columns, row-major; incomplete last row padded with invisible placeholders.
 */
export function OperationalActionColumn({
  slots,
  "aria-label": ariaLabel = "Akcje",
}: {
  slots: readonly (ReactNode | null | undefined)[] | OperationalActionSixSlots;
  "aria-label"?: string;
}) {
  const items = normalizeSlots(slots);
  if (items.length === 0) return null;

  if (items.length <= 3) {
    return (
      <div className={operationalActionColumnInnerClass} role="group" aria-label={ariaLabel}>
        <div className={operationalActionColumnStackClass}>
          {items.map((node, i) => (
            <div key={i} className="flex shrink-0 justify-center">
              {node}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalSlots = Math.ceil(items.length / 2) * 2;
  const cells: ReactNode[] = items.slice();
  while (cells.length < totalSlots) {
    cells.push(<OperationalActionSlot key={`pad-${cells.length}`} />);
  }

  return (
    <div className={operationalActionColumnInnerClass} role="group" aria-label={ariaLabel}>
      <div className={operationalActionColumnGridClass}>
        {cells.map((node, i) => (
          <div key={i} className="flex shrink-0 justify-center">
            {node}
          </div>
        ))}
      </div>
    </div>
  );
}
