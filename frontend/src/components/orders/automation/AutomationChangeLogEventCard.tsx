import { useMemo } from "react";

import type { OrderAutomationChangeLogEntry } from "../../../types/orderAutomation";
import {
  computeChangeLogDisplayDiff,
  isMultiValueChangeField,
  parseChangeLogValues,
} from "../../../utils/orderAutomationChangeLogDiff";
import type { GroupedChangeLogEvent } from "../../../utils/groupChangeLogEntries";
import { AutomationValueBadges } from "./AutomationValueBadges";
import type { AutomationBadgeTone } from "./AutomationValueBadges";
import {
  AutomationConditionFieldSummary,
} from "./AutomationConditionSummary";
import { AutomationEffectFieldSummary } from "./AutomationEffectSummary";

function kindTitle(kind: GroupedChangeLogEvent["kind"], ruleName: string | null, fallbackName?: string | null): string {
  const name = ruleName ?? fallbackName;
  const quoted = name ? ` „${name}”` : "";
  if (kind === "created") return `Utworzenie automatyzacji${quoted}`;
  if (kind === "deleted") return `Usunięcie automatyzacji${quoted}`;
  return `Edycja automatyzacji${quoted}`;
}

function MetaFieldDiff({ entry }: { entry: OrderAutomationChangeLogEntry }) {
  // Skip redundant „Reguła” creation line when Nazwa also present — still show if alone
  const diff = computeChangeLogDisplayDiff(entry);
  const before = entry.before?.trim() || null;
  const after = entry.after?.trim() || null;

  if (diff.mode === "single") {
    if (before && after && before !== after) {
      return (
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-slate-900">{entry.field}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-800 line-through">
              {before}
            </span>
            <span className="text-slate-400" aria-hidden>
              →
            </span>
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
              {after}
            </span>
          </div>
        </div>
      );
    }
    if (after && !before) {
      return (
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-slate-900">{entry.field}</p>
          <p className="text-sm text-emerald-800">
            <span className="mr-1 font-medium">+</span>
            {after}
          </p>
        </div>
      );
    }
    if (before && !after) {
      return (
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-slate-900">{entry.field}</p>
          <p className="text-sm text-rose-800 line-through">
            <span className="mr-1 font-medium">−</span>
            {before}
          </p>
        </div>
      );
    }
  }

  // Multi / fallback — badge tones
  const labels: string[] = [];
  const tones: AutomationBadgeTone[] = [];
  for (const v of diff.removed) {
    labels.push(v);
    tones.push("removed");
  }
  for (const v of diff.added) {
    labels.push(v);
    tones.push("added");
  }
  if (labels.length === 0 && (before || after)) {
    return (
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-slate-900">{entry.field}</p>
        <p className="text-sm text-slate-700">{after ?? before}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-sm font-semibold text-slate-900">{entry.field}</p>
      {labels.length > 0 ? <AutomationValueBadges labels={labels} tones={tones} /> : null}
    </div>
  );
}

function ConditionEntryView({ entry }: { entry: OrderAutomationChangeLogEntry }) {
  const multi = isMultiValueChangeField(entry.field);
  const diff = computeChangeLogDisplayDiff(entry);
  const labels: string[] = [];
  const tones: AutomationBadgeTone[] = [];

  const hasDiffParts = diff.added.length > 0 || diff.removed.length > 0;

  if (hasDiffParts) {
    // Compact: only added + removed when a real multi-diff exists
    for (const v of diff.removed) {
      labels.push(v);
      tones.push("removed");
    }
    for (const v of diff.added) {
      labels.push(v);
      tones.push("added");
    }
  } else {
    // New / full set without before — show after as neutral (or added if condition_added)
    const after = parseChangeLogValues(entry.after);
    const before = parseChangeLogValues(entry.before);
    const source = after.length > 0 ? after : before;
    const tone: AutomationBadgeTone =
      entry.type === "condition_added" ? "added" : entry.type === "condition_removed" ? "removed" : "default";
    for (const v of source) {
      labels.push(v);
      tones.push(tone);
    }
  }

  if (labels.length === 0) {
    return (
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{entry.field}</p>
        {entry.type === "condition_removed" ? (
          <p className="mt-1 text-sm text-rose-700">Usunięto warunek</p>
        ) : entry.type === "condition_added" ? (
          <p className="mt-1 text-sm text-emerald-700">Dodano warunek</p>
        ) : null}
      </div>
    );
  }

  const showOp = multi || labels.length > 1;

  return (
    <AutomationConditionFieldSummary
      fieldLabel={entry.field}
      operatorHint={showOp ? "jest jednym z" : null}
      labels={labels}
      tones={tones}
      fitToWidth={false}
    />
  );
}

function EffectEntryView({ entry }: { entry: OrderAutomationChangeLogEntry }) {
  const diff = computeChangeLogDisplayDiff(entry);
  const labels: string[] = [];
  const tones: AutomationBadgeTone[] = [];

  const filterKind = (v: string) => v !== entry.field;
  const hasDiffParts = diff.added.some(filterKind) || diff.removed.some(filterKind);

  if (hasDiffParts) {
    for (const v of diff.removed.filter(filterKind)) {
      labels.push(v);
      tones.push("removed");
    }
    for (const v of diff.added.filter(filterKind)) {
      labels.push(v);
      tones.push("added");
    }
  } else {
    const afterParts = parseChangeLogValues(entry.after).filter(filterKind);
    const beforeParts = parseChangeLogValues(entry.before).filter(filterKind);
    const source = afterParts.length > 0 ? afterParts : beforeParts;
    const tone: AutomationBadgeTone =
      entry.type === "effect_added" ? "added" : entry.type === "effect_removed" ? "removed" : "default";
    for (const v of source) {
      labels.push(v);
      tones.push(tone);
    }
  }

  if (labels.length === 0) {
    return (
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{entry.field}</p>
        {entry.type === "effect_removed" ? (
          <p className="mt-1 text-sm text-rose-700">Usunięto efekt</p>
        ) : entry.type === "effect_added" ? (
          <p className="mt-1 text-sm text-emerald-700">Dodano efekt</p>
        ) : null}
      </div>
    );
  }

  return <AutomationEffectFieldSummary fieldLabel={entry.field} labels={labels} tones={tones} />;
}

type Props = {
  event: GroupedChangeLogEvent;
  /** Current rule name when log group has no „Nazwa” entry. */
  fallbackRuleName?: string | null;
};

export function AutomationChangeLogEventCard({ event, fallbackRuleName }: Props) {
  const title = useMemo(
    () => kindTitle(event.kind, event.ruleName, fallbackRuleName),
    [event.kind, event.ruleName, fallbackRuleName],
  );

  // Deduplicate meta „Reguła” when „Nazwa” exists
  const meta = event.metaEntries.filter((e) => {
    if (e.field === "Reguła" && event.metaEntries.some((x) => x.field === "Nazwa")) return false;
    return true;
  });

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="space-y-0.5">
        <p className="text-sm font-medium tabular-nums text-slate-900">{fmtDateTime(event.createdAt)}</p>
        <p className="text-sm text-slate-700">{event.userName}</p>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
      </header>

      <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Zmiany</p>

        {meta.length > 0 ? (
          <div className="space-y-2.5">
            {meta.map((e) => (
              <MetaFieldDiff key={e.id} entry={e} />
            ))}
          </div>
        ) : null}

        {event.conditionEntries.length > 0 ? (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warunki</p>
            {event.conditionEntries.map((e) => (
              <ConditionEntryView key={e.id} entry={e} />
            ))}
          </div>
        ) : null}

        {event.effectEntries.length > 0 ? (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Efekty</p>
            {event.effectEntries.map((e) => (
              <EffectEntryView key={e.id} entry={e} />
            ))}
          </div>
        ) : null}

        {meta.length === 0 && event.conditionEntries.length === 0 && event.effectEntries.length === 0 ? (
          <p className="text-sm text-slate-500">Brak szczegółów zmian.</p>
        ) : null}
      </div>
    </article>
  );
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${mo}-${day} ${h}:${mi}`;
  } catch {
    return iso;
  }
}
