import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";

import {
  computeCapacityDm3,
  type SegmentDimensionDefaults,
} from "./rackLayoutUtils";
import type { SegmentModalData, SegmentSavePayload, SegmentSaveResult } from "./consolidationRackTypes";

const MAX_DIMENSION_MM = 10_000;

type Props = {
  segment: SegmentModalData | null;
  rackDefaults?: SegmentDimensionDefaults;
  onClose: () => void;
  onSave?: (segmentId: number, payload: SegmentSavePayload) => Promise<SegmentSaveResult | void>;
  onDraftSave?: (payload: SegmentSavePayload) => void | Promise<void>;
  onDraftRestore?: () => void | Promise<void>;
  onRestoreDefaults?: (segmentId: number) => Promise<void>;
};

function defaultSlotLabel(segment: SegmentModalData): string {
  return (segment.effectiveSlotLabel ?? segment.slotLabel ?? "").trim();
}

function previewScanLabel(rackName: string | undefined, slotName: string): string {
  const slot = slotName.trim();
  if (!slot) return "—";
  if (rackName?.trim()) return `${rackName.trim()}/${slot}`;
  return slot;
}

function parseDimensionInput(raw: string): { value: number | null; error: string | null } {
  const t = raw.trim();
  if (!t) return { value: null, error: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) {
    return { value: null, error: "Wymiar musi być liczbą większą od 0." };
  }
  if (n > MAX_DIMENSION_MM) {
    return { value: null, error: `Maksymalnie ${MAX_DIMENSION_MM} mm.` };
  }
  return { value: n, error: null };
}

