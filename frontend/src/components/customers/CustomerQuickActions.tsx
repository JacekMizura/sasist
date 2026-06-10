import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Mail,
  MoreHorizontal,
  PackagePlus,
  RotateCcw,
  ShoppingBag,
} from "lucide-react";

import type { CustomerDetail } from "../../api/customersApi";
import NewComplaintWizard from "../../pages/Complaints/NewComplaintWizard";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";
import { safeTrim } from "../../utils/safeStrings";

type Props = {
  customerId: number;
  detail: CustomerDetail | null;
  onCopyCustomerData?: () => void;
  onExportHistory?: () => void;
  onDeleteRequest?: () => void;
};

const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50";

const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50";

export function CustomerQuickActions({
  customerId,
  detail,
  onCopyCustomerData,
  onExportHistory,
  onDeleteRequest,
}: Props) {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [moreOpen, setMoreOpen] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const email = detail?.email ?? null;
  const mailHref = email?.trim() ? `mailto:${email.trim()}` : undefined;

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen]);

  const startDirectSale = useCallback(() => {
    if (warehouseId == null) return;
    navigate("/wms/direct-sales", {
      state: { prefillCustomerId: customerId, prefillDocumentSubtype: "INVOICE" as const },
    });
  }, [customerId, navigate, warehouseId]);

  const copyCustomerData = useCallback(() => {
    if (onCopyCustomerData) {
      onCopyCustomerData();
      return;
    }
    if (!detail) return;
    const addr = detail.addresses?.find((a) => a.is_default) ?? detail.addresses?.[0];
    const lines = [
      getCustomerDisplayName(detail),
      detail.company_name ? `Firma: ${detail.company_name}` : "",
      detail.nip ? `NIP: ${detail.nip}` : "",
      detail.email ? `E-mail: ${detail.email}` : "",
      detail.phone ? `Tel: ${detail.phone}` : "",
      addr
        ? `Adres: ${[addr.street, addr.house_number, addr.apartment_number ? `/${addr.apartment_number}` : ""].filter(Boolean).join(" ")}, ${addr.postal_code ?? ""} ${addr.city ?? ""}`.trim()
        : "",
    ].filter(Boolean);
    void navigator.clipboard.writeText(lines.join("\n"));
  }, [detail, onCopyCustomerData]);

  const customerName = detail
    ? getCustomerDisplayName(detail)
    : getCustomerDisplayName({ id: customerId });

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          className={primaryBtn}
          disabled={warehouseId == null}
          title={warehouseId == null ? "Wybierz magazyn" : undefined}
          onClick={startDirectSale}
        >
          <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
          Nowe zamówienie
        </button>
        <button
          type="button"
          className={ghostBtn}
          disabled={warehouseId == null}
          onClick={() => setComplaintOpen(true)}
        >
          <PackagePlus className="h-3.5 w-3.5" aria-hidden />
          Reklamacja
        </button>
        <button
          type="button"
          className={ghostBtn}
          onClick={() =>
            navigate("/orders/returns", { state: { prefillCustomerId: customerId, prefillCustomerName: customerName } })
          }
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Zwrot
        </button>
        {mailHref ? (
          <a href={mailHref} className={ghostBtn}>
            <Mail className="h-3.5 w-3.5" aria-hidden />
            E-mail
          </a>
        ) : (
          <span className={`${ghostBtn} opacity-40 cursor-not-allowed`} title="Brak adresu e-mail">
            <Mail className="h-3.5 w-3.5" aria-hidden />
            E-mail
          </span>
        )}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className={ghostBtn}
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
              <button type="button" role="menuitem" className="menu-item" onClick={() => { copyCustomerData(); setMoreOpen(false); }}>
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
              <button type="button" role="menuitem" className="menu-item opacity-50 cursor-not-allowed" disabled title="Wkrótce">
                Oznacz VIP
              </button>
              <button type="button" role="menuitem" className="menu-item opacity-50 cursor-not-allowed" disabled title="Wkrótce">
                Zablokuj klienta
              </button>
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
      </div>

      {warehouseId != null ? (
        <NewComplaintWizard
          open={complaintOpen}
          onClose={() => setComplaintOpen(false)}
          warehouseId={warehouseId}
          tenantId={DAMAGE_TENANT_ID}
          initialCustomerName={customerName}
          initialCustomerEmail={safeTrim(detail?.email) || undefined}
          initialCustomerPhone={safeTrim(detail?.phone) || undefined}
          onCreated={(cid) => {
            setComplaintOpen(false);
            navigate(`/complaints/${cid}`);
          }}
        />
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
