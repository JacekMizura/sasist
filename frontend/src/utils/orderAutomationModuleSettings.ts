import type {
  ManualActivatorType,
  ManualConditionFilterMode,
  OrderAutomationModuleSettings,
} from "../types/orderAutomation";

export function defaultOrderAutomationModuleSettings(): OrderAutomationModuleSettings {
  return {
    activatorType: "default",
    conditionFilterMode: "hide",
  };
}

export function migrateOrderAutomationModuleSettings(
  raw: OrderAutomationModuleSettings | null | undefined,
): OrderAutomationModuleSettings {
  const defaults = defaultOrderAutomationModuleSettings();
  if (!raw || typeof raw !== "object") return defaults;
  return {
    activatorType: raw.activatorType === "side_panel" ? "side_panel" : "default",
    conditionFilterMode: raw.conditionFilterMode === "disabled" ? "disabled" : "hide",
  };
}

export function moduleSettingsFromLegacyManualFields(fields: {
  activatorType?: ManualActivatorType;
  conditionFilterMode?: ManualConditionFilterMode;
}): OrderAutomationModuleSettings | null {
  if (fields.activatorType == null && fields.conditionFilterMode == null) return null;
  return migrateOrderAutomationModuleSettings({
    activatorType: fields.activatorType ?? "default",
    conditionFilterMode: fields.conditionFilterMode ?? "hide",
  });
}
