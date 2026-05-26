import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Check, ChevronDown, ChevronRight, Circle } from "lucide-react";

import type { ComplaintDetail, ComplaintLineDetail } from "../../types/complaint";
import type { ComplaintShipmentDetail, ComplaintShipmentGetResponse } from "../../types/complaintShipment";
import {
  LINE_OP_BUTTON_LABEL_PL,
  LINE_OP_TIMELINE_LABEL_PL,
  lineOpChainForDecision,
  lineOpKeyToApiAction,
  lineOperationIndex,
  nextLineOperationKey,
  type ComplaintLineFlow,
  type ComplaintLineOperationAction,
  type LineExchangeKind,
  type LineOpKey,
} from "./complaintLineOperations";
import type { ComplaintOrderKind } from "./complaintExchangePrefill";
import ComplaintOutboundShipmentSection from "./ComplaintOutboundShipmentSection";
import ComplaintProductHandlingSection from "./ComplaintProductHandlingSection";
import ComplaintShipmentTransportSection, { type ComplaintShipmentTransportSectionHandle } from "./ComplaintShipmentTransportSection";

export type ComplaintLogisticsBundle = {
  complaintId: number;
  tenantId: number;
  warehouseId: number;
  shipment: ComplaintShipmentDetail | null;
  serviceShipment: ComplaintShipmentDetail | null;
  outboundShipment: ComplaintShipmentDetail | null;
  onShipmentsUpdated: (r: ComplaintShipmentGetResponse) => void;
  onComplaintSynced?: () => void;
  /** Complaint row — adres klienta, logistyka */
  complaintCustomer: {
    customer_name?: string | null;
    customer_address?: string | null;
    customer_phone?: string | null;
    customer_email?: string | null;
    logistics_status?: string | null;
  };
};

type Props = {
  line: ComplaintLineDetail;
  busy: boolean;
  disabled: boolean;
  onOperationAction: (lineId: number, action: ComplaintLineOperationAction) => void;
  onGoExchange: (lineId: number, kind: ComplaintOrderKind) => void;
  onSetExchangeKind: (lineId: number, kind: LineExchangeKind) => void;
  onExchangePickupModeSelected?: () => void;
  onOpenExchangeOrderForm?: (lineId: number, kind: ComplaintOrderKind) => void;
  logistics?: ComplaintLogisticsBundle | null;
  pickupAnchorLineId?: number | null;
  repairLogisticsLineId?: number | null;
  pickupTransportRef?: RefObject<ComplaintShipmentTransportSectionHandle | null>;
};

function isFlow(d: string): d is ComplaintLineFlow {
  return d === "repair" || d === "exchange" || d === "reject" || d === "refund";
}

function PickupAnchorNotice() {
  return (
    <span className="mt-1.5 flex w-full max-w-md items-center rounded-md border border-amber-200/90 bg-amber-50/95 px-2 py-1 text-[10px] font-semibold leading-snug text-amber-950">
      Odbiór realizowany w pierwszej pozycji
    </span>
  );
}

function NextStepHeading({ nextKey }: { nextKey: LineOpKey }) {
  return (
    <p className="mb-2 text-[11px] font-semibold leading-snug text-slate-800">
      Następny krok:{" "}
      <span className="text-blue-900">{LINE_OP_TIMELINE_LABEL_PL[nextKey]}</span>
    </p>
  );
}

function shipmentHasTracking(s: ComplaintShipmentDetail | null | undefined): boolean {
  return Boolean(String(s?.tracking_number ?? "").trim());
}

function trackingSummary(s: ComplaintShipmentDetail | null | undefined): string | null {
  const t = String(s?.tracking_number ?? "").trim();
  if (!t) return null;
  const car = String(s?.carrier ?? "").trim();
  return car ? `${car} · ${t}` : t;
}

/**
 * Krok: nagłówek zawsze widoczny; treść zwijalna gdy krok dotyczy przesyłki z numerem.
 * Numer śledzenia → domyślnie zwinięte; brak numeru → rozwinięte (wymaga działania).
 */
