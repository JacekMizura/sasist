/**
 * Automation effect editor: generate_document (series + optional overrides + auto-print).
 */
import { useEffect, useMemo, useState } from "react";
import type { AutomationEffect } from "../../../../types/orderAutomation";
import { DAMAGE_TENANT_ID } from "../../../../pages/damage/damageShared";
import { useWarehouse } from "../../../../context/WarehouseContext";
import { Checkbox, Input, Select, Textarea, inputClassName } from "../../../../design-system";
import { listDocumentSeries, type DocumentSeriesDto } from "../../../../api/documentSeriesApi";
import { fetchWorkstations } from "../../../../api/wmsWorkstationsApi";
import type { WorkstationListItem } from "../../../../types/wmsWorkstations";
import {
  buildGenerateDocumentSeriesOptions,
  generateDocumentCapabilities,
  generateDocumentSubtypeHelp,
  resolveGenerateDocumentSeriesId,
} from "../../../../utils/orderAutomationGenerateDocumentSeries";
import { oaWorkflowFieldLabelClass, oaWorkflowFieldRowClass } from "../orderAutomationUiTokens";

export type GenerateDocumentEffectEditorProps = {
  effect: AutomationEffect;
  patchPayload: (partial: Record<string, string | number | boolean | null>) => void;
};

const erpRow = oaWorkflowFieldRowClass;
const erpLbl = oaWorkflowFieldLabelClass;
const erpFieldDensity = "compact" as const;
const erpInpClass = inputClassName(erpFieldDensity);

function payloadFlag(payload: Record<string, unknown>, key: string): boolean {
  return Boolean(payload?.[key]);
}

