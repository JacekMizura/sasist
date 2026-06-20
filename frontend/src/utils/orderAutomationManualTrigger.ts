import type { OrderAutomationManualTrigger } from "../types/orderAutomation";

export const DEFAULT_MANUAL_CONFIRM_MESSAGE = "Czy na pewno chcesz wykonać tę akcję?";

export const MANUAL_CONDITIONS_NOT_MET_MESSAGE =
  "Nie można wykonać akcji. Warunki nie są spełnione.";

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
    activatorType: "default",
    conditionFilterMode: "hide",
    checkConditionsOnManualRun: true,
    executionMode: "immediate",
    confirmMessage: DEFAULT_MANUAL_CONFIRM_MESSAGE,
  };
}

export function migrateManualTrigger(m: OrderAutomationManualTrigger | null | undefined): OrderAutomationManualTrigger {
  const defaults = defaultManualTrigger();
  if (!m || typeof m !== "object") return defaults;
  return {
    ...defaults,
    ...m,
    buttonEnabled: m.buttonEnabled !== false,
    iconSource: m.iconSource ?? "system",
    iconKey: m.iconKey ?? "Zap",
    customImageDataUrl: m.customImageDataUrl ?? null,
    visibleOnOrderList: m.visibleOnOrderList !== false,
    visibleOnOrderCard: m.visibleOnOrderCard !== false,
    visibleOnMultiActions: m.visibleOnMultiActions !== false,
    visibleOnWmsPacking: m.visibleOnWmsPacking !== false,
    activatorType: m.activatorType === "side_panel" ? "side_panel" : "default",
    conditionFilterMode: m.conditionFilterMode === "disabled" ? "disabled" : "hide",
    checkConditionsOnManualRun: m.checkConditionsOnManualRun !== false,
    executionMode: m.executionMode === "confirm" ? "confirm" : "immediate",
    confirmMessage:
      typeof m.confirmMessage === "string" && m.confirmMessage.trim()
        ? m.confirmMessage.trim()
        : DEFAULT_MANUAL_CONFIRM_MESSAGE,
  };
}

export function resolveManualTriggerColor(color: string | undefined | null): string {
  if (color?.startsWith("#") && color.length >= 4) return color;
  return "#0f172a";
}
