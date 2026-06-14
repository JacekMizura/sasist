import { ExternalLink } from "lucide-react";
import { bundleTraceabilityEntries } from "../../../utils/bundleScanFlow";

type Props = {
  links: Record<string, string | null | undefined>;
  className?: string;
};

/** Linki traceability z poziomu skanera (partie, recall, zwroty, reklamacje). */
export function BundleTraceabilityStrip({ links, className = "" }: Props) {
  const entries = bundleTraceabilityEntries(links);
  if (entries.length === 0) return null;

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 ${className}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Traceability</p>
      <div className="flex flex-wrap gap-2">
        {entries.map((e) => (
          <a
            key={e.key}
            href={e.href}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-50 transition-colors"
          >
            {e.label}
            <ExternalLink size={12} className="opacity-60" aria-hidden />
          </a>
        ))}
      </div>
    </div>
  );
}
