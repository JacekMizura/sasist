import { useState } from "react";
import { Unlock } from "lucide-react";
import toast from "react-hot-toast";

import api from "../../api/axios";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import { useAuth } from "../../context/AuthContext";
import { isSuperRole } from "../../auth/isSuperRole";

export const ADMIN_RELEASE_CART_PERMISSION = "warehouse.carts.admin_release";
const ADMIN_RELEASE_ALT_PERMISSION = "warehouse.picking.override";

export function canAdminReleaseCart(opts: {
  status?: string | null;
  assignedUserId?: number | null;
  ordersCount?: number;
  hasActiveSession?: boolean;
}): boolean {
  const st = String(opts.status || "").toUpperCase();
  if (st && st !== "AVAILABLE") return true;
  if (opts.assignedUserId != null && Number(opts.assignedUserId) > 0) return true;
  if ((opts.ordersCount ?? 0) > 0) return true;
  if (opts.hasActiveSession) return true;
  return false;
}

/** Empty READY/PACKING cart — CASE C: heal/release, not cancel picking. */
export function isEmptyOrphanPackingCart(opts: {
  status?: string | null;
  ordersCount?: number;
}): boolean {
  const st = String(opts.status || "").toUpperCase();
  return (
    (st === "PACKING" || st === "READY_FOR_PACKING") && (opts.ordersCount ?? 0) === 0
  );
}

type AdminReleaseCartButtonProps = {
  cartId: number;
  status?: string | null;
  assignedUserId?: number | null;
  ordersCount?: number;
  hasActiveSession?: boolean;
  onSuccess?: () => void;
  className?: string;
};

/**
 * Panel OMS — awaryjne zwolnienie wózka (nie terminal WMS).
 * Pusty PACKING/READY → backend release_empty_orphan_cart (bez cofania spakowanych zamówień).
 */
export function AdminReleaseCartButton({
  cartId,
  status,
  assignedUserId,
  ordersCount = 0,
  hasActiveSession = false,
  onSuccess,
  className = "",
}: AdminReleaseCartButtonProps) {
  const { user, hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  const allowed =
    isSuperRole(user?.role ?? "") ||
    hasPermission(ADMIN_RELEASE_CART_PERMISSION) ||
    hasPermission(ADMIN_RELEASE_ALT_PERMISSION);

  const visible = canAdminReleaseCart({
    status,
    assignedUserId,
    ordersCount,
    hasActiveSession,
  });

  const emptyOrphan = isEmptyOrphanPackingCart({ status, ordersCount });

  if (!allowed || !visible) return null;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setAck(false);
  };

  const submit = async () => {
    if (!ack || busy) return;
    setBusy(true);
    try {
      await api.post(`carts/${cartId}/admin-release`, { acknowledge: true });
      toast.success("Wózek został zwolniony.");
      setOpen(false);
      setAck(false);
      onSuccess?.();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się zwolnić wózka."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        }
      >
        <Unlock className="h-3.5 w-3.5" aria-hidden />
        Zwolnij wózek
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4"
          onClick={close}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-release-cart-title"
          >
            <h3 id="admin-release-cart-title" className="text-lg font-bold text-slate-900">
              Zwolnić wózek?
            </h3>
            {emptyOrphan ? (
              <>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Wózek nie ma przypisanych zamówień ani zajętych koszyków — wygląda na zablokowany
                  status po pakowaniu. Operacja tylko znormalizuje lifecycle do DOSTĘPNY.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Nie cofnie spakowanych zamówień ani nie anuluje kompletacji.
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Ta operacja odłączy operatora, zakończy aktywną sesję oraz odłączy wszystkie przypisane
                  zamówienia.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Jeżeli wózek zawiera już potwierdzone produkty, operacja może wymagać anulowania
                  kompletacji.
                </p>
              </>
            )}

            <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                disabled={busy}
              />
              <span>Rozumiem konsekwencje tej operacji.</span>
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!ack || busy}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Zwalnianie…" : "Zwolnij wózek"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
