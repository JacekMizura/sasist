import { ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "../../hooks/useActiveWarehouseContext";

type Props = {
  className?: string;
  /** Optional hint below the main message. */
  hint?: string;
};

/** Shown when a screen/action needs active warehouse context but none is selected. */
export function ActiveWarehouseRequiredBanner({ className = "", hint }: Props) {
  return (
    <div
      className={`rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 ${className}`.trim()}
      role="status"
    >
      <p className="font-medium">{ACTIVE_WAREHOUSE_REQUIRED_MESSAGE}</p>
      {hint ? <p className="mt-1 text-xs text-amber-800">{hint}</p> : null}
    </div>
  );
}
