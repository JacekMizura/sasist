import { Fragment, useCallback, useState } from "react";
import { Check, Circle, Package, Truck } from "lucide-react";

import {
  carrierTrackingUrl,
  downloadComplaintShipmentLabelBlob,
  patchComplaintShipmentStatus,
} from "../../api/complaintShipmentApi";
import { COMPLAINT_STATUS_STYLES } from "../../constants/complaintStatusStyles";
import type {
  ComplaintShipmentDetail,
  ComplaintShipmentGetResponse,
  ComplaintShipmentStatus,
} from "../../types/complaintShipment";
import { CarrierWithLogo, carrierLabel } from "./complaintShipmentBranding";

const STATUS_PL: Record<string, string> = {
  ORDERED: "Zamówione",
  CREATED: "Zamówione",
  PICKED_UP: "Odebrane przez kuriera",
  IN_TRANSIT: "W transporcie",
  DELIVERED: "Dostarczono",
  CANCELLED: "Anulowane",
};

const SHIPMENT_STATUS_BADGE_BASE =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-tight";

const OUTBOUND_PROGRESS_LABELS = ["Zamówione", "Nadanie", "W transporcie", "U klienta"] as const;

function outboundProgressIndex(statusUpper: string): number | "cancelled" | null {
  if (statusUpper === "CANCELLED") return "cancelled";
  if (statusUpper === "ORDERED" || statusUpper === "CREATED") return 0;
  if (statusUpper === "PICKED_UP") return 1;
  if (statusUpper === "IN_TRANSIT") return 2;
  if (statusUpper === "DELIVERED") return 3;
  return null;
}