export default function ConsolidationRackSegmentModal({
  segment,
  rackDefaults,
  onClose,
  onSave,
  onDraftSave,
  onDraftRestore,
  onRestoreDefaults,
}: Props) {
  const [slotLabel, setSlotLabel] = useState("");
  const [lengthMm, setLengthMm] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const canEdit = Boolean(
    segment?.readOnly !== true && ((segment?.segmentId && onSave) || onDraftSave),
  );

  useEffect(() => {
    if (!segment) return;
    const custom = (segment.slotLabelCustom ?? "").trim();
    setSlotLabel(custom || defaultSlotLabel(segment));
    setLengthMm(segment.lengthMm != null ? String(segment.lengthMm) : "");
    setWidthMm(segment.widthMm != null ? String(segment.widthMm) : "");
    setHeightMm(segment.heightMm != null ? String(segment.heightMm) : "");
    setError(null);
    setFieldErrors({});
  }, [segment]);

  const previewSlot =
    slotLabel.trim() ||
    defaultSlotLabel(segment ?? { shelfLabel: "", slotLabel: "", columnName: null, rowNumber: 0, statusLabel: "", orderId: null, orderNumber: null });
  const scanLabel = previewScanLabel(segment?.rackName, previewSlot);

  const previewCapacity = useMemo(() => {
    const l = lengthMm.trim() ? Number(lengthMm) : null;
    const w = widthMm.trim() ? Number(widthMm) : null;
    const h = heightMm.trim() ? Number(heightMm) : null;
    return computeCapacityDm3(l, w, h);
  }, [lengthMm, widthMm, heightMm]);

  if (!segment) return null;

  const validateForm = (): boolean => {
    const next: Record<string, string> = {};
    for (const [key, raw] of [
      ["length_mm", lengthMm],
      ["width_mm", widthMm],
      ["height_mm", heightMm],
    ] as const) {
      const parsed = parseDimensionInput(raw);
      if (parsed.error) next[key] = parsed.error;
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = (): SegmentSavePayload => {
    const l = parseDimensionInput(lengthMm);
    const w = parseDimensionInput(widthMm);
    const h = parseDimensionInput(heightMm);
    const custom = slotLabel.trim();
    const defaultLabel = defaultSlotLabel(segment);
    return {
      slot_label: !custom || custom === defaultLabel ? null : custom,
      length_mm: l.value,
      width_mm: w.value,
      height_mm: h.value,
    };
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (onDraftSave) {
        await onDraftSave(payload);
        onClose();
        return;
      }
      if (!segment.segmentId || !onSave) return;
      await onSave(segment.segmentId, payload);
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

  const handleRestore = async () => {
    setSaving(true);
    setError(null);
    try {
      if (onDraftRestore) {
        await onDraftRestore();
        onClose();
        return;
      }
      if (segment.segmentId && onRestoreDefaults) {
        await onRestoreDefaults(segment.segmentId);
        onClose();
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? String((err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Błąd przywracania.")
          : "Błąd przywracania.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const showOccupancy =
    segment.orderId != null &&
    (segment.orderVolumeDm3 != null ||
      segment.utilizationPercent != null ||
      segment.capacityOverflow ||
      segment.dimensionEstimated);

  const defaultDimsText =
    rackDefaults?.length_mm && rackDefaults.width_mm && rackDefaults.height_mm
      ? `${rackDefaults.length_mm} × ${rackDefaults.width_mm} × ${rackDefaults.height_mm} mm`
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="segment-modal-title"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 id="segment-modal-title" className="text-sm font-bold uppercase tracking-wide text-slate-700">
              {canEdit ? "Segment" : "Podgląd segmentu"}
            </h2>
            <p className="mt-0.5 font-mono text-lg font-bold text-violet-900">{segment.slotLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200" aria-label="Zamknij">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {segment.readOnly ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              Tryb podglądu — bez edycji konfiguracji.
            </p>
          ) : onDraftSave ? (
            <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
              Opcjonalne nadpisanie profilu regału. Domyślnie segment dziedziczy wymiary regału.
            </p>
          ) : segment.orderId != null ? (
            <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
              Segment zajęty — możesz zmienić nazwę i wymiary, ale nie przypisanie zamówienia.
            </p>
          ) : segment.isOverridden ? (
            <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
              Segment ma własny profil wymiarowy (advanced).
            </p>
          ) : defaultDimsText ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Dziedziczy profil regału: {defaultDimsText}
            </p>
          ) : null}

          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-medium uppercase text-slate-500">Etykieta skanowania</div>
            <div className="mt-0.5 font-mono text-base font-bold text-violet-900">{scanLabel}</div>
          </div>

          {canEdit ? (
            <>
              <label className="block text-sm">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Nazwa segmentu</span>
                <input
                  type="text"
                  value={slotLabel}
                  onChange={(e) => setSlotLabel(e.target.value)}
                  placeholder="np. A1, TV-01"
                  maxLength={64}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm shadow-sm"
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  Domyślnie: {defaultSlotLabel(segment)}. Puste = automatyczna nazwa z układu.
                </span>
              </label>

              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-600">Wymiary (mm)</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(
                    [
                      ["length_mm", "Długość", lengthMm, setLengthMm],
                      ["width_mm", "Szerokość", widthMm, setWidthMm],
                      ["height_mm", "Wysokość", heightMm, setHeightMm],
                    ] as const
                  ).map(([key, label, val, setter]) => (
                    <label key={key} className="block text-sm">
                      <span className="text-[10px] font-medium text-slate-600">{label}</span>
                      <input
                        type="number"
                        min={0}
                        max={MAX_DIMENSION_MM}
                        value={val}
                        onChange={(e) => {
                          setter(e.target.value);
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next[key];
                            return next;
                          });
                        }}
                        className={`mt-0.5 w-full rounded-lg border bg-white px-2 py-1.5 text-sm tabular-nums ${fieldErrors[key] ? "border-red-400" : "border-slate-200"}`}
                      />
                      {fieldErrors[key] ? (
                        <span className="mt-0.5 block text-[10px] text-red-600">{fieldErrors[key]}</span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Pojemność</div>
                <div className="mt-1 font-mono text-xl font-bold tabular-nums text-violet-900">
                  {previewCapacity != null ? `${previewCapacity.toFixed(0)} dm³` : "—"}
                </div>
              </div>

              {(onDraftRestore || onRestoreDefaults) ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleRestore()}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Przywróć ustawienia domyślne
                </button>
              ) : null}

              {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
            </>
          ) : (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase text-slate-500">Nazwa</dt>
                <dd className="font-mono font-semibold">{segment.slotLabel}</dd>
              </div>
              {(segment.lengthMm ?? segment.widthMm ?? segment.heightMm) != null ? (
                <div>
                  <dt className="text-xs font-bold uppercase text-slate-500">Wymiary</dt>
                  <dd className="font-mono tabular-nums">
                    {segment.lengthMm ?? "—"} × {segment.widthMm ?? "—"} × {segment.heightMm ?? "—"} mm
                  </dd>
                </div>
              ) : null}
              {segment.capacityDm3 != null ? (
                <div>
                  <dt className="text-xs font-bold uppercase text-slate-500">Pojemność</dt>
                  <dd className="font-mono font-semibold">{segment.capacityDm3.toFixed(0)} dm³</dd>
                </div>
              ) : null}
            </dl>
          )}

          {showOccupancy ? (
            <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Wykorzystanie (P5.8C)</h3>
              <dl className="space-y-1.5">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-600">Objętość zamówienia</dt>
                  <dd className="font-mono font-semibold tabular-nums">
                    {segment.orderVolumeDm3 != null ? `${segment.orderVolumeDm3.toFixed(1)} dm³` : "—"}
                  </dd>
                </div>
                {segment.utilizationPercent != null ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-600">Wykorzystanie</dt>
                    <dd className="font-mono font-semibold tabular-nums">{segment.utilizationPercent.toFixed(0)}%</dd>
                  </div>
                ) : null}
              </dl>
              {segment.capacityOverflow ? (
                <p className="text-xs font-medium text-red-700">Objętość przekracza pojemność półki</p>
              ) : null}
            </section>
          ) : null}

          <dl className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Status</dt>
              <dd className="font-semibold">{segment.statusLabel}</dd>
            </div>
            {segment.orderId != null ? (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Zamówienie</dt>
                <dd className="font-semibold">{segment.orderNumber ?? `#${segment.orderId}`}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {canEdit ? (
          <div className="flex shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Zapisz
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Anuluj
            </button>
          </div>
        ) : (
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Zamknij
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
