import { FileWarning, Loader2, RotateCcw, Undo2 } from "lucide-react";

import type { OrderHeaderCaseRow } from "../useOrderHeaderCases";
import { OrderHeaderMenuItem } from "../OrderHeaderMenuItem";
import { odHeaderActionMenuDividerClass } from "../orderHeaderActionTokens";

type Props = {
  loading: boolean;
  error: string | null;
  returns: OrderHeaderCaseRow[];
  complaints: OrderHeaderCaseRow[];
  onAddReturn: () => void;
  onAddComplaint: () => void;
  onOpenReturnForm: () => void;
  onClose: () => void;
};

/**
 * Sellasist-style returns/complaints menu:
 * create actions first, then existing cases (if any).
 */
export function OrderReturnsComplaintsPanel({
  loading,
  error,
  returns,
  complaints,
  onAddReturn,
  onAddComplaint,
  onOpenReturnForm,
  onClose,
}: Props) {
  const hasCases = returns.length > 0 || complaints.length > 0;

  return (
    <div>
      <OrderHeaderMenuItem
        icon={<FileWarning className="h-full w-full" strokeWidth={2} />}
        label="Utwórz reklamację"
        onClick={() => {
          onClose();
          onAddComplaint();
        }}
      />
      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <OrderHeaderMenuItem
        icon={<Undo2 className="h-full w-full" strokeWidth={2} />}
        label="Utwórz zwrot"
        onClick={() => {
          onClose();
          onAddReturn();
        }}
      />
      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <OrderHeaderMenuItem
        icon={<RotateCcw className="h-full w-full" strokeWidth={2} />}
        label="Formularz zwrotu"
        onClick={() => {
          onClose();
          onOpenReturnForm();
        }}
      />

      {loading ? (
        <>
          <div className={odHeaderActionMenuDividerClass} role="separator" />
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Ładowanie zgłoszeń…
          </div>
        </>
      ) : error ? (
        <>
          <div className={odHeaderActionMenuDividerClass} role="separator" />
          <p className="px-3 py-2.5 text-sm text-red-600">{error}</p>
        </>
      ) : hasCases ? (
        <>
          <div className={odHeaderActionMenuDividerClass} role="separator" />
          {complaints.length > 0 ? (
            complaints.length === 1 ? (
              <OrderHeaderMenuItem
                to={complaints[0].openPath}
                onClick={onClose}
                icon={<FileWarning className="h-full w-full" strokeWidth={2} />}
                label={`Reklamacja ${complaints[0].number}`}
              />
            ) : (
              <>
                <p className="px-3 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Reklamacje ({complaints.length})
                </p>
                {complaints.map((row) => (
                  <OrderHeaderMenuItem
                    key={`c-${row.id}`}
                    to={row.openPath}
                    onClick={onClose}
                    icon={<FileWarning className="h-full w-full" strokeWidth={2} />}
                    label={row.number}
                    trailing={<span className="text-[11px] text-slate-400">{row.status}</span>}
                  />
                ))}
              </>
            )
          ) : null}
          {returns.length > 0 ? (
            returns.length === 1 ? (
              <OrderHeaderMenuItem
                to={returns[0].openPath}
                onClick={onClose}
                icon={<Undo2 className="h-full w-full" strokeWidth={2} />}
                label={`Zwrot ${returns[0].number}`}
              />
            ) : (
              <>
                <p className="px-3 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Zwroty ({returns.length})
                </p>
                {returns.map((row) => (
                  <OrderHeaderMenuItem
                    key={`r-${row.id}`}
                    to={row.openPath}
                    onClick={onClose}
                    icon={<Undo2 className="h-full w-full" strokeWidth={2} />}
                    label={row.number}
                    trailing={<span className="text-[11px] text-slate-400">{row.status}</span>}
                  />
                ))}
              </>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}
