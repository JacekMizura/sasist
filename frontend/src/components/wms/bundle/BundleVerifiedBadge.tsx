import { ShieldCheck } from "lucide-react";

type Props = {
  bundleName?: string | null;
  className?: string;
};

export function BundleVerifiedBadge({ bundleName, className = "" }: Props) {
  const label = (bundleName ?? "").trim() || "Bundle";
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border-2 border-emerald-500 bg-emerald-50 px-4 py-3 shadow-sm ${className}`}
      role="status"
    >
      <ShieldCheck size={22} className="shrink-0 text-emerald-600" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-800">Bundle zweryfikowany</p>
        <p className="text-sm font-bold text-emerald-950 truncate">{label}</p>
      </div>
    </div>
  );
}
