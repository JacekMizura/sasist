import type { DevScanHistoryEntry } from "../../../utils/devScannerStorage";
import { DevScannerKindIcon } from "./DevScannerKindIcon";
import { objectKindLabel } from "./types";

function formatScanTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

type Props = {
  entries: DevScanHistoryEntry[];
  onReuse: (entry: DevScanHistoryEntry) => void;
  large?: boolean;
};

export function DevScannerHistorySection({ entries, onReuse, large }: Props) {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Ostatnio skanowane</p>
      {entries.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">
          Brak historii — wpisz lub zeskanuj kod (Enter / Skanuj)
        </p>
      ) : (
        <ul className="space-y-1.5 overflow-y-auto pr-0.5">
          {entries.map((e) => {
            const name = e.displayName || e.productName || e.locationLabel || e.code;
            const relation =
              e.relationLabel ||
              (e.kind === "basket" && e.parentCartCode
                ? `Koszyk • ${e.parentCartCode}`
                : e.kind === "product" && e.productSku
                  ? `SKU ${e.productSku}`
                  : null);
            return (
              <li key={`${e.code}-${e.scannedAt}`}>
                <button
                  type="button"
                  onClick={() => onReuse(e)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white text-left transition-colors hover:border-sky-300 hover:bg-sky-50/40 ${
                    large ? "min-h-[3.75rem] px-3 py-3" : "px-2.5 py-2"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
                    {e.kind === "product" && e.productImageUrl ? (
                      <img src={e.productImageUrl} alt="" className="max-h-7 max-w-7 object-contain" />
                    ) : (
                      <DevScannerKindIcon kind={e.kind} size={16} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-slate-900">{name}</span>
                    <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">
                      {objectKindLabel(e.kind)}
                      {relation ? ` · ${relation}` : null}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] font-bold text-slate-400">
                    {formatScanTime(e.scannedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