function OutboundProgressBar({ statusUpper }: { statusUpper: string }) {
  const phase = outboundProgressIndex(statusUpper);
  if (phase === "cancelled") {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
        <p className="text-center text-xs font-medium text-gray-500">Przesyłka anulowana</p>
      </div>
    );
  }
  const current = phase ?? 0;
  const isDelivered = statusUpper === "DELIVERED";
  return (
    <div className="w-full" aria-label="Postęp przesyłki do klienta">
      <div className="flex w-full items-center">
        {OUTBOUND_PROGRESS_LABELS.map((label, i) => {
          const done = isDelivered || i < current;
          const active = !isDelivered && i === current;
          const nodeBase =
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs transition-colors";
          let nodeClass = `${nodeBase} `;
          if (done) nodeClass += "border-green-600 bg-green-600 text-white";
          else if (active) nodeClass += "border-blue-500 bg-blue-50 text-blue-700 shadow-sm ring-2 ring-blue-200";
          else nodeClass += "border-gray-200 bg-white text-gray-300";
          return (
            <Fragment key={label}>
              {i > 0 ? (
                <div
                  className={`mx-1 h-0.5 min-h-[2px] min-w-[6px] flex-1 rounded-full ${isDelivered || current >= i ? "bg-green-500" : "bg-gray-200"}`}
                  aria-hidden
                />
              ) : null}
              <div className="flex shrink-0 flex-col items-center">
                <div className={nodeClass} aria-current={active ? "step" : undefined}>
                  {done ? (
                    <Check className="h-4 w-4 stroke-[2.5]" aria-hidden />
                  ) : active ? (
                    <Circle className="h-3.5 w-3.5 fill-current" aria-hidden />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-gray-300" aria-hidden />
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 sm:gap-2">
        {OUTBOUND_PROGRESS_LABELS.map((label, i) => {
          const done = isDelivered || i < current;
          const active = !isDelivered && i === current;
          const labelClass =
            done
              ? "text-[10px] font-semibold leading-tight text-green-700 sm:text-[11px]"
              : active
                ? "text-[10px] font-semibold leading-tight text-blue-800 sm:text-[11px]"
                : "text-[10px] font-medium leading-tight text-gray-400 sm:text-[11px]";
          return (
            <p key={label} className={`min-w-0 text-center ${labelClass}`}>
              {label}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function flowKindLabel(bt: string | null | undefined): string {
  const u = (bt ?? "").toUpperCase();
  if (u === "EXCHANGE") return "Wymiana";
  if (u === "REPLACEMENT") return "Nowy produkt";
  return "—";
}

function modeLabel(mode: string | null | undefined): string {
  const u = (mode ?? "").toUpperCase();
  if (u === "DELIVERY_AND_PICKUP") return "Dostawa do klienta + odbiór reklamowanego towaru";
  if (u === "DELIVERY_ONLY") return "Tylko dostawa do klienta (bez odbioru zwrotu)";
  return "—";
}

type Props = {
  complaintId: number;
  tenantId: number;
  warehouseId: number;
  outboundShipment: ComplaintShipmentDetail | null;
  onUpdated: (r: ComplaintShipmentGetResponse) => void;
  disabled?: boolean;
  embed?: boolean;
};

export default function ComplaintOutboundShipmentSection({
  complaintId,
  tenantId,
  warehouseId,
  outboundShipment,
  onUpdated,
  disabled = false,
  embed = false,
}: Props) {
  const [actionBusy, setActionBusy] = useState(false);

  const patchStatus = useCallback(
    async (status: ComplaintShipmentStatus) => {
      setActionBusy(true);
      try {
        const r = await patchComplaintShipmentStatus(
          complaintId,
          tenantId,
          warehouseId,
          status,
          "OUTBOUND",
        );
        onUpdated(r);
      } catch {
        window.alert("Nie udało się zaktualizować przesyłki.");
      } finally {
        setActionBusy(false);
      }
    },
    [complaintId, onUpdated, tenantId, warehouseId],
  );

  const downloadLabel = useCallback(async () => {
    setActionBusy(true);
    try {
      const blob = await downloadComplaintShipmentLabelBlob(
        complaintId,
        tenantId,
        warehouseId,
        "OUTBOUND",
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `etykieta-reklamacja-${complaintId}-nadanie.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setActionBusy(false);
    }
  }, [complaintId, tenantId, warehouseId]);

  const cancelShipment = useCallback(() => {
    if (!window.confirm("Anulować przesyłkę nadania do klienta?")) return;
    void patchStatus("CANCELLED");
  }, [patchStatus]);

  const st = outboundShipment?.status?.toUpperCase() ?? "";
  const terminal = st === "DELIVERED" || st === "CANCELLED";
  const cardClass = embed
    ? "rounded-lg border border-zinc-200 bg-white p-2 text-[11px] shadow-sm"
    : "rounded-xl border border-gray-200 bg-white p-4 shadow-sm";
  const sectionTitle = "text-xs font-semibold uppercase tracking-wide text-gray-500";

  return (
    <div className={cardClass}>
      {embed ? (
        <p className="font-medium text-gray-800">Nadanie do klienta</p>
      ) : (
        <>
          <h2 className={`flex items-center gap-2 ${sectionTitle}`}>
            <Package className="h-4 w-4 text-gray-400" aria-hidden />
            Nadanie do klienta (zamówienie z reklamacji)
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Tworzone automatycznie po zapisaniu zamówienia z reklamacji. Wymiana = kurier dostarcza nowy towar i odbiera
            reklamowany; „Wysłanie nowego” = tylko dostawa bez odbioru.
          </p>
        </>
      )}

      {!outboundShipment ? (
        <p className={embed ? "mt-1 text-[10px] text-gray-500" : "mt-3 text-sm text-gray-600"}>
          {embed
            ? "Brak przesyłki — utworzysz ją po zamówieniu / z magazynu (śledzenie pojawi się tutaj)."
            : "Brak przesyłki — pojawi się po utworzeniu powiązanego zamówienia (przycisk Wymiana lub Wysłanie nowego)."}
        </p>
      ) : (
        <div className={embed ? "mt-1.5 space-y-2 text-[11px]" : "mt-3 space-y-3 text-sm"}>
          <dl className="space-y-2">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Typ</dt>
              <dd className="font-medium text-gray-900">{flowKindLabel(outboundShipment.shipment_business_type)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-gray-500">Realizacja</dt>
              <dd className="text-gray-900">{modeLabel(outboundShipment.fulfillment_mode)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Przewoźnik</dt>
              <dd className="font-medium text-gray-900">
                <CarrierWithLogo code={outboundShipment.carrier} label={carrierLabel(outboundShipment.carrier)} />
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Status</dt>
              <dd>
                {st === "ORDERED" || st === "CREATED" ? (
                  <span className={`${SHIPMENT_STATUS_BADGE_BASE} ${COMPLAINT_STATUS_STYLES.NOWE}`}>
                    {STATUS_PL[st] ?? outboundShipment.status}
                  </span>
                ) : (
                  <span className="font-semibold text-gray-900">{STATUS_PL[st] ?? outboundShipment.status}</span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-gray-500">Numer śledzenia</dt>
              <dd className="break-all font-mono text-xs text-gray-900">
                {outboundShipment.tracking_number}
                {outboundShipment.tracking_number?.trim() ? (
                  <a
                    href={carrierTrackingUrl(outboundShipment.carrier, outboundShipment.tracking_number)}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 font-sans text-blue-600 hover:underline"
                  >
                    Śledź
                  </a>
                ) : null}
              </dd>
            </div>
          </dl>

          <div className={embed ? "border-t border-gray-100 pt-2" : "border-t border-gray-100 pt-3"}>
            <OutboundProgressBar statusUpper={st} />
          </div>

          <div className={`flex flex-col gap-2 border-t border-gray-100 ${embed ? "pt-2" : "pt-3"}`}>
            <button
              type="button"
              disabled={disabled || actionBusy}
              onClick={() => void downloadLabel()}
              className={
                embed
                  ? "flex w-full items-center justify-center gap-1 rounded-md border border-gray-300 bg-white py-1.5 text-[11px] font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  : "flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
              }
            >
              <Truck className={embed ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
              Pobierz etykietę
            </button>
            <button
              type="button"
              disabled={disabled || actionBusy || terminal}
              onClick={cancelShipment}
              className={
                embed
                  ? "w-full rounded-md border border-red-200 bg-red-50 py-1.5 text-[11px] font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
                  : "w-full rounded-lg border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
              }
            >
              Anuluj przesyłkę
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
