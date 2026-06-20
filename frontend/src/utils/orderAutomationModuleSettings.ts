import type {
  ManualActivatorType,
  ManualConditionFilterMode,
  ManualExecutionMode,
  OrderAutomationModuleSettings,
} from "../types/orderAutomation";

export const DEFAULT_MANUAL_CONFIRM_MESSAGE = "Czy na pewno chcesz wykonać tę akcję?";

export function defaultOrderAutomationModuleSettings(): OrderAutomationModuleSettings {
  return {
    activatorType: "default",
    conditionFilterMode: "hide",
    executionMode: "immediate",
    confirmMessage: DEFAULT_MANUAL_CONFIRM_MESSAGE,
  };
}

export function migrateOrderAutomationModuleSettings(
  raw: Partial<OrderAutomationModuleSettings> | null | undefined,
): OrderAutomationModuleSettings {
  const defaults = defaultOrderAutomationModuleSettings();
  if (!raw || typeof raw !== "object") return defaults;
  const confirmRaw = typeof raw.confirmMessage === "string" ? raw.confirmMessage.trim() : "";
  return {
    activatorType: raw.activatorType === "side_panel" ? "side_panel" : "default",
    conditionFilterMode: raw.conditionFilterMode === "disabled" ? "disabled" : "hide",
    executionMode: raw.executionMode === "confirm" ? "confirm" : "immediate",
    confirmMessage: confirmRaw || DEFAULT_MANUAL_CONFIRM_MESSAGE,
  };
}

export function moduleSettingsFromLegacyManualFields(fields: {
  activatorType?: ManualActivatorType;
  conditionFilterMode?: ManualConditionFilterMode;
  executionMode?: ManualExecutionMode;
  confirmMessage?: string;
}): OrderAutomationModuleSettings | null {
  const hasLegacy =
    fields.activatorType != null ||
    fields.conditionFilterMode != null ||
    fields.executionMode != null ||
    (typeof fields.confirmMessage === "string" && fields.confirmMessage.trim().length > 0);

  if (!hasLegacy) return null;

  return migrateOrderAutomationModuleSettings({
    activatorType: fields.activatorType,
    conditionFilterMode: fields.conditionFilterMode,
    executionMode: fields.executionMode,
    confirmMessage: fields.confirmMessage,
  });
}
