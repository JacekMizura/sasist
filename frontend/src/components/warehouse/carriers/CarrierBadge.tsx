type Props = {
  code: string;
  showMix?: boolean;
  className?: string;
};

/**
 * Badge nośnika magazynowego (paleta / karton / kuweta) — odrębny od lokalizacji i od wózka (CART-).
 */
export function CarrierBadge({ code, showMix, className = "" }: Props) {
  const c = (code || "").trim() || "—";
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-md border border-[#7a5c2e]/35 bg-gradient-to-br from-[#f3e6d4] to-[#e8d4bc] px-2 py-0.5 font-mono text-[12px] font-semibold leading-tight text-[#3d2f1c] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ${className}`}
      title={c}
    >
      <span aria-hidden className="shrink-0 select-none text-[13px]">
        📦
      </span>
      <span className="min-w-0 truncate">{c}</span>
      {showMix ? (
        <span className="shrink-0 rounded border border-[#7a5c2e]/40 bg-[#dcc9a8] px-1 text-[10px] font-black uppercase tracking-wide text-[#2a2115]">
          MIX
        </span>
      ) : null}
    </span>
  );
}
