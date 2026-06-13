import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";

const MAX_DIMENSION_MM = 10_000;

export type SegmentPanelData = {
  segmentId?: number;
  rackName?: string;
  shelfLabel: string;
  slotLabel: string;
  effectiveSlotLabel?: string | null;
  columnName: string | null;
  rowNumber: number;
  statusLabel: string;
  orderId: number | null;
  orderNumber: string | null;
  fillPercent?: number;
  /** Custom slot_label from API (null = default A1, A2…) */
  slotLabelCustom?: string | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  capacityDm3?: number | null;
  orderVolumeDm3?: number | null;
  utilizationPercent?: number | null;
  capacityOverflow?: boolean;
  dimensionEstimated?: boolean;
  estimatedItemsCount?: number;
  /** true = podgląd bez edycji (dashboard); false/undefined + onSave = konfigurator */
  readOnly?: boolean;
};

export type SegmentSavePayload = {
  slot_label?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
};

export type SegmentSaveResult = {
  slot_label?: string | null;
  effective_slot_label?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  capacity_dm3?: number | null;
  order_volume_dm3?: number | null;
  utilization_percent?: number | null;
  capacity_overflow?: boolean;
  dimension_estimated?: boolean;
  estimated_items_count?: number;
};

type Props = {
  segment: SegmentPanelData | null;
  onClose: () => void;
  onSave?: (segmentId: number, payload: SegmentSavePayload) => Promise<SegmentSaveResult | void>;
};

function computeCapacityDm3(
  l: number | null | undefined,
  w: number | null | undefined,
  h: number | null | undefined,
): number | null {
  if (l == null || w == null || h == null || l <= 0 || w <= 0 || h <= 0) return null;
  return Math.round((l * w * h) / 1_000_000 * 100) / 100;
}

