import {
  getOrderEventDisplay,
  orderEventDevTitle,
  type OrderEventDisplay,
} from "../../utils/orderEventLabels";

type Props = {
  eventType: string | null | undefined;
  /** Compact table cell vs inline badge. */
  variant?: "table" | "inline";
  className?: string;
};

export function OrderEventTypeLabel({ eventType, variant = "table", className = "" }: Props) {
  const display = getOrderEventDisplay(eventType);
  const title = orderEventDevTitle(eventType, display.label);

  if (variant === "inline") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${display.bgClass} ${display.textClass} ${className}`}
        title={title}
      >
        <span aria-hidden>{display.icon}</span>
        <span>{display.label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 text-xs font-semibold normal-case ${display.textClass} ${className}`}
      title={title}
    >
      <span className="shrink-0" aria-hidden>
        {display.icon}
      </span>
      <span className="min-w-0 leading-snug">{display.label}</span>
    </span>
  );
}

export function orderEventDisplayForType(eventType: string | null | undefined): OrderEventDisplay {
  return getOrderEventDisplay(eventType);
}
