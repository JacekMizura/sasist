import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, ScanLine, Star } from "lucide-react";
import { DevScannerKindIcon } from "./DevScannerKindIcon";
import { objectKindLabel, type DevScannerCatalogItem } from "./types";

type Props = {
  item: DevScannerCatalogItem;
  isFavorite: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onScan: () => void;
  onToggleFavorite: () => void;
  onScanChild?: (child: DevScannerCatalogItem) => void;
  large?: boolean;
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function DevScannerItemCard({
  item,
  isFavorite,
  expanded,
  onToggleExpand,
  onScan,
  onToggleFavorite,
  onScanChild,
  large,
}: Props) {
  const [copied, setCopied] = useState(false);
  const hasChildren = (item.children?.length ?? 0) > 0 || item.kind === "cart";
  const showTree = item.kind === "cart" && expanded;
  const showParent = item.kind === "basket" && expanded && (item.parentCartCode || item.parentCartName);

  const handleCopy = async () => {
    const ok = await copyText(item.code);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <li className="rounded-xl border border-slate-200 bg-white">
      <div className={`flex gap-2 ${large ? "p-3" : "p-2"}`}>
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50"
          aria-expanded={expanded}
          title={expanded ? "Zwiń" : "Rozwiń"}
        >
          {item.imageUrl && item.kind === "product" ? (
            <img src={item.imageUrl} alt="" className="max-h-8 max-w-8 object-contain" />
          ) : (
            <DevScannerKindIcon kind={item.kind} size={18} />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button type="button" onClick={onToggleExpand} className="w-full text-left">
            <p className="truncate text-sm font-bold text-slate-900">{item.name}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {objectKindLabel(item.kind)}
              {item.relationLabel ? ` · ${item.relationLabel}` : null}
            </p>
            {item.subtitle ? <p className="mt-0.5 truncate text-[11px] text-slate-500">{item.subtitle}</p> : null}
            <p className="mt-0.5 font-mono text-[11px] font-bold text-indigo-700">{item.code}</p>
          </button>

          {(showTree || showParent) && (
            <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
              {showParent ? (
                <p className="text-[11px] text-slate-700">
                  <span className="font-bold">Wózek:</span>{" "}
                  <span className="font-mono font-bold text-indigo-700">
                    {item.parentCartCode || item.parentCartName}
                  </span>
                </p>
              ) : null}
              {showTree ? (
                <ul className="space-y-1">
                  <li className="flex items-center gap-1 text-[11px] font-bold text-slate-800">
                    <ChevronDown size={12} />
                    {item.code}
                  </li>
                  {(item.children ?? []).length === 0 ? (
                    <li className="pl-4 text-[11px] text-slate-400">Brak przypisanych koszyków</li>
                  ) : (
                    (item.children ?? []).map((child) => (
                      <li key={child.id} className="flex items-center gap-1 pl-3">
                        <ChevronRight size={12} className="shrink-0 text-slate-400" />
                        <button
                          type="button"
                          onClick={() => onScanChild?.(child)}
                          className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1.5 text-left text-[11px] font-semibold text-slate-800 hover:bg-white"
                        >
                          {child.name}
                          <span className="ml-1 font-mono text-[10px] text-indigo-600">{child.code}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={onToggleFavorite}
            className={`rounded-lg p-2 ${
              isFavorite ? "text-amber-500 hover:bg-amber-50" : "text-slate-300 hover:bg-slate-100 hover:text-amber-500"
            }`}
            title={isFavorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
          >
            <Star size={16} className={isFavorite ? "fill-current" : ""} />
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Kopiuj kod"
          >
            {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
          </button>
          <button
            type="button"
            onClick={onScan}
            className="rounded-lg bg-slate-900 p-2 text-white hover:bg-slate-800"
            title="Skanuj ponownie"
          >
            <ScanLine size={16} />
          </button>
        </div>
      </div>
      {hasChildren && !expanded ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full border-t border-slate-100 px-3 py-1.5 text-left text-[10px] font-bold text-sky-700 hover:bg-sky-50/50"
        >
          {item.kind === "cart"
            ? `Pokaż koszyki${item.basketCount ? ` (${item.basketCount})` : ""}`
            : "Pokaż powiązania"}
        </button>
      ) : null}
    </li>
  );
}
