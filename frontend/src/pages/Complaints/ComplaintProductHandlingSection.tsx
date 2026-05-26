import { Fragment, useCallback, useState } from "react";
import { Check, Circle, Package, X } from "lucide-react";

import {
  carrierTrackingUrl,
  createComplaintServiceShipment,
  downloadComplaintShipmentLabelBlob,
  patchComplaintShipmentStatus,
} from "../../api/complaintShipmentApi";
import { COMPLAINT_STATUS_STYLES } from "../../constants/complaintStatusStyles";
import type {
  ComplaintShipmentCarrier,
  ComplaintShipmentDetail,
  ComplaintShipmentGetResponse,
  ComplaintShipmentMethod,
} from "../../types/complaintShipment";
import { CARRIER_OPTIONS, CarrierWithLogo, carrierLabel } from "./complaintShipmentBranding";

const SERVICE_METHOD_OPTIONS: { value: ComplaintShipmentMethod; label: string }[] = [
  { value: "COURIER_PICKUP", label: "Odbiór u kuriera" },
  { value: "DROP_OFF", label: "Punkt nadania" },
];

const SERVICE_STATUS_PL: Record<string, string> = {
  ORDERED: "Wysłano",
  CREATED: "Wysłano",
  PICKED_UP: "Odebrane przez kuriera",
  IN_TRANSIT: "W transporcie",
  DELIVERED: "Dostarczono do serwisu / dostawcy",
  IN_SERVICE: "W serwisie",
  RETURNING: "W drodze powrotnej",
  RETURNED: "Zwrot w magazynie",
  CANCELLED: "Anulowane",
};

function serviceShipmentStatusLabel(statusUpper: string, isRepairPath: boolean): string {
  if (isRepairPath) {
    if (statusUpper === "DELIVERED") return "Dostarczono do serwisu";
    return SERVICE_STATUS_PL[statusUpper] ?? statusUpper;
  }
  const supplier: Record<string, string> = {
    ...SERVICE_STATUS_PL,
    DELIVERED: "Dostarczono do dostawcy",
    IN_SERVICE: "U dostawcy",
    RETURNING: "Zamykanie sprawy",
    RETURNED: "Sprawa zamknięta",
  };
  return supplier[statusUpper] ?? statusUpper;
}

const SHIPMENT_STATUS_BADGE_BASE =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-tight";

const REPAIR_SERVICE_PROGRESS_LABELS = [
  "Wysłano",
  "W transporcie",
  "Dostarczono",
  "W serwisie",
  "W drodze powrotnej",
] as const;

const SUPPLIER_SERVICE_PROGRESS_LABELS = [
  "Wysłano",
  "W transporcie",
  "Dostarczono",
  "U dostawcy",
  "Sprawa zamknięta",
] as const;

function serviceShipmentProgressIndex(statusUpper: string): number | "cancelled" | "complete" {
  if (statusUpper === "CANCELLED") return "cancelled";
  if (statusUpper === "RETURNED") return "complete";
  if (statusUpper === "ORDERED" || statusUpper === "CREATED") return 0;
  if (statusUpper === "PICKED_UP" || statusUpper === "IN_TRANSIT") return 1;
  if (statusUpper === "DELIVERED") return 2;
  if (statusUpper === "IN_SERVICE") return 3;
  if (statusUpper === "RETURNING") return 4;
  return 0;
}