function OperationStepSection({
  stepDomId,
  hasTrackableShipment,
  trackingPresent,
  trackingLabel,
  headerLeft,
  childrenBody,
}: {
  stepDomId: string;
  hasTrackableShipment: boolean;
  trackingPresent: boolean;
  trackingLabel: string | null;
  /** StepGlyph + tytuł (bez treści pod spodem). */
  headerLeft: ReactNode;
  childrenBody: ReactNode;
}) {
  const defaultOpen = !hasTrackableShipment || !trackingPresent;
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const prevTrackedRef = useRef(false);

  const effectiveOpen = openOverride ?? defaultOpen;

  useEffect(() => {
    const now = hasTrackableShipment && trackingPresent;
    if (now && !prevTrackedRef.current) {
      setOpenOverride(null);
    }
    prevTrackedRef.current = now;
  }, [hasTrackableShipment, trackingPresent]);

  const toggle = () => setOpenOverride(!effectiveOpen);

  return (
    <div className="min-w-0">
      {hasTrackableShipment ? (
        <button
          type="button"
          className="flex w-full items-start gap-2 rounded-md text-left text-xs hover:bg-white/70"
          aria-expanded={effectiveOpen}
          aria-controls={`${stepDomId}-panel`}
          id={`${stepDomId}-heading`}
          onClick={toggle}
        >
          <span className="mt-0.5 shrink-0 text-zinc-500" aria-hidden>
            {effectiveOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            {headerLeft}
            {!effectiveOpen && trackingLabel ? (
              <p className="mt-0.5 text-[10px] font-medium text-slate-600">{trackingLabel}</p>
            ) : null}
          </div>
        </button>
      ) : (
        <div className="flex items-start gap-2 text-xs" id={`${stepDomId}-heading`}>
          {headerLeft}
        </div>
      )}
      {(!hasTrackableShipment || effectiveOpen) && (
        <div className="mt-1.5" id={`${stepDomId}-panel`} role="region" aria-labelledby={`${stepDomId}-heading`}>
          {childrenBody}
        </div>
      )}
    </div>
  );
}

function normExchangeKind(raw: string | null | undefined): LineExchangeKind | null {
  const u = String(raw ?? "").toUpperCase();
  if (u === "EXCHANGE" || u === "REPLACEMENT") return u;
  return null;
}

function StepGlyph({ done, upcoming, future }: { done: boolean; upcoming: boolean; future: boolean }) {
  return (
    <span className="mt-0.5 shrink-0" aria-hidden>
      {done ? (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-white">
          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
        </span>
      ) : upcoming ? (
        <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700">
          <Circle className="h-3 w-3 fill-current" />
        </span>
      ) : (
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-300">
          <Circle className="h-3 w-3" />
        </span>
      )}
    </span>
  );
}

function RepairUnifiedFlow({
  line,
  busy,
  disabled,
  onOperationAction,
  logistics,
  pickupAnchorLineId,
  repairLogisticsLineId,
  pickupTransportRef,
}: {
  line: ComplaintLineDetail;
  busy: boolean;
  disabled: boolean;
  onOperationAction: (lineId: number, action: ComplaintLineOperationAction) => void;
  logistics: ComplaintLogisticsBundle;
  pickupAnchorLineId: number | null;
  repairLogisticsLineId: number | null;
  pickupTransportRef?: RefObject<ComplaintShipmentTransportSectionHandle | null>;
}) {
  const chain = lineOpChainForDecision("repair", null);
  const idxLast = lineOperationIndex(chain, line.operation_status);
  const nextKey = nextLineOperationKey(chain, line.operation_status);
  const flowDone = nextKey === null && idxLast >= 0;

  const { complaintId, tenantId, warehouseId, shipment, serviceShipment, outboundShipment, onShipmentsUpdated, onComplaintSynced, complaintCustomer } = logistics;

  const complaintDetailLike = {
    id: complaintId,
    customer_name: complaintCustomer.customer_name,
    customer_address: complaintCustomer.customer_address,
    customer_phone: complaintCustomer.customer_phone,
    customer_email: complaintCustomer.customer_email,
    logistics_status: complaintCustomer.logistics_status,
  } as ComplaintDetail;

  const serviceIdx = chain.indexOf("service_sent");
  const warehouseIdx = chain.indexOf("warehouse_in");

  return (
    <div className="min-w-0 space-y-2 rounded-lg border border-gray-200 bg-white p-2">
      <p className="text-[11px] font-semibold text-gray-800">Naprawa</p>
      <ol className="space-y-2">
        {chain.map((key, i) => {
          const done = idxLast >= i;
          const upcoming = i === idxLast + 1;
          const future = i > idxLast + 1;
          const titleClass =
            done ? "text-green-900" : upcoming ? "text-blue-950" : future ? "text-gray-400" : "text-gray-700";

          const isPickupAnchor = key === "pickup" && line.id === pickupAnchorLineId;
          const isRepairLead = line.id === repairLogisticsLineId;
          const pickupTrackable = isPickupAnchor;
          const pickupTracked = shipmentHasTracking(shipment);
          const serviceTrackable = key === "service_sent" && isRepairLead;
          const serviceTracked = shipmentHasTracking(serviceShipment);
          const outboundTrackable = key === "shipped_customer" && isRepairLead;
          const outboundTracked = shipmentHasTracking(outboundShipment);

          let hasTrackableShipment = false;
          let trackingPresent = false;
          let trackingLabel: string | null = null;
          if (pickupTrackable) {
            hasTrackableShipment = true;
            trackingPresent = pickupTracked;
            trackingLabel = trackingSummary(shipment);
          } else if (serviceTrackable) {
            hasTrackableShipment = true;
            trackingPresent = serviceTracked;
            trackingLabel = trackingSummary(serviceShipment);
          } else if (outboundTrackable) {
            hasTrackableShipment = true;
            trackingPresent = outboundTracked;
            trackingLabel = trackingSummary(outboundShipment);
          }

          const headerLeft = (
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <StepGlyph done={done} upcoming={upcoming} future={future} />
              <p className={`min-w-0 flex-1 font-medium leading-tight ${titleClass}`}>{LINE_OP_TIMELINE_LABEL_PL[key]}</p>
            </div>
          );

          const childrenBody = (
            <>
              {key === "pickup" ? (
                isPickupAnchor ? (
                  <ComplaintShipmentTransportSection
                    ref={pickupTransportRef}
                    complaintId={complaintId}
                    tenantId={tenantId}
                    warehouseId={warehouseId}
                    data={complaintDetailLike}
                    shipment={shipment}
                    onShipmentUpdated={onShipmentsUpdated}
                    onComplaintSynced={onComplaintSynced}
                    disabled={disabled}
                    embed
                  />
                ) : (
                  <PickupAnchorNotice />
                )
              ) : null}

              {key === "warehouse_in" ? (
                <div className="space-y-1.5">
                  {idxLast >= warehouseIdx ? (
                    <p className="text-[10px] font-medium text-green-800">Przyjęto na magazyn</p>
                  ) : (
                    <button
                      type="button"
                      disabled={disabled || busy}
                      onClick={() => onOperationAction(line.id, lineOpKeyToApiAction("warehouse_in"))}
                      className="w-full rounded-md border border-emerald-600 bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-950 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Oznacz jako przyjęte
                    </button>
                  )}
                  <p className="text-[10px] text-gray-500">
                    Ręczne oznaczenie lub automatyczny zapis z WMS — ten sam etap operacji.
                  </p>
                </div>
              ) : null}

              {key === "service_sent" && isRepairLead ? (
                <div className="space-y-1.5">
                  <ComplaintProductHandlingSection
                    complaintId={complaintId}
                    tenantId={tenantId}
                    warehouseId={warehouseId}
                    showRepairPath
                    serviceShipment={serviceShipment}
                    onServiceShipmentResponse={onShipmentsUpdated}
                    disabled={disabled}
                    embed
                  />
                  {(upcoming || idxLast === serviceIdx) && !flowDone && idxLast < chain.indexOf("repair_done") ? (
                    <button
                      type="button"
                      disabled={disabled || busy}
                      onClick={() => onOperationAction(line.id, lineOpKeyToApiAction("service_sent"))}
                      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Naprawa własna (pomiń zewnętrzny serwis)
                    </button>
                  ) : null}
                </div>
              ) : null}

              {key === "service_sent" && !isRepairLead ? (
                <p className="text-[10px] text-gray-500">Szczegóły serwisu i przesyłki — przy pierwszej pozycji z naprawą na liście.</p>
              ) : null}

              {key === "shipped_customer" && isRepairLead ? (
                <ComplaintOutboundShipmentSection
                  complaintId={complaintId}
                  tenantId={tenantId}
                  warehouseId={warehouseId}
                  outboundShipment={outboundShipment}
                  onUpdated={onShipmentsUpdated}
                  disabled={disabled}
                  embed
                />
              ) : null}

              {key === "shipped_customer" && !isRepairLead ? (
                <p className="text-[10px] text-gray-500">Nadanie do klienta — jak przy pierwszej pozycji z naprawą.</p>
              ) : null}

              {key === "repair_done" ? (
                <p className="text-[10px] text-gray-500">Potwierdzenie etapu — przycisk w sekcji u dołu bloku.</p>
              ) : null}
            </>
          );

          return (
            <li key={key} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-2">
              <OperationStepSection
                stepDomId={`repair-${line.id}-${key}`}
                hasTrackableShipment={hasTrackableShipment}
                trackingPresent={trackingPresent}
                trackingLabel={trackingLabel}
                headerLeft={headerLeft}
                childrenBody={childrenBody}
              />
            </li>
          );
        })}
      </ol>

      {flowDone ? (
        <p className="text-[11px] font-medium text-green-800">Przepływ naprawy dla tej pozycji — zakończony.</p>
      ) : null}

      {nextKey && !flowDone ? (
        <div className="border-t border-gray-100 pt-2">
          <NextStepHeading nextKey={nextKey} />
          {nextKey === "warehouse_in" ? (
            <p className="text-[10px] text-gray-600">
              Potwierdź przyjęcie przyciskiem „Oznacz jako przyjęte” w sekcji kroku powyżej.
            </p>
          ) : nextKey === "service_sent" ? (
            <div className="space-y-1.5">
              {serviceShipment ? (
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => onOperationAction(line.id, lineOpKeyToApiAction("service_sent"))}
                  className="w-full rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {LINE_OP_BUTTON_LABEL_PL.service_sent}
                </button>
              ) : null}
            </div>
          ) : nextKey === "pickup" ? (
            <button
              type="button"
              disabled={disabled || busy || !shipment}
              title={!shipment ? "Najpierw zamów odbiór kuriera powyżej." : undefined}
              onClick={() => onOperationAction(line.id, lineOpKeyToApiAction("pickup"))}
              className="w-full rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {LINE_OP_BUTTON_LABEL_PL.pickup}
            </button>
          ) : nextKey === "repair_done" ? (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => onOperationAction(line.id, lineOpKeyToApiAction("repair_done"))}
              className="w-full rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {LINE_OP_BUTTON_LABEL_PL.repair_done}
            </button>
          ) : nextKey === "shipped_customer" ? (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => onOperationAction(line.id, lineOpKeyToApiAction("shipped_customer"))}
              className="w-full rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Wyślij do klienta — potwierdź etap
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => onOperationAction(line.id, lineOpKeyToApiAction(nextKey))}
              className="w-full rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {LINE_OP_BUTTON_LABEL_PL[nextKey]}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RejectUnifiedFlow({
  line,
  busy,
  disabled,
  onOperationAction,
  logistics,
  pickupAnchorLineId,
  pickupTransportRef,
}: {
  line: ComplaintLineDetail;
  busy: boolean;
  disabled: boolean;
  onOperationAction: (lineId: number, action: ComplaintLineOperationAction) => void;
  logistics: ComplaintLogisticsBundle;
  pickupAnchorLineId: number | null;
  pickupTransportRef?: RefObject<ComplaintShipmentTransportSectionHandle | null>;
}) {
  const chain = lineOpChainForDecision("reject", null);
  const idxLast = lineOperationIndex(chain, line.operation_status);
  const nextKey = nextLineOperationKey(chain, line.operation_status);
  const flowDone = nextKey === null && idxLast >= 0;

  const { complaintId, tenantId, warehouseId, shipment, onShipmentsUpdated, onComplaintSynced, complaintCustomer } = logistics;

  const complaintDetailLike = {
    id: complaintId,
    customer_name: complaintCustomer.customer_name,
    customer_address: complaintCustomer.customer_address,
    customer_phone: complaintCustomer.customer_phone,
    customer_email: complaintCustomer.customer_email,
    logistics_status: complaintCustomer.logistics_status,
  } as ComplaintDetail;

  return (
    <div className="min-w-0 space-y-2 rounded-lg border border-gray-200 bg-white p-2">
      <p className="text-[11px] font-semibold text-gray-800">Odrzucenie — przepływ logistyczny</p>
      <ol className="space-y-2">
        {chain.map((key, i) => {
          const done = idxLast >= i;
          const upcoming = i === idxLast + 1;
          const future = i > idxLast + 1;
          const titleClass =
            done ? "text-green-900" : upcoming ? "text-blue-950" : future ? "text-gray-400" : "text-gray-700";
          const isPickupAnchor = key === "pickup" && line.id === pickupAnchorLineId;
          const pickupTrackable = isPickupAnchor;
          const pickupTracked = shipmentHasTracking(shipment);

          const headerLeft = (
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <StepGlyph done={done} upcoming={upcoming} future={future} />
              <p className={`min-w-0 flex-1 font-medium leading-tight ${titleClass}`}>{LINE_OP_TIMELINE_LABEL_PL[key]}</p>
            </div>
          );

          const childrenBody = (
            <>
              {key === "pickup" && isPickupAnchor ? (
                <ComplaintShipmentTransportSection
                  ref={pickupTransportRef}
                  complaintId={complaintId}
                  tenantId={tenantId}
                  warehouseId={warehouseId}
                  data={complaintDetailLike}
                  shipment={shipment}
                  onShipmentUpdated={onShipmentsUpdated}
                  onComplaintSynced={onComplaintSynced}
                  disabled={disabled}
                  embed
                />
              ) : null}
              {key === "pickup" && !isPickupAnchor ? <PickupAnchorNotice /> : null}
              {key === "return_customer" ? (
                <p className="text-[10px] text-gray-500">Zwrot do klienta — potwierdzenie przyciskiem poniżej.</p>
              ) : null}
            </>
          );

          return (
            <li key={key} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-2">
              <OperationStepSection
                stepDomId={`reject-${line.id}-${key}`}
                hasTrackableShipment={pickupTrackable}
                trackingPresent={pickupTracked}
                trackingLabel={trackingSummary(shipment)}
                headerLeft={headerLeft}
                childrenBody={childrenBody}
              />
            </li>
          );
        })}
      </ol>
      {flowDone ? (
        <p className="text-[11px] font-medium text-green-800">Przepływ dla odrzucenia — zakończony.</p>
      ) : null}
      {nextKey && !flowDone ? (
        <div className="border-t border-gray-100 pt-2">
          <NextStepHeading nextKey={nextKey} />
          {nextKey === "pickup" ? (
            <button
              type="button"
              disabled={disabled || busy || !shipment}
              title={!shipment ? "Najpierw zamów odbiór." : undefined}
              onClick={() => onOperationAction(line.id, lineOpKeyToApiAction("pickup"))}
              className="w-full rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {LINE_OP_BUTTON_LABEL_PL.pickup}
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => onOperationAction(line.id, lineOpKeyToApiAction(nextKey))}
              className="w-full rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {LINE_OP_BUTTON_LABEL_PL[nextKey]}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RefundUnifiedFlow({
  line,
  busy,
  disabled,
  onOperationAction,
  logistics,
  pickupAnchorLineId,
  pickupTransportRef,
}: {
  line: ComplaintLineDetail;
  busy: boolean;
  disabled: boolean;
  onOperationAction: (lineId: number, action: ComplaintLineOperationAction) => void;
  logistics: ComplaintLogisticsBundle;
  pickupAnchorLineId: number | null;
  pickupTransportRef?: RefObject<ComplaintShipmentTransportSectionHandle | null>;
}) {
  const chain = lineOpChainForDecision("refund", null);
  const idxLast = lineOperationIndex(chain, line.operation_status);
  const nextKey = nextLineOperationKey(chain, line.operation_status);
  const flowDone = nextKey === null && idxLast >= 0;
  const warehouseIdx = chain.indexOf("warehouse_in");

  const { complaintId, tenantId, warehouseId, shipment, onShipmentsUpdated, onComplaintSynced, complaintCustomer } = logistics;

  const complaintDetailLike = {
    id: complaintId,
    customer_name: complaintCustomer.customer_name,
    customer_address: complaintCustomer.customer_address,
    customer_phone: complaintCustomer.customer_phone,
    customer_email: complaintCustomer.customer_email,
    logistics_status: complaintCustomer.logistics_status,
  } as ComplaintDetail;

  return (
    <div className="min-w-0 space-y-2 rounded-lg border border-gray-200 bg-white p-2">
      <p className="text-[11px] font-semibold text-gray-800">Zwrot — przepływ operacyjny</p>
      <ol className="space-y-2">
        {chain.map((key, i) => {
          const done = idxLast >= i;
          const upcoming = i === idxLast + 1;
          const future = i > idxLast + 1;
          const titleClass =
            done ? "text-green-900" : upcoming ? "text-blue-950" : future ? "text-gray-400" : "text-gray-700";

          const isPickupAnchor = key === "pickup" && line.id === pickupAnchorLineId;
          const pickupTrackable = isPickupAnchor;
          const pickupTracked = shipmentHasTracking(shipment);

          const headerLeft = (
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <StepGlyph done={done} upcoming={upcoming} future={future} />
              <p className={`min-w-0 flex-1 font-medium leading-tight ${titleClass}`}>{LINE_OP_TIMELINE_LABEL_PL[key]}</p>
            </div>
          );

          const childrenBody = (
            <>
              {key === "pickup" && isPickupAnchor ? (
                <ComplaintShipmentTransportSection
                  ref={pickupTransportRef}
                  complaintId={complaintId}
                  tenantId={tenantId}
                  warehouseId={warehouseId}
                  data={complaintDetailLike}
                  shipment={shipment}
                  onShipmentUpdated={onShipmentsUpdated}
                  onComplaintSynced={onComplaintSynced}
                  disabled={disabled}
                  embed
                />
              ) : null}
              {key === "pickup" && !isPickupAnchor ? <PickupAnchorNotice /> : null}
              {key === "warehouse_in" ? (
                <div className="space-y-1.5">
                  {idxLast >= warehouseIdx ? (
                    <p className="text-[10px] font-medium text-green-800">Przyjęto na magazyn</p>
                  ) : (
                    <button
                      type="button"
                      disabled={disabled || busy}
                      onClick={() => onOperationAction(line.id, lineOpKeyToApiAction("warehouse_in"))}
                      className="w-full rounded-md border border-emerald-600 bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-950 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Oznacz jako przyjęte
                    </button>
                  )}
                </div>
              ) : null}
              {key === "refund_done" ? (
                <p className="text-[10px] text-gray-500">Po rozliczeniu finansowym zatwierdź etap poniżej.</p>
              ) : null}
            </>
          );

          return (
            <li key={key} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-2">
              <OperationStepSection
                stepDomId={`refund-${line.id}-${key}`}
                hasTrackableShipment={pickupTrackable}
                trackingPresent={pickupTracked}
                trackingLabel={trackingSummary(shipment)}
                headerLeft={headerLeft}
                childrenBody={childrenBody}
              />
            </li>
          );
        })}
      </ol>
      {flowDone ? (
        <p className="text-[11px] font-medium text-green-800">Zwrot dla tej pozycji zakończony</p>
      ) : null}
      {nextKey && !flowDone ? (
        <div className="border-t border-gray-100 pt-2">
          <NextStepHeading nextKey={nextKey} />
          {nextKey === "warehouse_in" ? (
            <p className="text-[10px] text-gray-600">
              Potwierdź przyjęcie przyciskiem „Oznacz jako przyjęte” w sekcji kroku powyżej.
            </p>
          ) : nextKey === "pickup" ? (
            <button
              type="button"
              disabled={disabled || busy || !shipment}
              title={!shipment ? "Najpierw zamów odbiór." : undefined}
              onClick={() => onOperationAction(line.id, lineOpKeyToApiAction("pickup"))}
              className="w-full rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {LINE_OP_BUTTON_LABEL_PL.pickup}
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => onOperationAction(line.id, lineOpKeyToApiAction(nextKey))}
              className="w-full rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {LINE_OP_BUTTON_LABEL_PL[nextKey]}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function ComplaintLineOperationsBlock({
  line,
  busy,
  disabled,
  onOperationAction,
  onGoExchange,
  onSetExchangeKind,
  onExchangePickupModeSelected,
  onOpenExchangeOrderForm,
  logistics,
  pickupAnchorLineId = null,
  repairLogisticsLineId = null,
  pickupTransportRef,
}: Props) {
  const dec = (line.decision ?? "").trim().toLowerCase();
  const ek = normExchangeKind(line.exchange_kind);

  const [exchangeMode, setExchangeMode] = useState<"EXCHANGE_PICKUP" | "DELIVERY_ONLY" | null>(null);

  useEffect(() => {
    if (ek === "EXCHANGE") setExchangeMode("EXCHANGE_PICKUP");
    else if (ek === "REPLACEMENT") setExchangeMode("DELIVERY_ONLY");
    else setExchangeMode(null);
  }, [ek, line.id]);

  const selectExchangeMode = useCallback(
    (mode: "EXCHANGE_PICKUP" | "DELIVERY_ONLY") => {
      setExchangeMode(mode);
      const apiKind = mode === "EXCHANGE_PICKUP" ? "EXCHANGE" : "REPLACEMENT";
      onSetExchangeKind(line.id, apiKind);
      if (mode === "EXCHANGE_PICKUP") onExchangePickupModeSelected?.();
      onOpenExchangeOrderForm?.(line.id, apiKind);
    },
    [line.id, onExchangePickupModeSelected, onOpenExchangeOrderForm, onSetExchangeKind],
  );

  if (!dec || !isFlow(dec)) return null;

  if (dec === "refund" && logistics) {
    return (
      <RefundUnifiedFlow
        line={line}
        busy={busy}
        disabled={disabled}
        onOperationAction={onOperationAction}
        logistics={logistics}
        pickupAnchorLineId={pickupAnchorLineId}
        pickupTransportRef={pickupTransportRef}
      />
    );
  }

  if (dec === "repair" && logistics) {
    return (
      <RepairUnifiedFlow
        line={line}
        busy={busy}
        disabled={disabled}
        onOperationAction={onOperationAction}
        logistics={logistics}
        pickupAnchorLineId={pickupAnchorLineId}
        repairLogisticsLineId={repairLogisticsLineId}
        pickupTransportRef={pickupTransportRef}
      />
    );
  }

  if (dec === "reject" && logistics) {
    return (
      <RejectUnifiedFlow
        line={line}
        busy={busy}
        disabled={disabled}
        onOperationAction={onOperationAction}
        logistics={logistics}
        pickupAnchorLineId={pickupAnchorLineId}
        pickupTransportRef={pickupTransportRef}
      />
    );
  }

  if (dec === "exchange") {
    return (
      <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-2">
        {!ek ? (
          <>
            <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/50 p-2">
              <div className="space-y-1.5">
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => selectExchangeMode("EXCHANGE_PICKUP")}
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                    exchangeMode === "EXCHANGE_PICKUP"
                      ? "border-blue-500 bg-blue-100 text-blue-950"
                      : "border-amber-200 bg-white text-gray-900 hover:bg-amber-50"
                  }`}
                >
                  <span className="font-semibold">Wymiana + odbiór</span>
                  <span className="mt-0.5 block text-[11px] text-gray-600">
                    Dostawa do klienta oraz odbiór reklamowanego towaru.
                  </span>
                </button>
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => selectExchangeMode("DELIVERY_ONLY")}
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                    exchangeMode === "DELIVERY_ONLY"
                      ? "border-blue-500 bg-blue-100 text-blue-950"
                      : "border-amber-200 bg-white text-gray-900 hover:bg-amber-50"
                  }`}
                >
                  <span className="font-semibold">Tylko dostawa</span>
                  <span className="mt-0.5 block text-[11px] text-gray-600">
                    Nowy towar do klienta bez odbioru zwrotu przy tej pozycji.
                  </span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <ExchangeOperationsBody
            line={line}
            exchangeKind={ek}
            busy={busy}
            disabled={disabled}
            onOperationAction={onOperationAction}
            onGoExchange={onGoExchange}
            logistics={logistics}
            pickupAnchorLineId={pickupAnchorLineId}
            pickupTransportRef={pickupTransportRef}
          />
        )}
      </div>
    );
  }

  const chain = lineOpChainForDecision(dec, null);
  const idxLast = lineOperationIndex(chain, line.operation_status);
  const nextKey = nextLineOperationKey(chain, line.operation_status);
  const flowDone = nextKey === null && idxLast >= 0;

  return (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-2">
      <ol className="space-y-1.5">
        {chain.map((key, i) => {
          const done = idxLast >= i;
          const upcoming = i === idxLast + 1;
          const future = i > idxLast + 1;
          return (
            <li key={key} className="flex gap-2 text-xs">
              <StepGlyph done={done} upcoming={upcoming} future={future} />
              <div className="min-w-0 flex-1">
                <p
                  className={`font-medium leading-tight ${
                    done ? "text-green-900" : upcoming ? "text-blue-950" : future ? "text-gray-400" : "text-gray-700"
                  }`}
                >
                  {LINE_OP_TIMELINE_LABEL_PL[key]}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {flowDone ? (
        <p className="mt-2 text-[11px] font-medium text-green-800">Przepływ operacyjny dla tej decyzji — zakończony.</p>
      ) : null}

      {nextKey && !flowDone ? (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <NextStepHeading nextKey={nextKey} />
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => onOperationAction(line.id, lineOpKeyToApiAction(nextKey))}
            className="w-full rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {LINE_OP_BUTTON_LABEL_PL[nextKey]}
          </button>
        </div>
      ) : null}
    </div>
  );
}

type ExchangeBodyProps = {
  line: ComplaintLineDetail;
  exchangeKind: LineExchangeKind;
  busy: boolean;
  disabled: boolean;
  onOperationAction: (lineId: number, action: ComplaintLineOperationAction) => void;
  onGoExchange: (lineId: number, kind: ComplaintOrderKind) => void;
  logistics?: ComplaintLogisticsBundle | null;
  pickupAnchorLineId?: number | null;
  pickupTransportRef?: RefObject<ComplaintShipmentTransportSectionHandle | null>;
};

function ExchangeOperationsBody({
  line,
  exchangeKind,
  busy,
  disabled,
  onOperationAction,
  onGoExchange,
  logistics,
  pickupAnchorLineId = null,
  pickupTransportRef,
}: ExchangeBodyProps) {
  const chain = lineOpChainForDecision("exchange", exchangeKind);
  const idxLast = lineOperationIndex(chain, line.operation_status);
  const nextKey = nextLineOperationKey(chain, line.operation_status);
  const flowDone = nextKey === null && idxLast >= 0;
  const orderKind: ComplaintOrderKind = exchangeKind === "REPLACEMENT" ? "REPLACEMENT" : "EXCHANGE";

  const complaintDetailLike = logistics
    ? ({
        id: logistics.complaintId,
        customer_name: logistics.complaintCustomer.customer_name,
        customer_address: logistics.complaintCustomer.customer_address,
        customer_phone: logistics.complaintCustomer.customer_phone,
        customer_email: logistics.complaintCustomer.customer_email,
        logistics_status: logistics.complaintCustomer.logistics_status,
      } as ComplaintDetail)
    : null;

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
        {["1. Odbiór", "2. Generuj zamówienie", "3. Wysyłka"].map((step, idx) => {
          const active = idx <= idxLast + 1;
          return (
            <div
              key={step}
              className={`rounded-md border px-2 py-1.5 text-center ${
                active ? "border-blue-300 bg-blue-50 text-blue-900" : "border-gray-200 bg-gray-50 text-gray-500"
              }`}
            >
              {step}
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] font-medium text-amber-900">
        Tryb: {exchangeKind === "EXCHANGE" ? "Wymiana + odbiór" : "Tylko dostawa"}
      </p>
      <p className="mt-1 text-[10px] text-gray-500">
        Kolejne kroki: zamówienie wymiany i operacje poniżej. Odbiór kuriera — w pierwszym kroku listy.
      </p>

      <ol className="mt-2 space-y-2">
        {chain.map((key, i) => {
          const done = idxLast >= i;
          const upcoming = i === idxLast + 1;
          const future = i > idxLast + 1;
          const titleClass =
            done ? "text-green-900" : upcoming ? "text-blue-950" : future ? "text-gray-400" : "text-gray-700";

          const isPickupAnchorExchange =
            key === "pickup" && exchangeKind === "EXCHANGE" && logistics && complaintDetailLike && line.id === pickupAnchorLineId;
          const showShipOutPanel =
            key === "ship_out" &&
            logistics &&
            (exchangeKind === "REPLACEMENT" || (exchangeKind === "EXCHANGE" && line.id === pickupAnchorLineId));

          let hasTrackableShipment = false;
          let trackingPresent = false;
          let trackingLabel: string | null = null;
          if (isPickupAnchorExchange) {
            hasTrackableShipment = true;
            trackingPresent = shipmentHasTracking(logistics.shipment);
            trackingLabel = trackingSummary(logistics.shipment);
          } else if (showShipOutPanel) {
            hasTrackableShipment = true;
            trackingPresent = shipmentHasTracking(logistics.outboundShipment);
            trackingLabel = trackingSummary(logistics.outboundShipment);
          }

          const headerLeft = (
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <StepGlyph done={done} upcoming={upcoming} future={future} />
              <p className={`min-w-0 flex-1 font-medium leading-tight ${titleClass}`}>{LINE_OP_TIMELINE_LABEL_PL[key]}</p>
            </div>
          );

          const childrenBody = (
            <>
              {isPickupAnchorExchange ? (
                <ComplaintShipmentTransportSection
                  ref={pickupTransportRef}
                  complaintId={logistics!.complaintId}
                  tenantId={logistics!.tenantId}
                  warehouseId={logistics!.warehouseId}
                  data={complaintDetailLike!}
                  shipment={logistics!.shipment}
                  onShipmentUpdated={logistics!.onShipmentsUpdated}
                  onComplaintSynced={logistics!.onComplaintSynced}
                  disabled={disabled}
                  embed
                />
              ) : null}
              {key === "pickup" && exchangeKind === "EXCHANGE" && !isPickupAnchorExchange ? <PickupAnchorNotice /> : null}
              {showShipOutPanel ? (
                <ComplaintOutboundShipmentSection
                  complaintId={logistics!.complaintId}
                  tenantId={logistics!.tenantId}
                  warehouseId={logistics!.warehouseId}
                  outboundShipment={logistics!.outboundShipment}
                  onUpdated={logistics!.onShipmentsUpdated}
                  disabled={disabled}
                  embed
                />
              ) : key === "ship_out" ? (
                <p className="text-[10px] text-gray-500">Nadanie do klienta</p>
              ) : null}
              {key === "order_placed" ? (
                <p className="text-[10px] text-gray-500">Utworzenie zamówienia</p>
              ) : null}
            </>
          );

          return (
            <li key={key} className="rounded-lg border border-zinc-100 bg-zinc-50/40 p-2">
              <OperationStepSection
                stepDomId={`exch-${line.id}-${key}`}
                hasTrackableShipment={hasTrackableShipment}
                trackingPresent={trackingPresent}
                trackingLabel={trackingLabel}
                headerLeft={headerLeft}
                childrenBody={childrenBody}
              />
            </li>
          );
        })}
      </ol>

      {flowDone ? (
        <p className="mt-2 text-[11px] font-medium text-green-800">Wymiana dla tej pozycji — zakończona.</p>
      ) : null}

      {nextKey && !flowDone ? (
        <div className="mt-2 border-t border-gray-100 pt-2 space-y-1.5">
          <NextStepHeading nextKey={nextKey} />
          {nextKey === "order_placed" ? (
            <>
              <p className="text-[11px] text-gray-700">
                Otwórz formularz zamówienia — wypełnimy klienta i pozycję z reklamacji; przed zapisem możesz zmienić
                produkt i adres.
              </p>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => onGoExchange(line.id, orderKind)}
                className="w-full rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {orderKind === "EXCHANGE"
                  ? "Otwórz formularz: dostawa + odbiór (wymiana)"
                  : "Otwórz formularz: tylko dostawa"}
              </button>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => onOperationAction(line.id, lineOpKeyToApiAction("order_placed"))}
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                {LINE_OP_BUTTON_LABEL_PL.order_placed}
              </button>
            </>
          ) : nextKey === "pickup" && exchangeKind === "EXCHANGE" ? (
            <button
              type="button"
              disabled={disabled || busy || !logistics?.shipment}
              title={!logistics?.shipment ? "Najpierw zamów odbiór w kroku powyżej (lub u pierwszej pozycji)." : undefined}
              onClick={() => onOperationAction(line.id, lineOpKeyToApiAction("pickup"))}
              className="w-full rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {LINE_OP_BUTTON_LABEL_PL.pickup}
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => onOperationAction(line.id, lineOpKeyToApiAction(nextKey))}
              className="w-full rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {LINE_OP_BUTTON_LABEL_PL[nextKey]}
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
