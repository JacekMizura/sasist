import { useMemo } from "react";

import type { OrderAutomationChangeLogEntry } from "../../../types/orderAutomation";
import { computeChangeLogDisplayDiff } from "../../../utils/orderAutomationChangeLogDiff";

const ADDED_LINE_CLASS =
  "inline-flex max-w-full items-start gap-1 rounded border border-green-200 bg-green-50 px-2 py-0.5 text-sm text-green-700";
const REMOVED_LINE_CLASS =
  "inline-flex max-w-full items-start gap-1 rounded border border-red-200 bg-red-50 px-2 py-0.5 text-sm text-red-700";

function DiffAddedLine({ value }: { value: string }) {
  return (
    <div className={ADDED_LINE_CLASS}>
      <span className="shrink-0 font-medium" aria-hidden>
        +
      </span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function DiffRemovedLine({ value }: { value: string }) {
  return (
    <div className={REMOVED_LINE_CLASS}>
      <span className="shrink-0 font-medium" aria-hidden>
        −
      </span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function DiffUnchangedLine({ value }: { value: string }) {
  return <p className="text-sm text-slate-900">{value}</p>;
}

type Props = {
  entry: OrderAutomationChangeLogEntry;
};

export function AutomationChangeLogDiffView({ entry }: Props) {
  const diff = useMemo(() => computeChangeLogDisplayDiff(entry), [entry]);

  const hasDiff = diff.added.length > 0 || diff.removed.length > 0 || diff.unchanged.length > 0;

  if (!hasDiff) {
    return null;
  }

  if (diff.mode === "single") {
    return (
      <div className="mt-2 flex flex-col gap-1">
        {diff.removed.map((v) => (
          <DiffRemovedLine key={`r-${v}`} value={v} />
        ))}
        {diff.added.map((v) => (
          <DiffAddedLine key={`a-${v}`} value={v} />
        ))}
      </div>
    );
  }

  const hasUnchanged = diff.unchanged.length > 0;

  if (!hasUnchanged) {
    return (
      <div className="mt-2 flex flex-col gap-1">
        {diff.removed.map((v) => (
          <DiffRemovedLine key={`r-${v}`} value={v} />
        ))}
        {diff.added.map((v) => (
          <DiffAddedLine key={`a-${v}`} value={v} />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {diff.added.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Dodano:</p>
          <div className="flex flex-col gap-1">
            {diff.added.map((v) => (
              <DiffAddedLine key={`a-${v}`} value={v} />
            ))}
          </div>
        </div>
      ) : null}
      {diff.removed.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Usunięto:</p>
          <div className="flex flex-col gap-1">
            {diff.removed.map((v) => (
              <DiffRemovedLine key={`r-${v}`} value={v} />
            ))}
          </div>
        </div>
      ) : null}
      {diff.unchanged.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Bez zmian:</p>
          <div className="flex flex-col gap-0.5">
            {diff.unchanged.map((v) => (
              <DiffUnchangedLine key={`u-${v}`} value={v} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
