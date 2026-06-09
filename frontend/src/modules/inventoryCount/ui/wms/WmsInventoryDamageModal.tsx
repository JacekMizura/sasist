import { useCallback, useState } from "react";
import { AlertTriangle, Camera, X } from "lucide-react";

import { createDamageEntry } from "@/api/damageReportsApi";
import { uploadDamageImageFile } from "@/api/damageUploadApi";
import { useAuth } from "@/context/AuthContext";
import { DAMAGE_TENANT_ID } from "@/pages/damage/damageShared";
import type { DamageType } from "@/types/damageReport";
import { WMS_INV } from "./theme";

const DAMAGE_TYPES: { id: DamageType; label: string }[] = [
  { id: "mechanical", label: "Uszkodzenie mechaniczne" },
  { id: "missing_parts", label: "Brak części" },
  { id: "flood", label: "Zalanie / wilgoć" },
  { id: "other", label: "Inne" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  warehouseId: number;
  productId: number;
  productName: string;
  maxQty: number;
  onSaved: (note: string | null) => void;
};

export default function WmsInventoryDamageModal({
  open,
  onClose,
  tenantId,
  warehouseId,
  productId,
  productName,
  maxQty,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const cap = Math.max(1, Math.floor(maxQty) || 1);
  const [qty, setQty] = useState(1);
  const [damageType, setDamageType] = useState<DamageType>("mechanical");
  const [note, setNote] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createdBy =
    user != null
      ? [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.login
      : undefined;

  const onPickPhoto = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const url = await uploadDamageImageFile(file);
        setPhotoUrls((prev) => [...prev, url]);
      } catch {
        setErr("Nie udało się wgrać zdjęcia");
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }, []);

  if (!open) return null;

  const submit = async () => {
    const q = Math.min(cap, Math.max(1, Math.floor(qty) || 1));
    setBusy(true);
    setErr(null);
    try {
      await createDamageEntry({
        tenant_id: tenantId || DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
        product_id: productId,
        quantity: q,
        damage_type: damageType,
        photo_urls: photoUrls.length ? photoUrls : undefined,
        created_by: createdBy,
      });
      const trimmedNote = note.trim() || null;
      onSaved(trimmedNote ? `${damageType}: ${trimmedNote}` : damageType);
      onClose();
    } catch {
      setErr("Nie udało się zapisać zgłoszenia wady");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10070] flex items-center justify-center bg-slate-900/50 p-4">
      <div className={`w-full max-w-md ${WMS_INV.card} shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Zgłoś wadę</h2>
            <p className="text-xs text-slate-500">{productName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-50" aria-label="Zamknij">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <label className="block">
            <span className="text-xs font-bold uppercase text-slate-500">Ilość uszkodzona</span>
            <input
              type="number"
              min={1}
              max={cap}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className={`${WMS_INV.input} mt-1`}
            />
          </label>

          <div>
            <span className="text-xs font-bold uppercase text-slate-500">Typ wady</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {DAMAGE_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDamageType(t.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold ${
                    damageType === t.id ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-bold uppercase text-slate-500">Notatka operatora</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className={`${WMS_INV.input} mt-1 resize-none`}
              placeholder="Opis uszkodzenia…"
            />
          </label>

          <button
            type="button"
            onClick={() => void onPickPhoto()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-3 text-xs font-bold uppercase tracking-widest text-slate-600"
          >
            <Camera className="h-4 w-4" />
            {uploading ? "Wgrywanie…" : "Dodaj zdjęcie"}
          </button>

          {err ? (
            <p className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {err}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-slate-100 p-5">
          <button type="button" className={`${WMS_INV.btnGhost} flex-1`} onClick={onClose}>
            Anuluj
          </button>
          <button type="button" className={`${WMS_INV.btnAccent} flex-1`} disabled={busy} onClick={() => void submit()}>
            {busy ? "Zapis…" : "Oznacz uszkodzone"}
          </button>
        </div>
      </div>
    </div>
  );
}
