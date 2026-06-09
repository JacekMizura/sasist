import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MapPin, Package } from "lucide-react";

import type { LiveSearchPick, LiveSearchRow } from "./WmsInventoryLiveSearchDropdown";
import WmsInventoryProductThumb from "./WmsInventoryProductThumb";

type Props = {
  query: string;
  open: boolean;
  loading: boolean;
  productRows: LiveSearchRow[];
  locationRows: LiveSearchRow[];
  carrierRows: LiveSearchRow[];
  onPick: (pick: LiveSearchPick) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

function ResultButton({
  row,
  showEnterHint,
  onPick,
}: {
  row: LiveSearchRow;
  showEnterHint?: boolean;
  onPick: (pick: LiveSearchPick) => void;
}) {
  const pick = (): LiveSearchPick => {
    if (row.kind === "product") return { kind: "product", scanCode: row.scanCode };
    if (row.kind === "location")
      return { kind: "location", locationCode: row.locationCode, taskId: row.taskId };
    return { kind: "carrier", code: row.code };
  };

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 active:bg-slate-100"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(pick())}
    >
      {row.kind === "product" ? (
        <WmsInventoryProductThumb url={row.image_url} name={row.label} size="sm" />
      ) : row.kind === "location" ? (
        <MapPin className="h-4 w-4 shrink-0 text-[#23438e]" />
      ) : (
        <Package className="h-4 w-4 shrink-0 text-slate-500" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">{row.label}</span>
        {row.sub ? <span className="block truncate text-xs text-slate-500">{row.sub}</span> : null}
      </span>
      {showEnterHint ? <span className="shrink-0 text-[10px] font-bold text-slate-400">↵</span> : null}
    </button>
  );
}

function Group({
  label,
  rows,
  onPick,
  showEnterOnFirst,
}: {
  label: string;
  rows: LiveSearchRow[];
  onPick: (pick: LiveSearchPick) => void;
  showEnterOnFirst?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <li>
      <p className="px-3 pb-0 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <ul>
        {rows.map((row, idx) => (
          <li key={row.key}>
            <ResultButton row={row} showEnterHint={showEnterOnFirst && idx === 0} onPick={onPick} />
          </li>
        ))}
      </ul>
    </li>
  );
}

export default function WmsInventoryLiveSearchDropdown({
  query,
  open,
  loading,
  productRows,
  locationRows,
  carrierRows,
  onPick,
  anchorRef,
}: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const total = productRows.length + locationRows.length + carrierRows.length;

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setRect(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, open, query]);

  if (!open || query.trim().length < 2 || !rect) return null;

  const panel = (
    <div
      className="fixed z-[10060] overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl"
      style={{
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(320, window.innerHeight - rect.bottom - 16),
      }}
      role="listbox"
    >
      {loading ? (
        <p className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Szukam…
        </p>
      ) : null}
      {!loading && total === 0 ? <p className="px-3 py-2 text-xs font-bold text-slate-400">Brak wyników</p> : null}
      {!loading && total > 0 ? (
        <ul className="py-1">
          <Group label="Produkty" rows={productRows} onPick={onPick} showEnterOnFirst />
          <Group label="Lokalizacje" rows={locationRows} onPick={onPick} />
          <Group label="Nośniki" rows={carrierRows} onPick={onPick} />
        </ul>
      ) : null}
    </div>
  );

  return createPortal(panel, document.body);
}
