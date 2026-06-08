import { useState } from "react";
import { AlertCircle, X } from "lucide-react";

import { createWmsUnknownProduct } from "@/api/inventoryCountApi";
import { WMS_INV } from "./theme";

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  warehouseId: number;
  documentId: number;
  taskId: number;
  locationId: number;
  locationCode: string;
  sessionId?: number | null;
  initialBarcode?: string;
  onCreated?: () => void;
};

export default function WmsInventoryUnknownProductModal({
  open,
  onClose,
  tenantId,
  warehouseId,
  documentId,
  taskId,
  locationId,
  locationCode,
  sessionId,
  initialBarcode,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [ean, setEan] = useState(initialBarcode ?? "");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Podaj tymczasową nazwę produktu.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await createWmsUnknownProduct(
        tenantId,
        warehouseId,
        {
          document_id: documentId,
          task_id: taskId,
          location_id: locationId,
          temporary_name: trimmed,
          quantity: Number(qty) || 1,
          barcode_value: ean.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        sessionId ?? undefined,
      );
      onCreated?.();
      onClose();
      setName("");
      setNotes("");
    } catch {
      setErr("Nie udało się zapisać nieznanego produktu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e3a5f]/40 p-4">
      <div className={`w-full max-w-md rounded-xl border-2 ${WMS_INV.borderStrong} ${WMS_INV.surface} shadow-2xl`}>
        <div className={`flex items-center justify-between border-b ${WMS_INV.border} px-4 py-3`}>
          <div>
            <h2 className="text-lg font-black text-[#1a2b3c]">Produkt spoza systemu</h2>
            <p className="text-xs font-semibold text-[#5a6b7d]">Lokalizacja: {locationCode}</p>
          </div>
          <button type="button" onClick={onClose} className={WMS_INV.btnGhost} aria-label="Zamknij">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <label className="block">
            <span className="text-xs font-black uppercase text-[#5a6b7d]">Tymczasowa nazwa *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${WMS_INV.input} mt-1`} />
          </label>
          <label className="block">
            <span className="text-xs font-black uppercase text-[#5a6b7d]">EAN / kod (opcj.)</span>
            <input value={ean} onChange={(e) => setEan(e.target.value)} className={`${WMS_INV.input} mt-1`} />
          </label>
          <label className="block">
            <span className="text-xs font-black uppercase text-[#5a6b7d]">Ilość</span>
            <input
              type="number"
              min={0.01}
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={`${WMS_INV.input} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-black uppercase text-[#5a6b7d]">Notatka</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${WMS_INV.input} mt-1 resize-none`} />
          </label>
          {err ? (
            <p className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${WMS_INV.critical}`}>
              <AlertCircle className="h-4 w-4 shrink-0" />
              {err}
            </p>
          ) : null}
        </div>
        <div className={`flex gap-2 border-t ${WMS_INV.border} p-4`}>
          <button type="button" className={`${WMS_INV.btnGhost} flex-1`} onClick={onClose}>
            Anuluj
          </button>
          <button type="button" className={`${WMS_INV.btnAccent} flex-1`} disabled={saving} onClick={() => void submit()}>
            {saving ? "Zapis…" : "Zapisz szkic"}
          </button>
        </div>
      </div>
    </div>
  );
}
