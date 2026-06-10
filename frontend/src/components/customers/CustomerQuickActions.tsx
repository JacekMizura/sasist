import { Link } from "react-router-dom";
import {
  ClipboardCopy,
  History,
  Mail,
  PackagePlus,
  RotateCcw,
  ShoppingCart,
} from "lucide-react";

type Props = {
  customerId: number;
  email?: string | null;
  onCopyInvoice?: () => void;
};

export function CustomerQuickActions({ customerId, email, onCopyInvoice }: Props) {
  const mailHref = email?.trim() ? `mailto:${email.trim()}` : undefined;

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50";

  return (
    <div className="flex flex-wrap gap-2">
      <Link to={`/orders/new?customer_id=${customerId}`} className={btn}>
        <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
        Nowe zamówienie
      </Link>
      <Link to={`/customers/${customerId}/historia-zakupow`} className={btn}>
        <History className="h-3.5 w-3.5" aria-hidden />
        Historia zakupów
      </Link>
      <Link to={`/complaints?customer=${customerId}`} className={btn}>
        <PackagePlus className="h-3.5 w-3.5" aria-hidden />
        Reklamacja
      </Link>
      <Link to={`/wms/returns?customer=${customerId}`} className={btn}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Zwrot
      </Link>
      {onCopyInvoice ? (
        <button type="button" onClick={onCopyInvoice} className={btn}>
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
          Kopiuj dane FV
        </button>
      ) : null}
      {mailHref ? (
        <a href={mailHref} className={btn}>
          <Mail className="h-3.5 w-3.5" aria-hidden />
          Wyślij e-mail
        </a>
      ) : null}
    </div>
  );
}
