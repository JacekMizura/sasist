import { useCallback, useState } from "react";
import { AlertTriangle, Camera, X } from "lucide-react";
import { createDamageEntry } from "../../../api/damageReportsApi";
import { postWmsReceivingPzItemMarkDamaged } from "../../../api/wmsReceivingApi";
import { uploadDamageImageFile } from "../../../api/damageUploadApi";
import { useAuth } from "../../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import type { DamageType } from "../../../types/damageReport";
import type { StockDocumentItemRead } from "../../../api/stockDocumentsApi";

const DAMAGE_TYPES: { id: DamageType; label: string }[] = [
  { id: "mechanical", label: "Uszkodzenie mechaniczne" },
  { id: "missing_parts", label: "Brak części" },
  { id: "flood", label: "Zalanie / wilgoć" },
  { id: "other", label: "Inne" },
];

type Props = {
  tenantId: number;
  pzId: number;
  line: StockDocumentItemRead;
  warehouseId: number;
  maxQty: number;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
};

export function ReceivingDamageModal({
  tenantId,
  pzId,
  line,
  warehouseId,
  maxQty,
  onClose,
  onSaved,
  showToast,
}: Props) {
  const { user } = useAuth();
  const productId = Number(line.product_id);
  const cap = Math.max(0, Math.floor(maxQty) || 0);

  const [qty, setQty] = useState(() => Math.min(1, Math.max(0, Math.floor(maxQty) || 0)));
  const [damageType, setDamageType] = useState<DamageType>("mechanical");
  const [note, setNote] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

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
        showToast("Nie udało się wgrać zdjęcia");
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }, [showToast]);

  const submit = async () => {
    if (!Number.isFinite(productId) || productId <= 0) {
      showToast("Brak produktu na pozycji");
      return;
    }
    if (cap < 1) {
      showToast("Brak ilości na DOCK-IN do oznaczenia jako wada");
      return;
    }
    const q = Math.min(cap, Math.max(1, Math.floor(qty) || 1));
    setBusy(true);
    try {
      await postWmsReceivingPzItemMarkDamaged(tenantId, pzId, line.id, {
        quantity: q,
        damage_type: damageType,
        description: note.trim() || undefined,
        photo_urls: photoUrls.length ? photoUrls : undefined,
      });
      if (photoUrls.length > 0) {
        try {
          await createDamageEntry({
            tenant_id: DAMAGE_TENANT_ID,
            warehouse_id: warehouseId,
            product_id: productId,
            quantity: q,
            damage_type: damageType,
            photo_urls: photoUrls,
            created_by: createdBy,
          });
        } catch {
          /* evidence optional — stock bucket already created */
        }
      }
      showToast(`Wada · ${q} szt. (REJECTED_STOCK)`);
      onSaved();
      onClose();
    } catch (e) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "")
          : "";
      showToast(msg.trim() || "Nie udało się zapisać wady");
    } finally {
      setBusy(false);
    }
  };

  const title = (line.product_name || "").trim() || `Produkt #${productId}`;

  return (
    <div
      className="fixed inset-0 z-[1750] flex flex-col bg-slate-900/70 sm:items-center sm:justify-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receiving-damage-title"
        className="flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[min(92vh,640px)] sm:max-w-md sm:rounded-2xl sm:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-3 py-3">
          <div className="flex items-start gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <AlertTriangle size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 id="receiving-damage-title" className="text-base font-black text-slate-900">
                Oznacz jako uszkodzony
              </h2>
              <p className="mt-0.5 line-clamp-2 text-xs font-medium text-slate-600">{title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
            aria-label="Zamknij"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
          <div>
            <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">
              Ilość uszkodzona
            </label>
            <input
              type="number"
              min={1}
              max={cap}
              value={qty}
              onChange={(e) => setQty(Math.min(cap, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xl font-black tabular-nums text-slate-900 outline-none ring-indigo-500 focus:ring-2"
            />
            <p className="mt-1 text-[10px] text-slate-500">Maks. {cap} szt. (z przyjętej ilości sprzedażowej)</p>
          </div>

          <div>
            <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">
              Typ uszkodzenia
            </label>
            <select
              value={damageType}
              onChange={(e) => setDamageType(e.target.value as DamageType)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none ring-indigo-500 focus:ring-2"
            >
              {DAMAGE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">
              Notatka
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Opcjonalny opis…"
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500 focus:ring-2"
            />
          </div>

          <div>
            <p className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500">
              Zdjęcie (opcjonalnie)
            </p>
            <button
              type="button"
              disabled={uploading || busy}
              onClick={() => void onPickPhoto()}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
            >
              <Camera size={16} />
              {uploading ? "Wgrywanie…" : "Dodaj zdjęcie"}
            </button>
            {photoUrls.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {photoUrls.map((url) => (
                  <li key={url} className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200">
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute right-0.5 top-0.5 rounded bg-black/50 p-0.5 text-white"
                      onClick={() => setPhotoUrls((p) => p.filter((u) => u !== url))}
                      aria-label="Usuń zdjęcie"
                    >
                      <X size={10} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            disabled={busy || uploading}
            onClick={() => void submit()}
            className="mb-1.5 w-full min-h-[48px] rounded-xl bg-rose-600 text-xs font-black uppercase text-white disabled:opacity-50"
          >
            Zatwierdź wadę
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full min-h-[40px] rounded-xl bg-slate-100 text-xs font-bold uppercase text-slate-600"
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}
