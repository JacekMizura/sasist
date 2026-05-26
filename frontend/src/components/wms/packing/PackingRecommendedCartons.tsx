import type { WmsPackingRecommendedCartonApi } from "../../../api/wmsPackingApi";

function CartonThumb({ url, name, size }: { url?: string | null; name: string; size: "sm" | "lg" }) {
  const box = size === "lg" ? "h-20 w-20 rounded-lg text-3xl" : "h-11 w-11 rounded-md text-lg";
  if (url?.trim()) {
    return (
      <img
        src={url.trim()}
        alt=""
        className={`shrink-0 border border-slate-200/90 bg-white object-contain ${box}`}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center border border-slate-200 bg-white ${box}`}
      aria-hidden
    >
      📦
    </div>
  );
}

/** Compact row for selectable cards (top-right). */
function CartonCardBodyCompact({ c }: { c: WmsPackingRecommendedCartonApi }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <CartonThumb url={c.image_url} name={c.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold leading-snug text-slate-900">{c.name || "—"}</p>
        <p className="mt-0.5 text-[11px] font-medium tabular-nums text-slate-600">{c.dimensions || "—"}</p>
      </div>
    </div>
  );
}

/** Main carton block on the live packing left rail. */
export function PackingMainCartonLeft({ carton }: { carton: WmsPackingRecommendedCartonApi | null | undefined }) {
  const c = carton ?? null;
  if (!c) {
    return (
      <div className="mt-3 flex gap-3 rounded-lg border border-dashed border-slate-200 bg-white p-3">
        <CartonThumb url={null} name="" size="lg" />
        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-sm font-bold text-slate-400">—</p>
          <p className="mt-1 text-xs font-medium tabular-nums text-slate-400">—</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 flex gap-3 rounded-lg border border-slate-200/90 bg-white p-3 shadow-sm">
      <CartonThumb url={c.image_url} name={c.name} size="lg" />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-base font-extrabold leading-snug text-slate-900">{c.name?.trim() || "—"}</p>
        <p className="mt-1 text-sm font-semibold tabular-nums text-slate-600">{c.dimensions || "—"}</p>
      </div>
    </div>
  );
}

/** Same data as main left block, styled for the post-packing order card (replaces Gabaryt placeholder). */
export function PackingMainCartonStaticCard({ carton }: { carton: WmsPackingRecommendedCartonApi | null | undefined }) {
  const c = carton ?? null;
  if (!c) {
    return (
      <div className="flex flex-wrap items-end gap-4">
        <CartonThumb url={null} name="" size="lg" />
        <div>
          <p className="text-lg font-bold text-slate-400">—</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-400">—</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-4">
      <CartonThumb url={c.image_url} name={c.name} size="lg" />
      <div>
        <p className="text-xl font-black leading-tight text-slate-900">{c.name?.trim() || "—"}</p>
        <p className="mt-0.5 text-base font-semibold text-slate-600">{c.dimensions || "—"}</p>
      </div>
    </div>
  );
}

export function PackingRecommendedCartonsPanel({
  items,
  selectedId,
  busy,
  onSelect,
}: {
  items: WmsPackingRecommendedCartonApi[];
  selectedId: string | null | undefined;
  busy: boolean;
  onSelect: (cartonId: string) => void;
}) {
  if (!items.length) return null;
  const sel = (selectedId ?? "").trim();
  return (
    <div className="min-w-0 shrink-0">
      <ul className="m-0 flex list-none flex-wrap justify-end gap-2 p-0">
        {items.map((c) => {
          const isSel = sel !== "" && c.id === sel;
          return (
            <li key={c.id} className="min-w-0 max-w-[11rem]">
              <button
                type="button"
                disabled={busy}
                onClick={() => onSelect(c.id)}
                className={[
                  "w-full cursor-pointer rounded-lg border-2 px-2 py-2 text-left shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  isSel ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50/80",
                ].join(" ")}
              >
                <CartonCardBodyCompact c={c} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
