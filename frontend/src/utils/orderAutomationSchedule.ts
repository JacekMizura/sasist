import type { OrderAutomationDayScheduleRow, OrderAutomationScheduleSpec } from "../types/orderAutomation";

const PREFIX_V1 = "oa_sch_v1:";
const PREFIX_V2 = "oa_sch_v2:";

export function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw";
  } catch {
    return "Europe/Warsaw";
  }
}

export function defaultScheduleSpec(): OrderAutomationScheduleSpec {
  const rows: OrderAutomationDayScheduleRow[] = [];
  for (let day = 1; day <= 7; day++) {
    rows.push({
      day,
      enabled: day <= 5,
      hour: 8,
      minute: 0,
      repeatEveryMin: null,
    });
  }
  return { timezone: defaultTimezone(), rows };
}

type PersistV1 = { v: 1; wd: number[]; h: number; m: number; tz: string; r?: number | null };
type PersistV2 = {
  v: 2;
  tz: string;
  d: { day: number; e: 0 | 1; h: number; m: number; r: number | null }[];
};

function migrateV1(p: PersistV1): OrderAutomationScheduleSpec {
  const wd = new Set((p.wd ?? []).filter((n) => n >= 1 && n <= 7));
  const h = typeof p.h === "number" ? Math.min(23, Math.max(0, p.h)) : 8;
  const m = typeof p.m === "number" ? Math.min(59, Math.max(0, p.m)) : 0;
  const r = p.r ?? null;
  const rows: OrderAutomationDayScheduleRow[] = [];
  for (let day = 1; day <= 7; day++) {
    const enabled = wd.has(day);
    rows.push({
      day,
      enabled,
      hour: h,
      minute: m,
      repeatEveryMin: enabled && r != null ? Math.max(1, r) : null,
    });
  }
  return { timezone: typeof p.tz === "string" ? p.tz : defaultTimezone(), rows };
}

export function normalizeScheduleRows(rows: OrderAutomationDayScheduleRow[]): OrderAutomationDayScheduleRow[] {
  const byDay = new Map<number, OrderAutomationDayScheduleRow>();
  for (const r of rows ?? []) {
    if (r.day >= 1 && r.day <= 7) byDay.set(r.day, r);
  }
  const out: OrderAutomationDayScheduleRow[] = [];
  for (let day = 1; day <= 7; day++) {
    const x = byDay.get(day);
    if (x) {
      out.push({
        day,
        enabled: Boolean(x.enabled),
        hour: Math.min(23, Math.max(0, Number(x.hour) || 0)),
        minute: Math.min(59, Math.max(0, Number(x.minute) || 0)),
        repeatEveryMin:
          x.repeatEveryMin != null && Number(x.repeatEveryMin) > 0 ? Math.max(1, Math.floor(Number(x.repeatEveryMin))) : null,
      });
    } else {
      out.push({ day, enabled: false, hour: 8, minute: 0, repeatEveryMin: null });
    }
  }
  return out;
}

export function encodeScheduleCron(spec: OrderAutomationScheduleSpec): string {
  const rows = normalizeScheduleRows(spec.rows);
  const p: PersistV2 = {
    v: 2,
    tz: spec.timezone || defaultTimezone(),
    d: rows.map((r) => ({
      day: r.day,
      e: r.enabled ? 1 : 0,
      h: r.hour,
      m: r.minute,
      r: r.repeatEveryMin ?? null,
    })),
  };
  return `${PREFIX_V2}${JSON.stringify(p)}`;
}

export function decodeScheduleCron(raw: string | undefined | null): OrderAutomationScheduleSpec | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  if (s.startsWith(PREFIX_V2)) {
    try {
      const p = JSON.parse(s.slice(PREFIX_V2.length)) as PersistV2;
      if (p.v !== 2 || !Array.isArray(p.d)) return null;
      const rows: OrderAutomationDayScheduleRow[] = p.d.map((x) => ({
        day: x.day,
        enabled: x.e === 1,
        hour: x.h,
        minute: x.m,
        repeatEveryMin: x.r,
      }));
      return { timezone: typeof p.tz === "string" ? p.tz : defaultTimezone(), rows: normalizeScheduleRows(rows) };
    } catch {
      return null;
    }
  }
  if (s.startsWith(PREFIX_V1)) {
    try {
      const p = JSON.parse(s.slice(PREFIX_V1.length)) as PersistV1;
      if (p.v !== 1 || !Array.isArray(p.wd)) return null;
      return migrateV1(p);
    } catch {
      return null;
    }
  }
  return null;
}

export function scheduleHumanSummaryPl(spec: OrderAutomationScheduleSpec): string {
  const rows = normalizeScheduleRows(spec.rows);
  const on = rows.filter((r) => r.enabled);
  if (on.length === 0) return "Brak aktywnych dni";
  const times = new Set(on.map((r) => `${String(r.hour).padStart(2, "0")}:${String(r.minute).padStart(2, "0")}`));
  if (on.length === 7 && times.size === 1) return `Codziennie o ${[...times][0]}`;
  if (on.length === 5 && on.every((r) => r.day <= 5) && times.size === 1)
    return `Dni robocze o ${[...times][0]}`;
  if (times.size === 1) return `${on.length} dni o ${[...times][0]}`;
  return `${on.length} dni (${[...times].length} różnych godzin)`;
}

/** Liczba dni z włączonym harmonogramem. */
export function scheduleEnabledDayCount(spec: OrderAutomationScheduleSpec): number {
  return normalizeScheduleRows(spec.rows).filter((r) => r.enabled).length;
}
