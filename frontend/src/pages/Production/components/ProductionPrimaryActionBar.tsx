import { Link } from "react-router-dom";
import { ExternalLink, FileText, Play, Printer, XCircle } from "lucide-react";

import { IconButton, PrimaryButton, primaryButtonClassName } from "@/design-system";
import type { ProductionNextAction, ProductionSecondaryAction } from "../productionNextAction";

type Props = {
  primary: ProductionNextAction;
  secondary: ProductionSecondaryAction[];
  busy?: boolean;
  onPrimaryClick?: () => void;
  onSecondary: (id: ProductionSecondaryAction["id"]) => void;
  className?: string;
};

const COMPACT_PRIMARY_KINDS = new Set([
  "continue_collecting",
  "start_collecting",
  "continue_production",
]);

function primaryTitle(primary: ProductionNextAction): string | undefined {
  if (primary.disabled && primary.disabledReason) return primary.disabledReason;
  if (primary.kind === "continue_collecting") return "Kontynuuj zbieranie komponentów";
  if (primary.kind === "start_collecting") return "Rozpocznij zbieranie komponentów";
  if (primary.kind === "continue_production") return "Kontynuuj produkcję";
  return primary.label || undefined;
}

function secondaryPresentation(action: ProductionSecondaryAction) {
  switch (action.id) {
    case "print_card":
    case "preview_print":
      return { Icon: Printer, title: "Drukuj kartę produkcyjną", tone: "neutral" as const };
    case "print_pick_list":
      return { Icon: Printer, title: "Drukuj listę pobrania materiałów", tone: "neutral" as const };
    case "start_paper":
      return { Icon: FileText, title: "Otwórz realizację papierową", tone: "neutral" as const };
    case "open_erp":
      return { Icon: FileText, title: "Otwórz realizację papierową", tone: "neutral" as const };
    case "open_wms":
      return { Icon: ExternalLink, title: "Otwórz terminal WMS", tone: "neutral" as const };
    case "cancel":
      return { Icon: XCircle, title: "Anuluj zlecenie", tone: "danger" as const };
  }
}

export function ProductionPrimaryActionBar({
  primary,
  secondary,
  busy,
  onPrimaryClick,
  onSecondary,
  className = "",
}: Props) {
  const primaryDisabled = Boolean(busy || primary.disabled);
  const compactPrimary = COMPACT_PRIMARY_KINDS.has(primary.kind);
  const primaryIcon = compactPrimary ? <Play className="h-4 w-4" aria-hidden /> : null;
  const tooltip = primaryTitle(primary);

  const primaryControl =
    primary.href && !onPrimaryClick ? (
      <Link
        to={primary.href}
        target={primary.openInNewTab ? "_blank" : undefined}
        rel={primary.openInNewTab ? "noopener noreferrer" : undefined}
        className={primaryButtonClassName(
          `${compactPrimary ? "h-8 gap-1.5 px-3 text-sm" : ""} ${
            primaryDisabled ? "pointer-events-none opacity-50" : ""
          }`,
        )}
        aria-disabled={primaryDisabled}
        title={tooltip}
        onClick={(e) => {
          if (primaryDisabled) e.preventDefault();
        }}
      >
        {primaryIcon}
        {primary.label}
      </Link>
    ) : (
      <PrimaryButton
        type="button"
        density={compactPrimary ? "compact" : "default"}
        disabled={primaryDisabled}
        title={tooltip}
        onClick={onPrimaryClick}
      >
        {primaryIcon}
        {primary.label}
      </PrimaryButton>
    );

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {primary.kind !== "none" ? primaryControl : null}
      {secondary.map((action) => {
        const { Icon, title, tone } = secondaryPresentation(action);
        return (
          <IconButton
            key={action.id}
            type="button"
            density="compact"
            tone={tone}
            disabled={busy || action.disabled}
            aria-label={title}
            title={title}
            onClick={() => onSecondary(action.id)}
          >
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
          </IconButton>
        );
      })}
    </div>
  );
}