function ServiceShipmentProgressBar({
  statusUpper,
  variant,
}: {
  statusUpper: string;
  variant: "repair" | "supplier";
}) {
  const phase = serviceShipmentProgressIndex(statusUpper);
  const labels = variant === "repair" ? REPAIR_SERVICE_PROGRESS_LABELS : SUPPLIER_SERVICE_PROGRESS_LABELS;

  if (phase === "cancelled") {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
        <p className="text-center text-xs font-medium text-gray-500">Przesyłka anulowana — postęp niedostępny</p>
      </div>
    );
  }

  const allDone = phase === "complete";
  const current = typeof phase === "number" ? phase : 0;

  return (
    <div
      className="w-full"
      aria-label={variant === "repair" ? "Postęp przesyłki do serwisu" : "Postęp przesyłki do dostawcy"}
    >
      <div className="flex w-full items-center">
        {labels.map((label, i) => {
          const done = allDone || i < current;
          const active = !allDone && i === current;

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
                  className={`mx-1 h-0.5 min-h-[2px] min-w-[6px] flex-1 rounded-full ${allDone || i <= current ? "bg-green-500" : "bg-gray-200"}`}
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
      <div className="mt-2 grid grid-cols-5 gap-0.5 sm:gap-1">
        {labels.map((label, i) => {
          const done = allDone || i < current;
          const active = !allDone && i === current;
          const labelClass =
            done
              ? "text-[9px] font-semibold leading-tight text-green-700 sm:text-[10px]"
              : active
                ? "text-[9px] font-semibold leading-tight text-blue-800 sm:text-[10px]"
                : "text-[9px] font-medium leading-tight text-gray-400 sm:text-[10px]";
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

function methodLabel(code: string): string {
  return SERVICE_METHOD_OPTIONS.find((m) => m.value === code)?.label ?? code;
}

export function shouldShowProductHandlingSection(
  lines: Array<{ decision?: string | null }> | null | undefined,
): boolean {
  return (lines ?? []).some((l) => String(l.decision ?? "").trim().toLowerCase() === "repair");
}

/** Przesyłka: odbiór od klienta (kurier) — gdy reklamacja ma pozycje z zamówienia. */
export function shouldShowCustomerReturnShipment(lines: unknown[] | null | undefined): boolean {
  return (lines?.length ?? 0) > 0;
}

type Props = {
  complaintId: number;
  tenantId: number;
  warehouseId: number;
  /** Ścieżka serwisowa — gdy któraś pozycja ma decyzję „naprawa”. */
  showRepairPath: boolean;
  serviceShipment: ComplaintShipmentDetail | null;
  onServiceShipmentResponse: (r: ComplaintShipmentGetResponse) => void;
  disabled?: boolean;
  embed?: boolean;
};

export default function ComplaintProductHandlingSection({
  complaintId,
  tenantId,
  warehouseId,
  showRepairPath,
  serviceShipment,
  onServiceShipmentResponse,
  disabled = false,
  embed = false,
}: Props) {
  const isRepairPath = showRepairPath;
  const [modalOpen, setModalOpen] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [method, setMethod] = useState<ComplaintShipmentMethod>("COURIER_PICKUP");
  const [carrier, setCarrier] = useState<ComplaintShipmentCarrier>("INPOST");
  const [pickupName, setPickupName] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [pickupEmail, setPickupEmail] = useState("");
  const [pickupDate, setPickupDate] = useState(nextPickupIsoDate);
  const [destinationLine, setDestinationLine] = useState("");
  const [rma, setRma] = useState("");
  const [notes, setNotes] = useState("");

  const openModal = useCallback(() => {
    setFormErr(null);
    setMethod("COURIER_PICKUP");
    setCarrier("INPOST");
    setPickupName("");
    setPickupAddress("");
    setPickupPhone("");
    setPickupEmail("");
    setPickupDate(nextPickupIsoDate());
    setDestinationLine("");
    setRma("");
    setNotes("");
    setModalOpen(true);
  }, []);

  const requireAddressFields = method === "COURIER_PICKUP" || method === "DROP_OFF";

  const patchStatus = useCallback(
    async (status: "CANCELLED") => {
      setActionBusy(true);
      try {
        const r = await patchComplaintShipmentStatus(complaintId, tenantId, warehouseId, status, "SERVICE");
        onServiceShipmentResponse(r);
      } catch {
        window.alert("Nie udało się zaktualizować przesyłki.");
      } finally {
        setActionBusy(false);
      }
    },
    [complaintId, onServiceShipmentResponse, tenantId, warehouseId],
  );

  const downloadLabel = useCallback(async () => {
    setActionBusy(true);
    try {
      const blob = await downloadComplaintShipmentLabelBlob(complaintId, tenantId, warehouseId, "SERVICE");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `etykieta-serwis-reklamacja-${complaintId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setActionBusy(false);
    }
  }, [complaintId, tenantId, warehouseId]);

  const submitCreate = useCallback(async () => {
    setFormErr(null);
    if (!destinationLine.trim() || !rma.trim()) {
      setFormErr("Uzupełnij adres / identyfikację odbiorcy (serwis / dostawca) oraz numer RMA.");
      return;
    }
    setActionBusy(true);
    try {
      const r = await createComplaintServiceShipment(complaintId, tenantId, warehouseId, {
        method,
        carrier,
        destination_line: destinationLine.trim(),
        service_rma: rma.trim(),
        pickup_name: pickupName.trim() || null,
        pickup_address: pickupAddress.trim() || null,
        pickup_phone: pickupPhone.trim() || null,
        pickup_email: pickupEmail.trim() || null,
        pickup_date: pickupDate || null,
        notes: notes.trim() || null,
      });
      onServiceShipmentResponse(r);
      setModalOpen(false);
    } catch (e: unknown) {
      let msg = "Nie udało się utworzyć przesyłki do serwisu.";
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
    destinationLine,
    method,
    notes,
    onServiceShipmentResponse,
    pickupAddress,
    pickupDate,
    pickupEmail,
    pickupName,
    pickupPhone,
    rma,
    tenantId,
    warehouseId,
  ]);

  const cancelShipment = useCallback(() => {
    const msg = isRepairPath ? "Anulować przesyłkę do serwisu?" : "Anulować przesyłkę do dostawcy?";
    if (!window.confirm(msg)) return;
    void patchStatus("CANCELLED");
  }, [isRepairPath, patchStatus]);

  const st = serviceShipment?.status?.toUpperCase() ?? "";
  const terminal = st === "RETURNED" || st === "CANCELLED";

  const cardClass = embed
    ? "rounded-lg border border-zinc-200 bg-white p-2 text-[11px] shadow-sm"
    : "rounded-xl border border-gray-200 bg-white p-4 shadow-sm";
  const sectionTitle = "text-xs font-semibold uppercase tracking-wide text-gray-500";

  return (
    <>
      <div className={cardClass}>
        {embed ? (
          <p className="font-medium text-gray-800">{isRepairPath ? "Wysyłka do serwisu" : "Wysyłka do dostawcy"}</p>
        ) : (
          <>
            <h2 className={`flex items-center gap-2 ${sectionTitle}`}>
              <Package className="h-4 w-4 text-gray-400" aria-hidden />
              Obsługa produktu
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {isRepairPath
                ? "Nadanie do serwisu: towar jedzie naprawić, potem wraca do magazynu i do klienta. Osobno zamów przesyłkę zwrotną od klienta — sekcja „Transport / Odbiór” poniżej."
                : "Wysyłka do dostawcy: towar nie wraca do magazynu — po przekazaniu kurierem zamykacie sprawę operacyjnie."}
            </p>
          </>
        )}

        {!serviceShipment ? (
          <div className={embed ? "mt-1.5 space-y-1.5" : "mt-3 space-y-3"}>
            {embed ? null : (
              <p className="text-sm text-gray-600">
                {isRepairPath
                  ? "Brak przesyłki do serwisu — utwórz jak zamówienie kuriera (nadanie z magazynu, cel serwisu, RMA)."
                  : "Brak przesyłki do dostawcy — utwórz jak zamówienie kuriera (nadanie, adres dostawcy, RMA)."}
              </p>
            )}
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
              {embed
                ? isRepairPath
                  ? "Wyślij do serwisu"
                  : "Nadaj do dostawcy"
                : isRepairPath
                  ? "Nadaj przesyłkę do serwisu"
                  : "Nadaj przesyłkę do dostawcy"}
            </button>
          </div>
        ) : (
          <div className={embed ? "mt-1.5 space-y-2 text-[11px]" : "mt-3 space-y-3 text-sm"}>
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Przewoźnik</dt>
                <dd className="font-medium text-gray-900">
                  <CarrierWithLogo code={serviceShipment.carrier} label={carrierLabel(serviceShipment.carrier)} />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Sposób</dt>
                <dd className="text-gray-900">{methodLabel(serviceShipment.method)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Status</dt>
                <dd>
                  {st === "ORDERED" || st === "CREATED" ? (
                    <span className={`${SHIPMENT_STATUS_BADGE_BASE} ${COMPLAINT_STATUS_STYLES.NOWE}`}>
                      {serviceShipmentStatusLabel(st, isRepairPath)}
                    </span>
                  ) : (
                    <span className="font-semibold text-gray-900">{serviceShipmentStatusLabel(st, isRepairPath)}</span>
                  )}
                </dd>
              </div>
              {serviceShipment.destination_line ? (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-gray-500">{isRepairPath ? "Cel (serwis)" : "Cel (dostawca)"}</dt>
                  <dd className="whitespace-pre-wrap text-gray-900">{serviceShipment.destination_line}</dd>
                </div>
              ) : null}
              {serviceShipment.service_rma ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">RMA</dt>
                  <dd className="font-mono text-xs text-gray-900">{serviceShipment.service_rma}</dd>
                </div>
              ) : null}
              {serviceShipment.notes ? (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-gray-500">Notatka</dt>
                  <dd className="whitespace-pre-wrap text-xs text-gray-700">{serviceShipment.notes}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Data odbioru / nadania</dt>
                <dd className="text-gray-900">{formatPlDate(serviceShipment.pickup_date)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-gray-500">Numer śledzenia</dt>
                <dd className="break-all font-mono text-xs text-gray-900">{serviceShipment.tracking_number}</dd>
              </div>
            </dl>

            <div className="border-t border-gray-100 pt-3">
              <a
                href={carrierTrackingUrl(serviceShipment.carrier, serviceShipment.tracking_number)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"
              >
                Śledzenie u przewoźnika
              </a>
            </div>

            <div className="border-t border-gray-100 pt-3">
              <ServiceShipmentProgressBar statusUpper={st} variant={isRepairPath ? "repair" : "supplier"} />
            </div>

            <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
              <button
                type="button"
                disabled={disabled || actionBusy}
                onClick={() => void downloadLabel()}
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
              >
                Pobierz etykietę
              </button>
              <button
                type="button"
                disabled={disabled || actionBusy || terminal}
                onClick={cancelShipment}
                className="w-full rounded-lg border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
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
              <h3 className="text-base font-semibold text-gray-900">
                {isRepairPath ? "Przesyłka do serwisu" : "Przesyłka do dostawcy"}
              </h3>
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
                <p className="text-xs font-medium text-gray-500">Sposób</p>
                <div className="mt-2 flex flex-col gap-2">
                  {SERVICE_METHOD_OPTIONS.map((m) => (
                    <label key={m.value} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="svc-ship-method"
                        checked={method === m.value}
                        onChange={() => setMethod(m.value)}
                        className="text-blue-600"
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500" htmlFor="svc-ship-carrier">
                  Przewoźnik
                </label>
                <select
                  id="svc-ship-carrier"
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
                <label className="block text-sm font-medium text-gray-700" htmlFor="svc-destination">
                  Cel — serwis lub dostawca (adres / nazwa)
                </label>
                <textarea
                  id="svc-destination"
                  value={destinationLine}
                  onChange={(e) => setDestinationLine(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="np. Serwis XYZ, ul. …"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="svc-rma">
                  Numer RMA
                </label>
                <input
                  id="svc-rma"
                  value={rma}
                  onChange={(e) => setRma(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                  placeholder="np. RMA-2026-00123"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="svc-notes">
                  Notatka (opcjonalnie)
                </label>
                <textarea
                  id="svc-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Miejsce odbioru przez kuriera (magazyn / nadanie)</p>
                <p className="mt-0.5 text-xs text-gray-400">Wymagane przy odbiorze u kuriera i punkcie nadania.</p>
                <div className="mt-2 space-y-2">
                  <input
                    value={pickupName}
                    onChange={(e) => setPickupName(e.target.value)}
                    placeholder="Nazwa / osoba kontaktowa"
                    disabled={!requireAddressFields}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                  <input
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    placeholder="Adres odbioru"
                    disabled={!requireAddressFields}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                  <input
                    value={pickupPhone}
                    onChange={(e) => setPickupPhone(e.target.value)}
                    placeholder="Telefon"
                    disabled={!requireAddressFields}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
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
                <label className="text-xs font-medium text-gray-500" htmlFor="svc-pickup-date">
                  Data odbioru
                </label>
                <input
                  id="svc-pickup-date"
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
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
                Utwórz przesyłkę
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
