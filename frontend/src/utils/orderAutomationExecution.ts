import type {
  OrderAutomationExecution,
  OrderAutomationManualTrigger,
  OrderAutomationRunMode,
  OrderAutomationRule,
} from "../types/orderAutomation";
import { decodeScheduleCron } from "./orderAutomationSchedule";

const DAY_LABELS: Record<number, string> = {
  1: "Pn",
  2: "Wt",
  3: "Śr",
  4: "Cz",
  5: "Pt",
  6: "So",
  7: "Nd",
};

export function defaultExecution(): OrderAutomationExecution {
  return {
    automatic: true,
    runMode: "continuous",
    windowFrom: "08:00",
    windowTo: "16:00",
    activeDays: [1, 2, 3, 4, 5],
  };
}

function isNewExecution(ex: OrderAutomationExecution): boolean {
  return typeof ex.automatic === "boolean" && typeof ex.runMode === "string";
}

/** Migracja starego modelu wyzwalaczy → ustawienia wykonania. */
export function migrateExecution(
  ex: OrderAutomationExecution | null | undefined,
  manualTrigger?: OrderAutomationManualTrigger | null,
): OrderAutomationExecution {
  const def = defaultExecution();
  if (!ex || typeof ex !== "object") return def;
  if (isNewExecution(ex)) {
    return normalizeExecution(ex);
  }

  const legacy = ex as OrderAutomationExecution & {
    onOrderCreated?: boolean;
    onStatusChanged?: boolean;
    onSchedule?: boolean;
    scheduleCron?: string;
  };

  const manualOnly =
    Boolean(manualTrigger?.enabled) &&
    !legacy.onOrderCreated &&
    !legacy.onStatusChanged &&
    !legacy.onSchedule;

  let runMode: OrderAutomationRunMode = "continuous";
  let windowFrom = "08:00";
  let windowTo = "16:00";
  let activeDays = [1, 2, 3, 4, 5];

  if (legacy.onSchedule && legacy.scheduleCron) {
    const spec = decodeScheduleCron(legacy.scheduleCron);
    if (spec) {
      const enabled = spec.rows.filter((r) => r.enabled);
      activeDays = enabled.map((r) => r.day).sort((a, b) => a - b);
      if (enabled.length > 0) {
        const h = enabled[0]!.hour;
        const m = enabled[0]!.minute;
        windowFrom = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        windowTo = "16:00";
      }
      runMode = enabled.length === 7 ? "hours_only" : "days_and_hours";
    } else {
      runMode = "days_and_hours";
    }
  }

  const automatic =
    manualOnly ? false : legacy.onOrderCreated !== false || legacy.onStatusChanged !== false || legacy.onSchedule === true;

  return normalizeExecution({
    automatic: manualOnly ? false : automatic,
    runMode,
    windowFrom,
    windowTo,
    activeDays: activeDays.length ? activeDays : def.activeDays,
  });
}

export function normalizeExecution(ex: OrderAutomationExecution): OrderAutomationExecution {
  const def = defaultExecution();
  const runMode: OrderAutomationRunMode =
    ex.runMode === "hours_only" || ex.runMode === "days_and_hours" ? ex.runMode : "continuous";
  const activeDays = (ex.activeDays ?? def.activeDays)
    .filter((d) => d >= 1 && d <= 7)
    .sort((a, b) => a - b);
  const windowFrom = /^\d{2}:\d{2}$/.test(ex.windowFrom ?? "") ? ex.windowFrom! : def.windowFrom;
  const windowTo = /^\d{2}:\d{2}$/.test(ex.windowTo ?? "") ? ex.windowTo! : def.windowTo;

  return {
    automatic: ex.automatic === true,
    runMode,
    windowFrom,
    windowTo,
    activeDays: activeDays.length ? activeDays : [...def.activeDays],
  };
}

export function formatActiveDaysRange(days: number[]): string {
  const sorted = [...days].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (sorted.length === 0) return "—";
  if (sorted.length === 7) return "Pn–Nd";
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) return "Pn–Pt";
  if (sorted.length === 2 && sorted[0] === 6 && sorted[1] === 7) return "So–Nd";
  return sorted.map((d) => DAY_LABELS[d] ?? String(d)).join(", ");
}

export type ExecutionListBadge = {
  key: string;
  label: string;
  className: string;
};

export type ExecutionListDisplay = {
  badges: ExecutionListBadge[];
};

/** Widok kolumny Uruchamianie — badge automatycznie / ręcznie / harmonogram. */
export function formatExecutionListDisplay(
  rule: Pick<OrderAutomationRule, "execution" | "manualTrigger">,
): ExecutionListDisplay {
  const ex = migrateExecution(rule.execution, rule.manualTrigger);
  const badges: ExecutionListBadge[] = [];

  if (ex.automatic) {
    badges.push({
      key: "auto",
      label: "✓ Automatycznie",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    });
  }

  if (rule.manualTrigger?.enabled) {
    badges.push({
      key: "manual",
      label: "✓ Ręcznie",
      className: "border-slate-200 bg-white text-slate-700",
    });
  }

  if (ex.automatic && ex.runMode !== "continuous") {
    badges.push({
      key: "schedule",
      label: "🕒 Harmonogram",
      className: "border-blue-200 bg-blue-50 text-blue-800",
    });
  }

  if (badges.length === 0) {
    badges.push({
      key: "none",
      label: "—",
      className: "border-slate-200 bg-white text-slate-400",
    });
  }

  return { badges };
}
