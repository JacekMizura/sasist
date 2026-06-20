import { getManualIconComponent, getManualIconEntry } from "@/modules/orders/automation/utils/orderAutomationManualIcons";
import type { OrderAutomationManualTrigger } from "../../../types/orderAutomation";

type Props = {
  manualTrigger: Pick<OrderAutomationManualTrigger, "label" | "iconKey" | "icon" | "color" | "iconSource" | "customImageDataUrl">;
};

function resolveButtonColor(color: string | undefined | null): string {
  if (color?.startsWith("#") && color.length >= 4) return color;
  return "#0f172a";
}

export function ManualTriggerButtonPreview({ manualTrigger }: Props) {
  const label = manualTrigger.label.trim() || "Akcja";
  const bg = resolveButtonColor(manualTrigger.color);

  if (manualTrigger.iconSource === "custom" && manualTrigger.customImageDataUrl) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm"
        style={{ backgroundColor: bg }}
        aria-hidden
      >
        <img src={manualTrigger.customImageDataUrl} alt="" className="h-4 w-4 shrink-0 rounded object-cover" />
        {label}
      </span>
    );
  }

  const Icon = getManualIconComponent(manualTrigger.iconKey || "Zap");
  const iconEntry = getManualIconEntry(manualTrigger.iconKey || "Zap");

  return (
    <span
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm"
      style={{ backgroundColor: bg }}
      aria-hidden
      title={iconEntry.label}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
      {label}
    </span>
  );
}
