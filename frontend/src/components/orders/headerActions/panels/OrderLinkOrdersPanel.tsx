import { Link } from "react-router-dom";
import { Link2, Link2Off, Plus } from "lucide-react";

import type { OrderHeaderLinkedOrder } from "../orderHeaderLinkStore";
import {
  odHeaderActionMenuDividerClass,
  odHeaderActionMenuItemClass,
  odHeaderActionMenuItemIconClass,
} from "../orderHeaderActionTokens";

type Props = {
  linked: OrderHeaderLinkedOrder[];
  onUnlink: (targetId: number) => void;
  onLinkNew: () => void;
  onClose: () => void;
};

/** Linked orders list; "Połącz nowe…" opens the search modal. */
export function OrderLinkOrdersPanel({ linked, onUnlink, onLinkNew, onClose }: Props) {
  return (
    <div>
      {linked.length === 0 ? (
        <p className="px-3 py-3 text-sm text-slate-500">Brak połączonych zamówień.</p>
      ) : (
        <ul>
          {linked.map((row) => (
            <li key={row.id} className="flex items-stretch">
              <Link
                to={`/orders/${row.id}`}
                onClick={onClose}
                className={`${odHeaderActionMenuItemClass} min-w-0 flex-1`}
              >
                <Link2 className={odHeaderActionMenuItemIconClass} strokeWidth={2} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">#{row.number}</span>
              </Link>
              <button
                type="button"
                title="Rozłącz"
                aria-label={`Rozłącz #${row.number}`}
                onClick={() => onUnlink(row.id)}
                className="inline-flex shrink-0 items-center px-3 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                <Link2Off className="h-4 w-4" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <button
        type="button"
        onClick={() => {
          onClose();
          onLinkNew();
        }}
        className={`${odHeaderActionMenuItemClass} font-semibold text-blue-700 hover:text-blue-800`}
      >
        <Plus className={odHeaderActionMenuItemIconClass} strokeWidth={2} aria-hidden />
        <span className="min-w-0 flex-1">Połącz nowe…</span>
      </button>
    </div>
  );
}
