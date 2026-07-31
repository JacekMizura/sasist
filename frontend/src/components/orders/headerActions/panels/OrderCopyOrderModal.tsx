import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { OrderHeaderModalFrame } from "../OrderHeaderModalFrame";

export type OrderCopyOptions = {
  products: boolean;
  discounts: boolean;
  customer: boolean;
  address: boolean;
  notes: boolean;
  documents: boolean;
};

const DEFAULT_OPTS: OrderCopyOptions = {
  products: false,
  discounts: false,
  customer: false,
  address: false,
  notes: true,
  documents: true,
};

type Props = {
  open: boolean;
  onClose: () => void;
  orderId: number;
  orderNumber: string | null;
  /** Hook for future API — until then shows toast with selected options. */
  onSubmitCopy?: (orderId: number, options: OrderCopyOptions) => Promise<void> | void;
};

const CHECKS: { key: keyof OrderCopyOptions; label: string }[] = [
  { key: "products", label: "kopiuj produkty" },
  { key: "discounts", label: "kopiuj rabaty" },
  { key: "customer", label: "kopiuj dane klienta" },
  { key: "address", label: "kopiuj adres" },
  { key: "notes", label: "kopiuj uwagi" },
  { key: "documents", label: "kopiuj dokumenty" },
];

export function OrderCopyOrderModal({ open, onClose, orderId, orderNumber, onSubmitCopy }: Props) {
  const [opts, setOpts] = useState<OrderCopyOptions>(DEFAULT_OPTS);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setOpts(DEFAULT_OPTS);
  }, [open]);

  const toggle = (key: keyof OrderCopyOptions) => {
    setOpts((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const submit = async () => {
    setPending(true);
    try {
      if (onSubmitCopy) {
        await onSubmitCopy(orderId, opts);
      } else {
        toast(
          `Kopia zamówienia ${orderNumber ?? orderId} — API w przygotowaniu. Wybrane: ${CHECKS.filter((c) => opts[c.key])
            .map((c) => c.label)
            .join(", ") || "brak"}.`,
          { duration: 4500 },
        );
      }
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <OrderHeaderModalFrame
      open={open}
      onClose={onClose}
      title="Utwórz kopię zamówienia"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void submit()}
            className="rounded-lg border border-slate-800 bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
          >
            Utwórz kopię
          </button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Wybierz, które dane mają trafić do nowego zamówienia.
      </p>
      <ul className="space-y-2">
        {CHECKS.map((c) => (
          <li key={c.key}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={opts[c.key]}
                onChange={() => toggle(c.key)}
                className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-300"
              />
              <span className="text-sm font-medium text-slate-800">{c.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </OrderHeaderModalFrame>
  );
}
