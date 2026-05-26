import { Fragment, forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { Check, Circle, Truck, X } from "lucide-react";

import {
  carrierTrackingUrl,
  createComplaintShipment,
  downloadComplaintShipmentLabelBlob,
  patchComplaintShipmentStatus,
} from "../../api/complaintShipmentApi";
import { COMPLAINT_STATUS_STYLES } from "../../constants/complaintStatusStyles";
import type { ComplaintDetail } from "../../types/complaint";
import type {
  ComplaintShipmentCarrier,
  ComplaintShipmentDetail,
  ComplaintShipmentGetResponse,
  ComplaintShipmentStatus,
} from "../../types/complaintShipment";
import { CARRIER_OPTIONS, CarrierWithLogo, carrierLabel } from "./complaintShipmentBranding";

const STATUS_PL: Record<string, string> = {
  ORDERED: "Oczekiwanie na kuriera",
  CREATED: "Oczekiwanie na kuriera",
  PICKED_UP: "Odebrane przez kuriera",
  IN_TRANSIT: "W transporcie",
  DELIVERED: "Dostarczono do magazynu",
  CANCELLED: "Anulowane",
};

const LOGISTICS_PL: Record<string, string> = {
  WAITING_FOR_ITEM: "Oczekiwanie na towar",
  RECEIVED: "Towar przyjęty",
  IN_INSPECTION: "Przyjęto do inspekcji",
  IN_SERVICE: "W serwisie",
  RETURNED_FROM_SERVICE: "Powrót z serwisu",
};

/** Jak badge statusu reklamacji (np. NOWE): rounded-full border px-2.5 … + ta sama paleta sukcesu. */
const SHIPMENT_STATUS_BADGE_BASE =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-tight";

const SHIPMENT_PROGRESS_LABELS = [
  "Ocz. na kuriera",
  "Odebrane",
  "W drodze",
  "Doręczone",
] as const;

/** ORDERED + CREATED (alias) → krok 0; CANCELLED → osobny widok. */
function shipmentProgressIndex(statusUpper: string): number | "cancelled" | null {
  if (statusUpper === "CANCELLED") return "cancelled";
  if (statusUpper === "ORDERED" || statusUpper === "CREATED") return 0;
  if (statusUpper === "PICKED_UP") return 1;
  if (statusUpper === "IN_TRANSIT") return 2;
  if (statusUpper === "DELIVERED") return 3;
  return null;
}

function ShipmentProgressBar({ statusUpper }: { statusUpper: string }) {
  const phase = shipmentProgressIndex(statusUpper);

  if (phase === "cancelled") {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
        <p className="text-center text-xs font-medium text-gray-500">Przesyłka anulowana — postęp niedostępny</p>
      </div>
    );
  }

  const current = phase ?? 0;
  const isDelivered = statusUpper === "DELIVERED";

  return (
    <div className="w-full" aria-label="Postęp przesyłki">
      <div className="flex w-full items-center">
        {SHIPMENT_PROGRESS_LABELS.map((label, i) => {
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
        {SHIPMENT_PROGRESS_LABELS.map((label, i) => {
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

function nextPickupIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatPlDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = iso.split("-").map((x) => parseInt(x, 10));
  const y = parts[0];
  const m = parts[1];
  const da = parts[2];
  if (!y || !m || !da) return iso;
  try {
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" }).format(new Date(y, m - 1, da));
  } catch {
    return iso;
  }
}

type Props = {
  complaintId: number;
  tenantId: number;
  warehouseId: number;
  data: ComplaintDetail;
  shipment: ComplaintShipmentDetail | null;
  onShipmentUpdated: (r: ComplaintShipmentGetResponse) => void;
  /** Po dostawie zwrotu — odśwież reklamację (logistyka: inspekcja). */
  onComplaintSynced?: () => void;
  disabled?: boolean;
  /** Zwięzły blok w sekcji Operacje (bez dużego nagłówka karty). */
  embed?: boolean;
};

export type ComplaintShipmentTransportSectionHandle = {
  openPickupModal: () => void;
};

const ComplaintShipmentTransportSection = forwardRef<ComplaintShipmentTransportSectionHandle, Props>(function ComplaintShipmentTransportSection(
  {
  complaintId,
  tenantId,
  warehouseId,
  data,
  shipment,
  onShipmentUpdated,
  onComplaintSynced,
  disabled = false,
  embed = false,
}: Props,
  ref,
) {
  const [modalOpen, setModalOpen] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [carrier, setCarrier] = useState<ComplaintShipmentCarrier>("INPOST");
  const [pickupName, setPickupName] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [pickupEmail, setPickupEmail] = useState("");
  const [pickupDate, setPickupDate] = useState(nextPickupIsoDate);
  const [pickupNotes, setPickupNotes] = useState("");

  const openModal = useCallback(() => {
    setFormErr(null);
    setCarrier("INPOST");
    setPickupName(String(data.customer_name ?? "").trim());
    setPickupAddress(String(data.customer_address ?? "").trim());
    setPickupPhone(String(data.customer_phone ?? "").trim());
    setPickupEmail(String(data.customer_email ?? "").trim());
    setPickupDate(nextPickupIsoDate());
    setPickupNotes("");
    setModalOpen(true);
  }, [data.customer_address, data.customer_email, data.customer_name, data.customer_phone]);

  useImperativeHandle(ref, () => ({ openPickupModal: openModal }), [openModal]);

  const patchStatus = useCallback(
    async (status: ComplaintShipmentStatus) => {
      setActionBusy(true);
      try {
        const r = await patchComplaintShipmentStatus(complaintId, tenantId, warehouseId, status);
        onShipmentUpdated(r);
        if (status === "DELIVERED") onComplaintSynced?.();
      } catch {
        window.alert("Nie udało się zaktualizować przesyłki.");
      } finally {
        setActionBusy(false);
      }
    },
    [complaintId, onComplaintSynced, onShipmentUpdated, tenantId, warehouseId],
  );

  const downloadLabel = useCallback(async () => {
    setActionBusy(true);
    try {
      const blob = await downloadComplaintShipmentLabelBlob(complaintId, tenantId, warehouseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `etykieta-reklamacja-${complaintId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setActionBusy(false);
    }
  }, [complaintId, tenantId, warehouseId]);

  const submitCreate = useCallback(async () => {
    setFormErr(null);
    setActionBusy(true);
    try {
      const r = await createComplaintShipment(complaintId, tenantId, warehouseId, {
        method: "COURIER_PICKUP",
        carrier,
        pickup_name: pickupName.trim() || null,
        pickup_address: pickupAddress.trim() || null,
        pickup_phone: pickupPhone.trim() || null,
        pickup_email: pickupEmail.trim() || null,
        pickup_date: pickupDate || null,
        notes: pickupNotes.trim() || null,
      });
      onShipmentUpdated(r);
      setModalOpen(false);
    } catch (e: unknown) {
      let msg = "Nie udało się utworzyć przesyłki.";
      if (typeof e === "object" && e !== null && "response" in e) {
        const d = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
        if (typeof d === "string" && d.trim()) msg = d;
      }
      setFormErr(msg);
    } finally {
      setActionBusy(false);
    }
  }, [
    carrier,
    complaintId,
    onShipmentUpdated,
    pickupAddress,
    pickupDate,
    pickupEmail,
    pickupName,
    pickupNotes,
    pickupPhone,
    tenantId,
    warehouseId,
  ]);

  const cancelShipment = useCallback(() => {
    if (!window.confirm("Anulować przesyłkę?")) return;
    void patchStatus("CANCELLED");
  }, [patchStatus]);

  const st = shipment?.status?.toUpperCase() ?? "";
  const terminal = st === "DELIVERED" || st === "CANCELLED";

  const cardClass = embed
    ? "rounded-lg border border-zinc-200 bg-white p-2 text-[11px] shadow-sm"
    : "rounded-xl border border-gray-200 bg-white p-4 shadow-sm";
  const sectionTitle = "text-xs font-semibold uppercase tracking-wide text-gray-500";

  return (
    <>
      <div className={cardClass}>
        {embed ? (
          <p className="font-medium text-gray-800">Odbiór od klienta</p>
        ) : (
          <>
            <h2 className={`flex items-center gap-2 ${sectionTitle}`}>
              <Truck className="h-4 w-4 text-gray-400" aria-hidden />
              Odbiór od klienta
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Kurier odbiera towar u klienta i dostarcza go do magazynu (przesyłka przychodząca). Dane można uzupełnić z zamówienia i edytować przed złożeniem zamówienia u przewoźnika.
            </p>
          </>
        )}

        {!shipment ? (
          <div className={embed ? "mt-1.5 space-y-1.5" : "mt-3 space-y-3"}>
            {embed ? null : <p className="text-sm text-gray-600">Nie zamówiono jeszcze odbioru od klienta.</p>}
            <button
              type="button"
              disabled={disabled || actionBusy}
              onClick={openModal}
              className={
                embed
                  ? "w-full rounded-md border border-blue-200 bg-blue-50 py-1.5 text-center text-[11px] font-semibold text-blue-950 hover:bg-blue-100 disabled:opacity-50"
                  : "w-full rounded-xl border-2 border-blue-200 bg-blue-50 py-3 text-center text-base font-semibold text-blue-950 hover:border-blue-300 hover:bg-blue-100 disabled:opacity-50"
              }
            >
              Zamów odbiór
            </button>
          </div>
        ) : (
          <div className={embed ? "mt-1.5 space-y-2 text-[11px]" : "mt-3 space-y-3 text-sm"}>
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Kierunek</dt>
                <dd className="text-gray-900">Od klienta do magazynu (przychodząca)</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Przewoźnik</dt>
                <dd className="font-medium text-gray-900">
                  <CarrierWithLogo code={shipment.carrier} label={carrierLabel(shipment.carrier)} />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Sposób</dt>
                <dd className="text-gray-900">Odbiór u klienta przez kuriera</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Status</dt>
                <dd>
                  {st === "ORDERED" || st === "CREATED" ? (
                    <span
                      className={`${SHIPMENT_STATUS_BADGE_BASE} ${COMPLAINT_STATUS_STYLES.NOWE}`}
                    >
                      {STATUS_PL[st] ?? shipment.status}
                    </span>
                  ) : (
                    <span className="font-semibold text-gray-900">{STATUS_PL[st] ?? shipment.status}</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Data odbioru</dt>
                <dd className="text-gray-900">{formatPlDate(shipment.pickup_date)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-gray-500">Numer śledzenia</dt>
                <dd className="break-all font-mono text-xs text-gray-900">
                  {shipment.tracking_number}
                  {shipment.tracking_number?.trim() ? (
                    <a
                      href={carrierTrackingUrl(shipment.carrier, shipment.tracking_number)}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 font-sans text-blue-600 hover:underline"
                    >
                      Śledź
                    </a>
                  ) : null}
                </dd>
              </div>
              {shipment.notes?.trim() ? (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-gray-500">Notatka</dt>
                  <dd className="text-gray-900">{shipment.notes}</dd>
                </div>
              ) : null}
            </dl>

            <div className={embed ? "border-t border-gray-100 pt-2" : "border-t border-gray-100 pt-3"}>
              <ShipmentProgressBar statusUpper={st} />
            </div>

            {!terminal && !embed ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Panel — kolejny etap</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {st === "ORDERED" || st === "CREATED" ? (
                    <button
                      type="button"
                      disabled={disabled || actionBusy}
                      onClick={() => void patchStatus("PICKED_UP")}
                      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Odebrane przez kuriera
                    </button>
                  ) : null}
                  {st === "PICKED_UP" ? (
                    <button
                      type="button"
                      disabled={disabled || actionBusy}
                      onClick={() => void patchStatus("IN_TRANSIT")}
                      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                    >
                      W drodze
                    </button>
                  ) : null}
                  {st === "IN_TRANSIT" ? (
                    <button
                      type="button"
                      disabled={disabled || actionBusy}
                      onClick={() => void patchStatus("DELIVERED")}
                      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Doręczone do magazynu
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {String(data.logistics_status ?? "")
              .toUpperCase()
              .trim() ? (
              <p className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-950">
                <span className="font-semibold">Logistyka reklamacji: </span>
                {LOGISTICS_PL[String(data.logistics_status).toUpperCase()] ?? data.logistics_status}
              </p>
            ) : null}

            <div className={`flex flex-col gap-2 border-t border-gray-100 ${embed ? "pt-2" : "pt-3"}`}>
              <button
                type="button"
                disabled={disabled || actionBusy}
                onClick={() => void downloadLabel()}
                className={
                  embed
                    ? "w-full rounded-md border border-gray-300 bg-white py-1.5 text-[11px] font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                    : "w-full rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                }
              >
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

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-base font-semibold text-gray-900">Odbiór od klienta — kurier</h3>
              <button
                type="button"
                className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
                onClick={() => setModalOpen(false)}
                aria-label="Zamknij"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div>
                <label className="text-xs font-medium text-gray-500" htmlFor="ship-carrier">
                  Przewoźnik
                </label>
                <select
                  id="ship-carrier"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value as ComplaintShipmentCarrier)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  {CARRIER_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-sm text-gray-800">
                  <CarrierWithLogo code={carrier} label={carrierLabel(carrier)} />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Dane odbioru / nadania</p>
                <p className="mt-0.5 text-xs text-gray-400">Uzupełnione z danych klienta — możesz poprawić.</p>
                <div className="mt-2 space-y-2">
                  <input
                    value={pickupName}
                    onChange={(e) => setPickupName(e.target.value)}
                    placeholder="Imię i nazwisko"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    placeholder="Adres (ulica, kod, miasto)"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={pickupPhone}
                    onChange={(e) => setPickupPhone(e.target.value)}
                    placeholder="Telefon"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={pickupEmail}
                    onChange={(e) => setPickupEmail(e.target.value)}
                    placeholder="E-mail"
                    type="email"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500" htmlFor="ship-pickup-date">
                  Data odbioru
                </label>
                <input
                  id="ship-pickup-date"
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500" htmlFor="ship-pickup-notes">
                  Notatka (opcjonalnie)
                </label>
                <textarea
                  id="ship-pickup-notes"
                  value={pickupNotes}
                  onChange={(e) => setPickupNotes(e.target.value)}
                  rows={2}
                  placeholder="Uwagi dla kuriera lub wewnętrzne"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              {formErr ? <p className="text-sm text-red-600">{formErr}</p> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => setModalOpen(false)}
                disabled={actionBusy}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => void submitCreate()}
                disabled={actionBusy}
              >
                Złóż zamówienie
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
});

export default ComplaintShipmentTransportSection;
