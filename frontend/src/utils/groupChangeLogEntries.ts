import type { OrderAutomationChangeLogEntry, OrderAutomationChangeType } from "../types/orderAutomation";

export type ChangeLogEventKind = "created" | "edited" | "deleted";

export type GroupedChangeLogEvent = {
  id: string;
  createdAt: string;
  userId: number;
  userName: string;
  kind: ChangeLogEventKind;
  /** Best-effort rule name from „Nazwa” field in the group. */
  ruleName: string | null;
  metaEntries: OrderAutomationChangeLogEntry[];
  conditionEntries: OrderAutomationChangeLogEntry[];
  effectEntries: OrderAutomationChangeLogEntry[];
  /** All entries in group (stable for debugging). */
  entries: OrderAutomationChangeLogEntry[];
};

const META_FIELD_LABELS = new Set(["Nazwa", "Grupa", "Aktywna", "Reguła", "Opóźnienie", "Uruchamianie"]);

function isConditionType(t: OrderAutomationChangeType): boolean {
  return t.startsWith("condition_");
}

function isEffectType(t: OrderAutomationChangeType): boolean {
  return t.startsWith("effect_");
}

function toSecondKey(iso: string): string {
  // 2026-07-29T20:23:45.123Z → 2026-07-29T20:23:45
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso.slice(0, 19);
  return new Date(t).toISOString().slice(0, 19);
}

function classifyKind(entries: OrderAutomationChangeLogEntry[]): ChangeLogEventKind {
  if (entries.some((e) => e.type === "rule_created")) return "created";
  const onlyRemovals =
    entries.length > 0 &&
    entries.every(
      (e) =>
        e.type === "condition_removed" ||
        e.type === "effect_removed" ||
        (e.after == null && e.before != null && e.type === "field_updated" && e.field === "Reguła"),
    );
  if (onlyRemovals) return "deleted";
  return "edited";
}

function resolveRuleName(entries: OrderAutomationChangeLogEntry[]): string | null {
  const nameEntry = entries.find((e) => e.field === "Nazwa");
  if (!nameEntry) return null;
  const after = nameEntry.after?.trim();
  if (after) return after;
  const before = nameEntry.before?.trim();
  return before || null;
}

function bucketEntry(entry: OrderAutomationChangeLogEntry): "meta" | "condition" | "effect" {
  if (isConditionType(entry.type)) return "condition";
  if (isEffectType(entry.type)) return "effect";
  if (META_FIELD_LABELS.has(entry.field) || entry.type === "field_updated" || entry.type === "rule_created") {
    return "meta";
  }
  // Fallback: treat unknown field labels from condition catalog as conditions if multi-ish — keep meta
  return "meta";
}

/**
 * Groups flat change-log entries into one UI event per save.
 * Key: ruleId + userId + createdAt second (ISO truncated).
 * Does not mutate stored logs.
 */
export function groupChangeLogEntries(entries: OrderAutomationChangeLogEntry[]): GroupedChangeLogEvent[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => {
    const c = b.createdAt.localeCompare(a.createdAt);
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });

  type Bucket = { key: string; items: OrderAutomationChangeLogEntry[] };
  const buckets: Bucket[] = [];
  const indexByKey = new Map<string, number>();

  for (const e of sorted) {
    const sec = toSecondKey(e.createdAt);
    const key = `${e.ruleId}|${e.userId}|${sec}`;

    // Also merge into an existing bucket within ≤2s window (same rule+user)
    let idx = indexByKey.get(key);
    if (idx == null) {
      const t = Date.parse(e.createdAt);
      if (!Number.isNaN(t)) {
        for (let i = 0; i < buckets.length; i++) {
          const sample = buckets[i]!.items[0]!;
          if (sample.ruleId !== e.ruleId || sample.userId !== e.userId) continue;
          const st = Date.parse(sample.createdAt);
          if (!Number.isNaN(st) && Math.abs(st - t) <= 2000) {
            idx = i;
            indexByKey.set(key, i);
            break;
          }
        }
      }
    }

    if (idx == null) {
      idx = buckets.length;
      buckets.push({ key, items: [] });
      indexByKey.set(key, idx);
    }
    buckets[idx]!.items.push(e);
  }

  return buckets.map((b) => {
    const items = b.items;
    const metaEntries: OrderAutomationChangeLogEntry[] = [];
    const conditionEntries: OrderAutomationChangeLogEntry[] = [];
    const effectEntries: OrderAutomationChangeLogEntry[] = [];

    for (const e of items) {
      const bucket = bucketEntry(e);
      if (bucket === "condition") conditionEntries.push(e);
      else if (bucket === "effect") effectEntries.push(e);
      else metaEntries.push(e);
    }

    // Prefer earliest createdAt in group for display (stable)
    const createdAt = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]!.createdAt;
    const first = items[0]!;

    return {
      id: `evt-${first.ruleId}-${first.userId}-${toSecondKey(createdAt)}-${items.map((x) => x.id).join("-").slice(0, 48)}`,
      createdAt,
      userId: first.userId,
      userName: first.userName,
      kind: classifyKind(items),
      ruleName: resolveRuleName(items),
      metaEntries,
      conditionEntries,
      effectEntries,
      entries: items,
    };
  });
}