export function GenerateDocumentEffectEditor({ effect, patchPayload }: GenerateDocumentEffectEditorProps) {
  const { warehouse, warehouses, showWarehouseSelector } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [series, setSeries] = useState<DocumentSeriesDto[]>([]);
  const [stations, setStations] = useState<WorkstationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (warehouseId == null || warehouseId < 1) {
      setSeries([]);
      setStations([]);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void Promise.all([
      listDocumentSeries(DAMAGE_TENANT_ID, warehouseId),
      fetchWorkstations(DAMAGE_TENANT_ID, warehouseId).catch(() => [] as WorkstationListItem[]),
    ])
      .then(([rows, ws]) => {
        if (cancelled) return;
        setSeries(Array.isArray(rows) ? rows : []);
        setStations(Array.isArray(ws) ? ws.filter((s) => s.is_active !== false) : []);
      })
      .catch(() => {
        if (!cancelled) {
          setSeries([]);
          setStations([]);
          setLoadError("Nie udało się wczytać serii dokumentów.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

  const warehouseNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const w of warehouses) {
      map[Number(w.id)] = String(w.name || `Magazyn #${w.id}`);
    }
    return map;
  }, [warehouses]);

  const options = useMemo(
    () =>
      buildGenerateDocumentSeriesOptions(series, {
        warehouseId,
        warehouseNameById,
        showWarehouse: Boolean(showWarehouseSelector && warehouses.length > 1),
      }),
    [series, warehouseId, warehouseNameById, showWarehouseSelector, warehouses.length],
  );

  const selectedId = resolveGenerateDocumentSeriesId(effect.payload);
  const selectedOption = options.find((o) => o.seriesId === selectedId) ?? null;
  const help = generateDocumentSubtypeHelp(selectedOption?.type, selectedOption?.subtype);
  const caps = generateDocumentCapabilities(selectedOption?.type, selectedOption?.subtype);

  const overridePayment = payloadFlag(effect.payload, "override_payment_term");
  const overrideSaleDate = payloadFlag(effect.payload, "override_sale_date");
  const overrideDescription = payloadFlag(effect.payload, "override_description");
  const autoPrint = payloadFlag(effect.payload, "auto_print");

  useEffect(() => {
    if (loading || warehouseId == null) return;
    if (!selectedId) return;
    if (options.some((o) => o.seriesId === selectedId)) return;
    if (options.length === 0) return;
    patchPayload({ series_id: "", doc_series: "" });
  }, [loading, warehouseId, selectedId, options, patchPayload]);

  // Clear SALE-only overrides when switching to WZ/RZ (or no series).
  useEffect(() => {
    if (!selectedOption) return;
    const next = generateDocumentCapabilities(selectedOption.type, selectedOption.subtype);
    const clear: Record<string, string | number | boolean | null> = {};
    if (!next.paymentTerm && (overridePayment || effect.payload.payment_term_days != null)) {
      clear.override_payment_term = false;
      clear.payment_term_days = null;
    }
    if (!next.saleDate && (overrideSaleDate || effect.payload.sale_date != null)) {
      clear.override_sale_date = false;
      clear.sale_date = null;
    }
    if (!next.description && (overrideDescription || effect.payload.additional_description != null)) {
      clear.override_description = false;
      clear.additional_description = null;
    }
    if (!next.autoPrint && autoPrint) {
      clear.auto_print = false;
      clear.print_station_id = null;
    }
    if (Object.keys(clear).length > 0) patchPayload(clear);
    // intentionally only when series type/subtype changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOption?.type, selectedOption?.subtype, selectedOption?.seriesId]);

  const showSaleDefaultsHelper = caps.paymentTerm || caps.saleDate || caps.description;

  return (
    <div className="grid min-w-0 gap-y-0">
      <div className={erpRow}>
        <span className={erpLbl}>
          Seria dokumentu <span className="text-red-600">*</span>
        </span>
        {warehouseId == null ? (
          <p className="m-0 text-xs text-slate-600">Wybierz aktywny magazyn, aby zobaczyć dostępne serie.</p>
        ) : loading ? (
          <p className="m-0 text-xs text-slate-500">Ładowanie serii…</p>
        ) : loadError ? (
          <p className="m-0 text-xs text-red-600">{loadError}</p>
        ) : options.length === 0 ? (
          <p className="m-0 text-xs text-slate-600">
            Brak aktywnych serii obsługiwanych przez automatyzację (FV, PA, WZ, RZ) dla tego magazynu.
          </p>
        ) : (
          <Select
            density={erpFieldDensity}
            value={selectedOption ? selectedId : ""}
            onChange={(e) => {
              const v = e.target.value;
              patchPayload({ series_id: v, doc_series: v || null });
            }}
            aria-label="Seria dokumentu"
          >
            <option value="">— wybierz serię —</option>
            {options.map((o) => (
              <option key={o.seriesId} value={o.seriesId}>
                {o.optionLabel}
              </option>
            ))}
          </Select>
        )}
      </div>

      {showSaleDefaultsHelper ? (
        <p className="m-0 mt-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] leading-snug text-slate-600">
          Domyślne wartości dokumentu są pobierane z ustawień wybranej serii. Zaznacz opcję poniżej tylko wtedy, gdy
          chcesz je nadpisać.
        </p>
      ) : null}
      {help ? <p className="m-0 mt-1 max-w-prose text-[11px] leading-snug text-slate-500">{help}</p> : null}

      {caps.paymentTerm ? (
        <>
          <label className="mt-3 flex cursor-pointer items-start gap-2">
            <Checkbox
              className="mt-0.5"
              checked={overridePayment}
              onChange={(e) =>
                patchPayload({
                  override_payment_term: e.target.checked,
                  payment_term_days: e.target.checked
                    ? Number(effect.payload.payment_term_days) >= 0
                      ? Number(effect.payload.payment_term_days)
                      : 14
                    : null,
                })
              }
            />
            <span className="min-w-0 text-xs text-slate-800">Własny termin płatności</span>
          </label>
          {overridePayment ? (
            <div className={`${erpRow} mt-1 pl-6`}>
              <span className={erpLbl}>Termin (dni)</span>
              <Input
                type="number"
                min={0}
                step={1}
                density={erpFieldDensity}
                className={erpInpClass}
                value={
                  effect.payload.payment_term_days === "" || effect.payload.payment_term_days == null
                    ? ""
                    : String(effect.payload.payment_term_days)
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    patchPayload({ payment_term_days: null });
                    return;
                  }
                  const n = Number(raw);
                  patchPayload({ payment_term_days: Number.isFinite(n) ? Math.trunc(n) : null });
                }}
                aria-label="Termin płatności w dniach"
              />
            </div>
          ) : null}
        </>
      ) : null}

      {caps.saleDate ? (
        <>
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <Checkbox
              className="mt-0.5"
              checked={overrideSaleDate}
              onChange={(e) =>
                patchPayload({
                  override_sale_date: e.target.checked,
                  sale_date: e.target.checked
                    ? String(effect.payload.sale_date || new Date().toISOString().slice(0, 10))
                    : null,
                })
              }
            />
            <span className="min-w-0 text-xs text-slate-800">Własna data sprzedaży</span>
          </label>
          {overrideSaleDate ? (
            <div className={`${erpRow} mt-1 pl-6`}>
              <span className={erpLbl}>Data sprzedaży</span>
              <Input
                type="date"
                density={erpFieldDensity}
                className={erpInpClass}
                value={String(effect.payload.sale_date || "").slice(0, 10)}
                onChange={(e) => patchPayload({ sale_date: e.target.value || null })}
                aria-label="Data sprzedaży"
              />
            </div>
          ) : null}
        </>
      ) : null}

      {caps.description ? (
        <>
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <Checkbox
              className="mt-0.5"
              checked={overrideDescription}
              onChange={(e) =>
                patchPayload({
                  override_description: e.target.checked,
                  additional_description: e.target.checked
                    ? String(effect.payload.additional_description || "")
                    : null,
                })
              }
            />
            <span className="min-w-0 text-xs text-slate-800">Opis dodatkowy</span>
          </label>
          {overrideDescription ? (
            <div className="mt-1 pl-6">
              <Textarea
                density={erpFieldDensity}
                rows={3}
                className="w-full"
                value={String(effect.payload.additional_description || "")}
                onChange={(e) => patchPayload({ additional_description: e.target.value })}
                aria-label="Opis dodatkowy"
                placeholder="Tekst widoczny na dokumencie…"
              />
            </div>
          ) : null}
        </>
      ) : null}

      {caps.autoPrint ? (
        <>
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <Checkbox
              className="mt-0.5"
              checked={autoPrint}
              onChange={(e) =>
                patchPayload({
                  auto_print: e.target.checked,
                  print_station_id: e.target.checked ? effect.payload.print_station_id ?? null : null,
                })
              }
            />
            <span className="min-w-0 text-xs text-slate-800">Drukuj automatycznie</span>
          </label>
          {autoPrint ? (
            <div className={`${erpRow} mt-1 pl-6`}>
              <span className={erpLbl}>
                Stanowisko druku <span className="text-red-600">*</span>
              </span>
              {stations.length === 0 ? (
                <p className="m-0 text-xs text-slate-600">Brak aktywnych stanowisk dla tego magazynu.</p>
              ) : (
                <Select
                  density={erpFieldDensity}
                  value={
                    effect.payload.print_station_id != null && String(effect.payload.print_station_id) !== ""
                      ? String(effect.payload.print_station_id)
                      : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    patchPayload({ print_station_id: v ? Number(v) : null });
                  }}
                  aria-label="Stanowisko druku"
                >
                  <option value="">— wybierz stanowisko —</option>
                  {stations.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