function defaultSlotLabel(segment: SegmentPanelData): string {
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

export default function ConsolidationRackSegmentPanel({ segment, onClose, onSave }: Props) {
  const [slotLabel, setSlotLabel] = useState("");
  const [lengthMm, setLengthMm] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const canEdit = Boolean(segment?.segmentId && onSave && segment.readOnly !== true);

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

  const previewSlot = slotLabel.trim() || defaultSlotLabel(segment ?? { shelfLabel: "", slotLabel: "", columnName: null, rowNumber: 0, statusLabel: "", orderId: null, orderNumber: null });
  const scanLabel = previewScanLabel(segment?.rackName, previewSlot);

  const previewCapacity = useMemo(() => {
    const l = lengthMm.trim() ? Number(lengthMm) : null;
    const w = widthMm.trim() ? Number(widthMm) : null;
    const h = heightMm.trim() ? Number(heightMm) : null;
    return computeCapacityDm3(l, w, h);
  }, [lengthMm, widthMm, heightMm]);

  const dimensionPreviewText = useMemo(() => {
    const parts = [lengthMm.trim(), widthMm.trim(), heightMm.trim()].filter(Boolean);
    if (parts.length !== 3) return null;
    return `${parts[0]} × ${parts[1]} × ${parts[2]} mm`;
  }, [lengthMm, widthMm, heightMm]);

  if (!segment) return null;

  const resetForm = () => {
    const custom = (segment.slotLabelCustom ?? "").trim();
    setSlotLabel(custom || defaultSlotLabel(segment));
    setLengthMm(segment.lengthMm != null ? String(segment.lengthMm) : "");
    setWidthMm(segment.widthMm != null ? String(segment.widthMm) : "");
    setHeightMm(segment.heightMm != null ? String(segment.heightMm) : "");
    setError(null);
    setFieldErrors({});
  };

  const validateForm = (): boolean => {
    const next: Record<string, string> = {};
    const l = parseDimensionInput(lengthMm);
    const w = parseDimensionInput(widthMm);
    const h = parseDimensionInput(heightMm);
    if (l.error) next.length_mm = l.error;
    if (w.error) next.width_mm = w.error;
    if (h.error) next.height_mm = h.error;
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!segment.segmentId || !onSave) return;
    if (!validateForm()) return;
    setSaving(true);
    setError(null);
    try {
      const l = parseDimensionInput(lengthMm);
      const w = parseDimensionInput(widthMm);
      const h = parseDimensionInput(heightMm);
      const custom = slotLabel.trim();
      const defaultLabel = defaultSlotLabel(segment);
      await onSave(segment.segmentId, {
        slot_label: !custom || custom === defaultLabel ? null : custom,
        length_mm: l.value,
        width_mm: w.value,
        height_mm: h.value,
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

  const showOccupancy =
    segment.orderId != null &&
    (segment.orderVolumeDm3 != null ||
      segment.utilizationPercent != null ||
      segment.capacityOverflow ||
      segment.dimensionEstimated);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-slate-900/20"
        aria-label="Zamknij panel"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Konfiguracja półki</h2>
            <p className="mt-0.5 font-mono text-lg font-bold text-violet-900">{segment.slotLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {!canEdit ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {segment.segmentId
                ? "Tryb podglądu — edycja dostępna w konfiguratorze regałów (/carts/racks)."
                : "Utwórz regał, aby skonfigurować nazwy i wymiary półek."}
            </p>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Etykieta segmentu</h3>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="text-[10px] font-medium uppercase text-slate-500">Skan (pełna etykieta)</div>
              <div className="mt-0.5 font-mono text-base font-bold text-violet-900">{scanLabel}</div>
            </div>
          </section>

          {canEdit ? (
            <section className="space-y-4 rounded-xl border border-violet-100 bg-violet-50/30 p-4">
              <label className="block text-sm">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Nazwa segmentu</span>
                <input
                  type="text"
                  value={slotLabel}
                  onChange={(e) => setSlotLabel(e.target.value)}
                  placeholder="np. A1, TV-01, AGD-01"
                  maxLength={64}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm shadow-sm"
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  Domyślnie: {defaultSlotLabel(segment)}. Puste lub domyślne → automatyczna nazwa z układu.
                </span>
              </label>

              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-600">Wymiary</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(
                    [
                      ["length_mm", "Długość (mm)", lengthMm, setLengthMm],
                      ["width_mm", "Szerokość (mm)", widthMm, setWidthMm],
                      ["height_mm", "Wysokość (mm)", heightMm, setHeightMm],
                    ] as const
                  ).map(([key, label, val, setter]) => (
                    <label key={key} className="block text-sm">
                      <span className="text-[10px] font-medium text-slate-600">{label}</span>
                      <input
                        type="number"
                        min={0}
                        max={MAX_DIMENSION_MM}
                        step={1}
                        value={val}
                        onChange={(e) => {
                          setter(e.target.value);
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next[key];
                            return next;
                          });
                        }}
                        placeholder="—"
                        className={`mt-0.5 w-full rounded-lg border bg-white px-2 py-1.5 text-sm tabular-nums shadow-sm ${fieldErrors[key] ? "border-red-400" : "border-slate-200"}`}
                      />
                      {fieldErrors[key] ? (
                        <span className="mt-0.5 block text-[10px] text-red-600">{fieldErrors[key]}</span>
                      ) : null}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">Opcjonalne. Bez wymiarów regał działa jak dotychczas.</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Pojemność</div>
                {dimensionPreviewText ? (
                  <div className="mt-0.5 text-[11px] text-slate-500">{dimensionPreviewText}</div>
                ) : null}
                <div className="mt-1 font-mono text-xl font-bold tabular-nums text-violet-900">
                  {previewCapacity != null ? `${previewCapacity.toFixed(0)} dm³` : "—"}
                </div>
              </div>

              {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Zapisz
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    resetForm();
                    onClose();
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Anuluj
                </button>
              </div>
            </section>
          ) : (
            <section className="space-y-2 text-sm">
              <div>
                <span className="text-xs font-bold uppercase text-slate-500">Nazwa segmentu</span>
                <div className="mt-0.5 font-mono font-semibold">{segment.slotLabel}</div>
              </div>
              {(segment.lengthMm ?? segment.widthMm ?? segment.heightMm) != null ? (
                <div>
                  <span className="text-xs font-bold uppercase text-slate-500">Wymiary (mm)</span>
                  <div className="mt-0.5 font-mono tabular-nums">
                    {segment.lengthMm ?? "—"} × {segment.widthMm ?? "—"} × {segment.heightMm ?? "—"}
                  </div>
                </div>
              ) : null}
              {segment.capacityDm3 != null ? (
                <div>
                  <span className="text-xs font-bold uppercase text-slate-500">Pojemność</span>
                  <div className="mt-0.5 font-mono font-semibold">{segment.capacityDm3.toFixed(0)} dm³</div>
                </div>
              ) : null}
            </section>
          )}

          {showOccupancy ? (
            <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Podgląd dopasowania</h3>
              <dl className="space-y-1.5">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-600">Pojemność półki</dt>
                  <dd className="font-mono font-semibold tabular-nums">
                    {segment.capacityDm3 != null ? `${segment.capacityDm3.toFixed(0)} dm³` : "—"}
                  </dd>
                </div>
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
              {segment.dimensionEstimated && (segment.estimatedItemsCount ?? 0) > 0 ? (
                <p className="text-xs text-amber-800">
                  Brak wymiarów dla {segment.estimatedItemsCount} produktów (wartości szacowane)
                </p>
              ) : null}
              {segment.capacityOverflow ? (
                <p className="text-xs font-medium text-red-700">Objętość przekracza pojemność półki</p>
              ) : null}
            </section>
          ) : null}

          <section className="border-t border-slate-100 pt-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Kolumna</dt>
                <dd className="font-semibold">{segment.columnName ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Rząd</dt>
                <dd className="font-semibold tabular-nums">{segment.rowNumber}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-semibold">{segment.statusLabel}</dd>
              </div>
              {segment.orderId != null ? (
                <>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Zamówienie</dt>
                    <dd className="font-semibold">{segment.orderNumber ?? `#${segment.orderId}`}</dd>
                  </div>
                  {segment.fillPercent != null ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Postęp odkładania</dt>
                      <dd className="font-mono font-semibold tabular-nums">{segment.fillPercent.toFixed(0)}%</dd>
                    </div>
                  ) : null}
                </>
              ) : null}
            </dl>
          </section>
        </div>
      </aside>
    </>
  );
}
