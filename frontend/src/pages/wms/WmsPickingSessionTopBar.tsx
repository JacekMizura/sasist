import type { CSSProperties } from "react";
import { WmsSessionCounterPills } from "../../components/wms/WmsSessionCounterPills";
import { ShoppingCart, User } from "lucide-react";

export type WmsPickingSessionTopBarProps = {
  onBack: () => void;
  backAriaLabel: string;
  /** `null` → wyświetlane „…” (ładowanie). */
  orderCount: number | null;
  /** Gdy brak — nie renderujemy pastylek Zebrane / Do zebrania / W trakcie. */
  pickStats: { zebrane: number; doZebrania: number; wTrakcie: number } | null;
  statusName: string;
  statusBadgeStyle: CSSProperties;
  cartCode?: string | null;
  cartName?: string | null;
};

function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function WmsPickingSessionTopBar({
  onBack,
  backAriaLabel,
  orderCount,
  pickStats,
  cartCode,
  cartName,
}: WmsPickingSessionTopBarProps) {
  
  const hasCart = cartCode != null && cartCode.trim() !== "";

  // Wyciągamy nazwę zalogowanego użytkownika z localStorage (standard w systemie Sellasist)
  const loggedUser = localStorage.getItem("user_username") || "Super Admin";

  return (
    <div className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-md sm:px-6">
      <div className="flex w-full items-center justify-between gap-4">
        
        {/* LEWA STRONA: Powrót + Liczniki sesji */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-600 transition hover:bg-slate-100 active:scale-95"
            onClick={onBack}
            aria-label={backAriaLabel}
          >
            <IconBack />
          </button>
          
          {pickStats != null ? (
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/60 p-1 rounded-xl shrink-0">
              <WmsSessionCounterPills 
                variant="picking" 
                done={pickStats.zebrane} 
                todo={pickStats.doZebrania} 
                progress={pickStats.wTrakcie} 
              />
            </div>
          ) : null}
        </div>

        {/* ŚRODEK: Nazwa użytkownika, który aktualnie zbiera */}
        <div className="hidden md:flex items-center gap-2 text-slate-500 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200/50">
          <User size={14} className="text-slate-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            {loggedUser}
          </span>
        </div>

        {/* PRAWA STRONA: Dane wózka */}
        {hasCart && (
          <div className="shrink-0 flex items-center gap-3 bg-indigo-50 border border-indigo-100/80 rounded-xl px-4 py-2 shadow-inner">
            <div className="flex items-center gap-2">
              <ShoppingCart size={15} className="text-[#5a4fcf]" strokeWidth={2.5} />
              <span className="text-xs font-black text-slate-900 uppercase tracking-wide">
                {(cartName ?? "").trim() || "Wózek dwupoziomowy"}
              </span>
              <span className="font-mono text-[10px] font-bold bg-white text-slate-600 px-1.5 py-0.5 rounded border border-indigo-100/40">
                {cartCode?.trim()}
              </span>
            </div>
            
            <div className="w-px h-4 bg-indigo-200 shrink-0" />
            
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Zamówienia:</span>
              <span className="font-black text-slate-900 bg-white border border-indigo-100/40 w-5 h-5 flex items-center justify-center rounded-md text-[11px]">
                {orderCount == null ? "…" : orderCount}
              </span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}