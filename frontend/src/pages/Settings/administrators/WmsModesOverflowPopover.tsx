import { HoverPopover } from "../../../components/ui/HoverPopover";

/** Remaining WMS modes after visible chips — hover + keyboard focus. */
export function WmsModesOverflowPopover({
  hiddenLabels,
  moreCount,
}: {
  hiddenLabels: string[];
  moreCount: number;
}) {
  if (moreCount <= 0 || hiddenLabels.length === 0) return null;

  return (
    <HoverPopover
      interactive
      content={
        <div>
          <p className="mb-1.5 font-semibold text-slate-900">Pozostałe tryby WMS</p>
          <ul className="space-y-1">
            {hiddenLabels.map((label) => (
              <li key={label} className="flex gap-1.5 text-slate-700">
                <span aria-hidden>•</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <button
        type="button"
        tabIndex={0}
        className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200 outline-none hover:bg-slate-200/80 focus-visible:ring-2 focus-visible:ring-orange-400"
        aria-label={`Pozostałe tryby WMS: ${hiddenLabels.join(", ")}`}
      >
        +{moreCount} innych
      </button>
    </HoverPopover>
  );
}
