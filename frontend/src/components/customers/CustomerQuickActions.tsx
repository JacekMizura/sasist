import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

import { postCustomerCrmAction, type CustomerCrmAction, type CustomerDetail } from "../../api/customersApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { customerIsBlocked } from "../../modules/customers/customerProfile";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";

type Props = {
  customerId: number;
  detail: CustomerDetail | null;
  onCopyCustomerData?: () => void;
  onExportHistory?: () => void;
  onDeleteRequest?: () => void;
  onProfileUpdated?: (detail: CustomerDetail) => void;
};

const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50";

export function CustomerQuickActions({
  customerId,
  detail,
  onCopyCustomerData,
  onExportHistory,
  onDeleteRequest,
  onProfileUpdated,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [localDetail, setLocalDetail] = useState<CustomerDetail | null>(detail);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setLocalDetail(detail), [detail]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const runAction = useCallback(
    async (action: CustomerCrmAction, optimistic?: Partial<CustomerDetail>) => {
      setBusy(true);
      const prev = localDetail;
      if (optimistic && prev) {
        const next = { ...prev, ...optimistic } as CustomerDetail;
        setLocalDetail(next);
        onProfileUpdated?.(next);
      }
      try {
        const fresh = await postCustomerCrmAction(customerId, DAMAGE_TENANT_ID, action);
        setLocalDetail(fresh);
        onProfileUpdated?.(fresh);
        setToast("Zapisano zmiany profilu klienta.");
      } catch {
        setLocalDetail(prev);
        if (prev) onProfileUpdated?.(prev);
        setToast("Nie udało się zapisać zmiany.");
      } finally {
        setBusy(false);
        setMoreOpen(false);
      }
    },
    [customerId, localDetail, onProfileUpdated],
  );

  const copyCustomerData = useCallback(() => {
    if (onCopyCustomerData) {
      onCopyCustomerData();
      return;
    }
    const d = localDetail;
    if (!d) return;
    const addr = d.addresses?.find((a) => a.is_default) ?? d.addresses?.[0];
    const lines = [
      getCustomerDisplayName(d),
      d.company_name ? `Firma: ${d.company_name}` : "",
      d.nip ? `NIP: ${d.nip}` : "",
      d.email ? `E-mail: ${d.email}` : "",
      d.phone ? `Tel: ${d.phone}` : "",
      addr
        ? `Adres: ${[addr.street, addr.house_number, addr.apartment_number ? `/${addr.apartment_number}` : ""].filter(Boolean).join(" ")}, ${addr.postal_code ?? ""} ${addr.city ?? ""}`.trim()
        : "",
    ].filter(Boolean);
    void navigator.clipboard.writeText(lines.join("\n"));
    setToast("Skopiowano dane klienta.");
    setMoreOpen(false);
  }, [localDetail, onCopyCustomerData]);

  const flags = localDetail?.flags ?? {};
  const blocked = customerIsBlocked(localDetail?.customer_status);

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className={ghostBtn}
          disabled={busy}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
          Więcej
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        </button>
        {moreOpen ? (
          <div
            className="absolute right-0 top-full z-30 mt-1 min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            role="menu"
          >
            <button type="button" role="menuitem" className="menu-item" onClick={copyCustomerData}>
              Kopiuj dane klienta
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                onExportHistory?.();
                setMoreOpen(false);
              }}
            >
              Eksport historii zakupów
            </button>
            <div className="my-1 border-t border-slate-100" />
            {flags.vip ? (
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                disabled={busy}
                onClick={() => void runAction("unmark_vip", { flags: { ...flags, vip: false } })}
              >
                Usuń VIP
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                disabled={busy}
                onClick={() => void runAction("mark_vip", { flags: { ...flags, vip: true } })}
              >
                Oznacz VIP
              </button>
            )}
            {blocked ? (
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                disabled={busy}
                onClick={() => void runAction("unblock", { customer_status: "active" })}
              >
                Odblokuj klienta
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="menu-item text-red-700 hover:bg-red-50"
                disabled={busy}
                onClick={() => void runAction("block", { customer_status: "blocked" })}
              >
                Zablokuj klienta
              </button>
            )}
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              role="menuitem"
              className="menu-item text-red-700 hover:bg-red-50"
              onClick={() => {
                onDeleteRequest?.();
                setMoreOpen(false);
              }}
            >
              Usuń klienta
            </button>
          </div>
        ) : null}
      </div>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg">
          {toast}
        </div>
      ) : null}

      <style>{`
        .menu-item {
          display: block;
          width: 100%;
          padding: 0.5rem 0.75rem;
          text-align: left;
          font-size: 0.8125rem;
          font-weight: 500;
          color: rgb(30 41 59);
        }
        .menu-item:hover:not(:disabled) {
          background: rgb(248 250 252);
        }
      `}</style>
    </>
  );
}
