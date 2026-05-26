import { useEffect, useState } from "react";
import { patchOrder } from "../../api/ordersApi";

const inp =
  "mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30";

export type EditBuyerModalProps = {
  open: boolean;
  onClose: () => void;
  orderId: number;
  initialFirstName: string;
  initialLastName: string;
  initialPhone: string;
  initialEmail: string;
  canSave: boolean;
  onSaved: () => void;
};

export function EditBuyerModal({
  open,
  onClose,
  orderId,
  initialFirstName,
  initialLastName,
  initialPhone,
  initialEmail,
  canSave,
  onSaved,
}: EditBuyerModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFirstName(initialFirstName);
    setLastName(initialLastName);
    setPhone(initialPhone);
    setEmail(initialEmail);
    setSaving(false);
  }, [open, initialFirstName, initialLastName, initialPhone, initialEmail]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-buyer-title"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-buyer-title" className="text-base font-semibold text-slate-900">
          Edycja danych kupującego
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-slate-600 sm:col-span-2">
            Imię
            <input
              className={inp}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600 sm:col-span-2">
            Nazwisko
            <input
              className={inp}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Telefon
            <input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600 sm:col-span-2">
            E-mail
            <input
              type="email"
              className={inp}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            disabled={saving}
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={saving || !canSave}
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              if (!canSave) return;
              setSaving(true);
              void patchOrder(orderId, {
                first_name: firstName.trim() || null,
                last_name: lastName.trim() || null,
                phone: phone.trim() || null,
                email: email.trim() || null,
              })
                .then(() => {
                  onSaved();
                  onClose();
                })
                .finally(() => setSaving(false));
            }}
          >
            {saving ? "…" : "Zapisz"}
          </button>
        </div>
      </div>
    </div>
  );
}
