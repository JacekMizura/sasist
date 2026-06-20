/** Lokalny model reguł „Akcje automatyczne” (persistencja w przeglądarce do czasu dedykowanego API). */

export type AutomationConditionOp = "in" | "not_in" | "eq" | "neq" | "contains";

/** Łącznik do następnego warunku (ostatni wiersz ignoruje). Domyślnie: and. */
export type AutomationConditionJoin = "and" | "or";

export type AutomationCondition = {
  uid: string;
  fieldKey: string;
  operator: AutomationConditionOp;
  /** Wartości warunku — tablica (pojedyncze pola: jeden element). */
  value: string[];
  /** Między tym warunkiem a następnym. Brak = ORAZ. */
  joinToNext?: AutomationConditionJoin;
  /** @deprecated migracja — stary format pojedynczego stringa */
  legacyValue?: string;
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

/** Domyślny przycisk vs panel wysuwany z boku (Sellasist). */
export type ManualActivatorType = "default" | "side_panel";

/** Gdy warunki niespełnione — ukryj przycisk lub tylko wyszarz. */
export type ManualConditionFilterMode = "hide" | "disabled";

/** Natychmiast vs wymagane potwierdzenie przed wykonaniem. */
export type ManualExecutionMode = "immediate" | "confirm";

export type OrderAutomationManualTrigger = {
  /** Reguła może być uruchamiana ręcznie (górny checkbox „Ręcznie”). */
  enabled: boolean;
  /** Pokazuj skonfigurowany przycisk aktywatora w UI. */
  buttonEnabled?: boolean;
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
  /** Przycisk ręczny widoczny na liście zamówień */
  visibleOnOrderList?: boolean;
  /** Przycisk ręczny widoczny na karcie zamówienia */
  visibleOnOrderCard?: boolean;
  /** Multiakcje (zbiorcze operacje na zamówieniach) */
  visibleOnMultiActions?: boolean;
  /** Ekran pakowania WMS */
  visibleOnWmsPacking?: boolean;
  /** Typ prezentacji aktywatora */
  activatorType?: ManualActivatorType;
  /** Zachowanie gdy warunki reguły nie są spełnione */
  conditionFilterMode?: ManualConditionFilterMode;
  /** Przed ręcznym wykonaniem sprawdź warunki JEŚLI */
  checkConditionsOnManualRun?: boolean;
  /** Tryb wykonania po kliknięciu */
  executionMode?: ManualExecutionMode;
  /** Treść modala / drugiego kroku potwierdzenia */
  confirmMessage?: string;
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

/** Tryb okna czasowego wykonania reguły. */
export type OrderAutomationRunMode = "continuous" | "hours_only" | "days_and_hours";

export type OrderAutomationExecution = {
  /** Gdy false — reguła tylko ręczna (bez obserwacji systemu). Domyślnie true. */
  automatic: boolean;
  runMode: OrderAutomationRunMode;
  /** Godzina od (HH:mm) — dla hours_only / days_and_hours */
  windowFrom: string;
  /** Godzina do (HH:mm) */
  windowTo: string;
  /** Dni tygodnia ISO 1–7 (Pn–Nd) — dla days_and_hours */
  activeDays: number[];
  /** @deprecated legacy — migrowane przy odczycie */
  onOrderCreated?: boolean;
  onStatusChanged?: boolean;
  onSchedule?: boolean;
  /** @deprecated legacy harmonogram — migrowany do runMode/activeDays */
  scheduleCron?: string;
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
  /** Opóźnienie wykonania po spełnieniu warunków (minuty). Domyślnie 0. */
  delayMinutes?: number;
  stats: OrderAutomationStats;
};

export type OrderAutomationLogLevel = "success" | "error" | "info";

/** Historia wykonań — uruchomienie reguły na zamówieniu / test. */
export type OrderAutomationExecutionLogEntry = {
  id: string;
  ts: string;
  ruleId: string;
  ruleName: string;
  level: OrderAutomationLogLevel;
  message: string;
  detail?: string;
  /** Id zamówienia — gdy uruchomienie produkcyjne */
  orderId?: string | null;
  /** Opis wykonanych efektów */
  effectsExecuted?: string[];
  kind?: "execution" | "test";
};

/** @deprecated alias */
export type OrderAutomationLogEntry = OrderAutomationExecutionLogEntry;

export type OrderAutomationChangeType =
  | "rule_created"
  | "field_updated"
  | "condition_added"
  | "condition_removed"
  | "condition_updated"
  | "effect_added"
  | "effect_removed"
  | "effect_updated";

/** Historia zmian konfiguracji reguły (diff before/after). */
export type OrderAutomationChangeLogEntry = {
  id: string;
  ruleId: string;
  type: OrderAutomationChangeType;
  /** Etykieta pola (np. „Status zamówienia”, „Nazwa”). */
  field: string;
  before: string | null;
  after: string | null;
  userId: number;
  userName: string;
  createdAt: string;
};
