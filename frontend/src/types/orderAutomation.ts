/** Lokalny model reguł „Akcje automatyczne” (persistencja w przeglądarce do czasu dedykowanego API). */

export type AutomationConditionOp = "eq" | "neq" | "contains";

/** Łącznik do następnego warunku (ostatni wiersz ignoruje). Domyślnie: and. */
export type AutomationConditionJoin = "and" | "or";

export type AutomationCondition = {
  uid: string;
  fieldKey: string;
  operator: AutomationConditionOp;
  /** Interpretacja zależy od pola (np. id statusu panelu jako string). */
  value: string;
  /** Między tym warunkiem a następnym. Brak = ORAZ. */
  joinToNext?: AutomationConditionJoin;
};

export type AutomationEffectKind =
  | "change_status"
  | "send_message"
  | "generate_document"
  | "assign_courier"
  | "add_tag"
  | "print"
  | "wms_action";

export type AutomationEffect = {
  uid: string;
  kind: AutomationEffectKind;
  payload: Record<string, string | number | boolean | null>;
};

export type ManualTriggerIconSource = "system" | "custom";

export type OrderAutomationManualTrigger = {
  enabled: boolean;
  label: string;
  /** Legacy / emoji fallback */
  icon: string;
  color: string;
  shortcut: string;
  /** Ikona systemowa (Lucide) vs własny plik */
  iconSource: ManualTriggerIconSource;
  /** Nazwa ikony z katalogu (np. Zap) — gdy iconSource === "system" */
  iconKey: string;
  /** Data URL obrazka — gdy iconSource === "custom" */
  customImageDataUrl?: string | null;
};

/** Jedna linia harmonogramu (dzień tygodnia ISO: 1 = pon … 7 = nd). */
export type OrderAutomationDayScheduleRow = {
  day: number;
  enabled: boolean;
  hour: number;
  minute: number;
  /** Powtórzenie co N minut — null = brak */
  repeatEveryMin: number | null;
};

/** Harmonogram zapisany w polu scheduleCron jako JSON (patrz orderAutomationSchedule). */
export type OrderAutomationScheduleSpec = {
  /** IANA — informacyjnie */
  timezone: string;
  /** Zawsze 7 wierszy (Pn–Nd). */
  rows: OrderAutomationDayScheduleRow[];
};

export type OrderAutomationExecution = {
  onOrderCreated: boolean;
  onStatusChanged: boolean;
  onSchedule: boolean;
  /** JSON harmonogramu (oa_sch_v2) — patrz utils/orderAutomationSchedule */
  scheduleCron: string;
};

export type OrderAutomationStats = {
  lastRunAt: string | null;
  runCount: number;
};

export type OrderAutomationRule = {
  id: string;
  /** Stały numer do supportu / logów (przypisywany przy zapisie). */
  publicId?: number;
  name: string;
  group: string;
  enabled: boolean;
  manualTrigger: OrderAutomationManualTrigger;
  conditions: AutomationCondition[];
  effects: AutomationEffect[];
  execution: OrderAutomationExecution;
  stats: OrderAutomationStats;
};

export type OrderAutomationLogLevel = "success" | "error" | "info";

export type OrderAutomationLogEntry = {
  id: string;
  ts: string;
  ruleId: string;
  ruleName: string;
  level: OrderAutomationLogLevel;
  message: string;
  detail?: string;
};
