import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";

export type SegmentPanelData = {
  segmentId?: number;
  shelfLabel: string;
  slotLabel: string;
  columnName: string | null;
  rowNumber: number;
  statusLabel: string;
  orderId: number | null;
  orderNumber: string | null;
  fillPercent?: number;
  slotLabelCustom?: string | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  capacityDm3?: number | null;
  readOnly?: boolean;
};

type Props = {
  segment: SegmentPanelData | null;
  onClose: () => void;
  onSave?: (segmentId: number, payload: SegmentSavePayload) => Promise<void>;
};

export type SegmentSavePayload = {
  slot_label?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
};

function computeCapacityDm3(l: number | null | undefined, w: number | null | undefined, h: number | null | undefined) {
  if (l == null || w == null || h == null || l <= 0 || w <= 0 || h <= 0) return null;
  return Math.round((l * w * h) / 1_000_000 * 10000) / 10000;
}

export default function ConsolidationRackSegmentPanel({ segment, onClose, onSave }: Props) {
  const [slotLabel, setSlotLabel] = useState("");
  const [lengthMm, setLengthMm] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = Boolean(segment?.segmentId && onSave && segment.readOnly === false);

  useEffect(() => {
    if (!segment) return;
    setSlotLabel(segment.slotLabelCustom ?? segment.slotLabel ?? "");
    setLengthMm(segment.lengthMm != null ? String(segment.lengthMm) : "");
    setWidthMm(segment.widthMm != null ? String(segment.widthMm) : "");
    setHeightMm(segment.heightMm != null ? String(segment.heightMm) : "");
    setError(null);
  }, [segment]);

  const previewCapacity = useMemo(() => {
    const l = lengthMm.trim() ? Number(lengthMm) : null;
    const w = widthMm.trim() ? Number(widthMm) : null;
    const h = heightMm.trim() ? Number(heightMm) : null;
    return computeCapacityDm3(l, w, h);
  }, [lengthMm, widthMm, heightMm]);

  if (!segment) return null;

  const handleSave = async () => {
    if (!segment.segmentId || !onSave) return;
    setSaving(true);
    setError(null);
    try {
      const parseDim = (raw: string) => {
        const t = raw.trim();
        if (!t) return null;
        const n = Number(t);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      await onSave(segment.segmentId, {
        slot_label: slotLabel.trim() || null,
        length_mm: parseDim(lengthMm),
        width_mm: parseDim(widthMm),
        height_mm: parseDim(heightMm),
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? String((err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Błąd zapisu.")
          : "Błąd zapisu.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Półka</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          aria-label="Zamknij panel"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Etykieta skanowania</div>
          <div className="mt-1 font-mono text-2xl font-bold text-violet-900">{segment.slotLabel}</div>
          <div className="mt-0.5 font-mono text-sm text-slate-600">{segment.shelfLabel}</div>
        </div>

        {editable ? (
          <section className="space-y-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-violet-800">Konfiguracja półki</h3>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Nazwa segmentu</span>
              <input
                type="text"
                value={slotLabel}
                onChange={(e) => setSlotLabel(e.target.value)}
                placeholder="np. A1, TV-01, DUŻA-01"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                Puste pole → domyślna nazwa z układu (A1, A2…). Skan: RK-XX/nazwa
              </span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["Długość (mm)", lengthMm, setLengthMm],
                  ["Szerokość (mm)", widthMm, setWidthMm],
                  ["Wysokość (mm)", heightMm, setHeightMm],
                ] as const
              ).map(([label, val, setter]) => (
                <label key={label} className="block text-sm">
                  <span className="text-[10px] font-medium text-slate-600">{label}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
                  />
                </label>
              ))}
            </div>
            <div className="text-sm">
              <span className="text-xs font-medium text-slate-600">Pojemność (dm³)</span>
              <div className="mt-0.5 font-mono font-semibold tabular-nums">
                {previewCapacity != null ? previewCapacity.toFixed(2) : "—"}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Opcjonalne — bez wymiarów regał działa jak dotychczas.</p>
            </div>
            {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Zapisz
            </button>
          </section>
        ) : (
          <>
            {(segment.lengthMm ?? segment.widthMm ?? segment.heightMm) != null ? (
              <dl className="space-y-2 text-sm">
                <div className="text-xs font-bold uppercase text-slate-500">Wymiary (mm)</div>
                <dd className="font-mono tabular-nums">
                  {segment.lengthMm ?? "—"} × {segment.widthMm ?? "—"} × {segment.heightMm ?? "—"}
                </dd>
                {segment.capacityDm3 != null ? (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Pojemność</dt>
                    <dd className="font-mono font-semibold">{segment.capacityDm3.toFixed(2)} dm³</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Przypisanie zamówienia odbywa się w procesie konsolidacji — tutaj podgląd układu i statusu.
            </p>
          </>
        )}

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Kolumna</dt>
            <dd className="mt-0.5 font-semibold">{segment.columnName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Rząd</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{segment.rowNumber}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
            <dd className="mt-0.5 font-semibold">{segment.statusLabel}</dd>
          </div>
          {segment.orderId != null ? (
            <>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Zamówienie</dt>
                <dd className="mt-0.5 font-semibold">{segment.orderNumber ?? `#${segment.orderId}`}</dd>
              </div>
              {segment.fillPercent != null ? (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Postęp odkładania</dt>
                  <dd className="mt-0.5 font-mono font-semibold tabular-nums">{segment.fillPercent.toFixed(0)}%</dd>
                </div>
              ) : null}
            </>
          ) : null}
        </dl>
      </div>
    </aside>
  );
}
