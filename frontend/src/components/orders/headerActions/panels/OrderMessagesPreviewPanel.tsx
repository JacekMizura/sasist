import { useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";

import { getOrderNotes } from "../../../../api/ordersApi";
import type { OrderNoteDto } from "../../orderDetailPageTypes";
import {
  odHeaderActionFooterLinkClass,
  odHeaderActionMenuDividerClass,
  odHeaderActionMenuItemClass,
  odHeaderActionMenuItemIconClass,
} from "../orderHeaderActionTokens";

type Props = {
  orderId: number;
  customerName?: string | null;
  customerPreview?: string | null;
  hasCustomerComment?: boolean;
  onGoToComms: () => void;
};

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function noteSubject(n: OrderNoteDto): string {
  const raw = (n.content || "").trim();
  if (!raw) return "Bez tematu";
  const firstLine = raw.split(/\r?\n/)[0]?.trim() || raw;
  return firstLine.length > 72 ? `${firstLine.slice(0, 72)}…` : firstLine;
}

function noteStatus(type: string): string {
  const t = (type || "").toLowerCase();
  if (t.includes("customer") || t.includes("client") || t === "comment") return "Klient";
  if (t.includes("email") || t.includes("mail")) return "E-mail";
  if (t.includes("internal") || t.includes("note")) return "Wewnętrzna";
  return type?.trim() || "Wiadomość";
}

/** Mail-like messages preview — full thread on Komunikacja tab. */
export function OrderMessagesPreviewPanel({
  orderId,
  customerName,
  customerPreview,
  hasCustomerComment,
  onGoToComms,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<OrderNoteDto[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getOrderNotes(orderId)
      .then((rows) => {
        if (!cancelled) setNotes(Array.isArray(rows) ? rows.slice(0, 8) : []);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const clientLabel = (customerName || "").trim() || "Klient";
  const hasPreview = Boolean(hasCustomerComment && (customerPreview || "").trim());
  const empty = !loading && notes.length === 0 && !hasPreview;

  return (
    <div>
      {loading ? (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Ładowanie…
        </div>
      ) : empty ? (
        <p className="px-3 py-4 text-sm text-slate-500">Brak wiadomości.</p>
      ) : (
        <ul>
          {hasPreview ? (
            <li>
              <button type="button" onClick={onGoToComms} className={odHeaderActionMenuItemClass}>
                <span className={odHeaderActionMenuItemIconClass} aria-hidden>
                  <Mail className="h-full w-full" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {(customerPreview || "").trim()}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                    <span>{clientLabel}</span>
                    <span>·</span>
                    <span>Klient</span>
                  </span>
                </span>
              </button>
            </li>
          ) : null}
          {notes.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={onGoToComms} className={odHeaderActionMenuItemClass}>
                <span className={odHeaderActionMenuItemIconClass} aria-hidden>
                  <Mail className="h-full w-full" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{noteSubject(n)}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                    <span className="truncate">{clientLabel}</span>
                    <span>·</span>
                    <span className="shrink-0">{fmtWhen(n.created_at)}</span>
                    <span>·</span>
                    <span className="shrink-0">{noteStatus(n.type)}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <button type="button" onClick={onGoToComms} className={odHeaderActionFooterLinkClass}>
        Przejdź do Komunikacji
      </button>
    </div>
  );
}
