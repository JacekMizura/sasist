import { getManualIconComponent } from "@/modules/orders/automation/utils/orderAutomationManualIcons";
import type { OrderAutomationManualTrigger } from "../../../types/orderAutomation";
import { resolveManualTriggerColor } from "../../../utils/orderAutomationManualTrigger";

type Props = {
  manualTrigger: Pick<
    OrderAutomationManualTrigger,
    "label" | "iconKey" | "icon" | "color" | "iconSource" | "customImageDataUrl" | "shortcut"
  >;
  showShortcut?: boolean;
};

export function ManualTriggerButtonPreview({ manualTrigger, showShortcut = true }: Props) {
  const label = manualTrigger.label.trim() || "Akcja";
  const bg = resolveManualTriggerColor(manualTrigger.color);
  const shortcut = manualTrigger.shortcut?.trim() ?? "";

  const buttonInner =
    manualTrigger.iconSource === "custom" && manualTrigger.customImageDataUrl ? (
      <>
        <img src={manualTrigger.customImageDataUrl} alt="" className="h-4 w-4 shrink-0 rounded object-cover" />
        {label}
      </>
    ) : (
      (() => {
        const Icon = getManualIconComponent(manualTrigger.iconKey || "Zap");
        return (
          <>
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            {label}
          </>
        );
      })()
    );

  return (
    <div className="inline-flex flex-wrap items-center gap-3">
      <span
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm"
        style={{ backgroundColor: bg }}
        aria-hidden
      >
        {buttonInner}
      </span>
      {showShortcut && shortcut ? (
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-600">
          {shortcut}
        </span>
      ) : null}
    </div>
  );
}
