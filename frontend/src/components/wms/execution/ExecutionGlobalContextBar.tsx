import { useWarehouseExecution } from "../../../context/WarehouseExecutionContext";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

/** Sticky global operational context — product, carrier, location, remaining. */
export function ExecutionGlobalContextBar() {
  const { activeContext, warehouseMode } = useWarehouseExecution();
  if (!warehouseMode || !activeContext) return null;

  const {
    taskLabel,
    productName,
    productSku,
    carrierLabel,
    locationLabel,
    remainingQty,
    stepLabel,
    scanHint,
  } = activeContext;

  return (
    <div className="sticky top-0 z-[35] border-b border-indigo-300 bg-indigo-950 text-white shadow-lg">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-3 py-2">
        {taskLabel ? (
          <span className="rounded-lg bg-indigo-800 px-2 py-1 text-[10px] font-black uppercase">
            {taskLabel}
          </span>
        ) : null}
        {productName ? (
          <span className="max-w-[45%] truncate text-xs font-bold">{productName}</span>
        ) : null}
        {productSku ? (
          <span className="font-mono text-[10px] text-indigo-300">{productSku}</span>
        ) : null}
        {locationLabel ? (
          <span className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-bold">📍 {locationLabel}</span>
        ) : null}
        {carrierLabel ? (
          <span className="rounded-lg bg-violet-600 px-2 py-1 text-[10px] font-black">→ {carrierLabel}</span>
        ) : null}
        {remainingQty != null ? (
          <span className="rounded-lg bg-white/15 px-2 py-1 text-[10px] font-bold">
            {fmtQty(remainingQty)} szt.
          </span>
        ) : null}
      </div>
      {(stepLabel || scanHint) && (
        <div className="border-t border-indigo-800/80 px-3 py-1.5">
          {stepLabel ? <p className="text-xs font-bold text-indigo-100">{stepLabel}</p> : null}
          {scanHint ? <p className="text-[10px] text-indigo-300">{scanHint}</p> : null}
        </div>
      )}
    </div>
  );
}
