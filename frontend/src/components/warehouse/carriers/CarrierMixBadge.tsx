type Props = {
  isMixed?: boolean;
  size?: "sm" | "md";
  className?: string;
};

export function CarrierMixBadge({ isMixed, size = "sm", className = "" }: Props) {
  const mixed = Boolean(isMixed);
  const text = mixed ? "MIX" : "JEDNORODNY";
  const cls = mixed
    ? "bg-violet-100 text-violet-900 ring-violet-200"
    : "bg-slate-100 text-slate-600 ring-slate-200";
  const sizeCls = size === "md" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-px text-[10px]";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-bold uppercase tracking-wide ring-1 ring-inset ${sizeCls} ${cls} ${className}`}
    >
      {text}
    </span>
  );
}
