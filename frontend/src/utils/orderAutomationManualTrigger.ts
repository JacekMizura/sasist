import type { OrderAutomationManualTrigger } from "../types/orderAutomation";

export const MANUAL_CONDITIONS_NOT_MET_MESSAGE =
  "Nie można wykonać akcji. Warunki nie są spełnione.";

/** @deprecated użyj DEFAULT_MANUAL_CONFIRM_MESSAGE z orderAutomationModuleSettings */
export { DEFAULT_MANUAL_CONFIRM_MESSAGE } from "./orderAutomationModuleSettings";

export function defaultManualTrigger(): OrderAutomationManualTrigger {
  return {
    enabled: false,
    buttonEnabled: true,
    label: "Akcja",
    icon: "⚡",
    color: "#0f172a",
    shortcut: "",
    iconSource: "system",
    iconKey: "Zap",
    customImageDataUrl: null,
    visibleOnOrderList: true,
    visibleOnOrderCard: true,
    visibleOnMultiActions: true,
    visibleOnWmsPacking: true,
    checkConditionsOnManualRun: true,
  };
}

export function migrateManualTrigger(m: OrderAutomationManualTrigger | null | undefined): OrderAutomationManualTrigger {
  const defaults = defaultManualTrigger();
  if (!m || typeof m !== "object") return defaults;
  const {
    activatorType: _a,
    conditionFilterMode: _c,
    executionMode: _e,
    confirmMessage: _m,
    ...rest
  } = m;
  return {
    ...defaults,
    ...rest,
    buttonEnabled: m.buttonEnabled !== false,
    iconSource: m.iconSource ?? "system",
    iconKey: m.iconKey ?? "Zap",
    customImageDataUrl: m.customImageDataUrl ?? null,
    visibleOnOrderList: m.visibleOnOrderList !== false,
    visibleOnOrderCard: m.visibleOnOrderCard !== false,
    visibleOnMultiActions: m.visibleOnMultiActions !== false,
    visibleOnWmsPacking: m.visibleOnWmsPacking !== false,
    checkConditionsOnManualRun: m.checkConditionsOnManualRun !== false,
  };
}

export function resolveManualTriggerColor(color: string | undefined | null): string {
  if (color?.startsWith("#") && color.length >= 4) return color;
  return "#0f172a";
}
