import api from "./axios";

import type {
  ComplaintServiceShipmentCreatePayload,
  ComplaintShipmentCreatePayload,
  ComplaintShipmentGetResponse,
  ComplaintShipmentRole,
  ComplaintShipmentStatus,
} from "../types/complaintShipment";

const qp = (tenantId: number, warehouseId: number) => ({
  params: { tenant_id: tenantId, warehouse_id: warehouseId },
});

export async function getComplaintShipment(
  complaintId: number,
  tenantId: number,
  warehouseId: number,
): Promise<ComplaintShipmentGetResponse> {
  const res = await api.get<ComplaintShipmentGetResponse>(`/complaints/${complaintId}/shipment`, qp(tenantId, warehouseId));
  return res.data;
}

export async function createComplaintShipment(
  complaintId: number,
  tenantId: number,
  warehouseId: number,
  body: ComplaintShipmentCreatePayload,
): Promise<ComplaintShipmentGetResponse> {
  const res = await api.post<ComplaintShipmentGetResponse>(
    `/complaints/${complaintId}/shipment`,
    body,
    qp(tenantId, warehouseId),
  );
  return res.data;
}

export async function createComplaintServiceShipment(
  complaintId: number,
  tenantId: number,
  warehouseId: number,
  body: ComplaintServiceShipmentCreatePayload,
): Promise<ComplaintShipmentGetResponse> {
  const res = await api.post<ComplaintShipmentGetResponse>(
    `/complaints/${complaintId}/shipment/service`,
    body,
    qp(tenantId, warehouseId),
  );
  return res.data;
}

export async function patchComplaintShipmentStatus(
  complaintId: number,
  tenantId: number,
  warehouseId: number,
  status: ComplaintShipmentStatus,
  role: ComplaintShipmentRole = "CUSTOMER",
): Promise<ComplaintShipmentGetResponse> {
  const res = await api.patch<ComplaintShipmentGetResponse>(
    `/complaints/${complaintId}/shipment`,
    { status },
    { params: { ...qp(tenantId, warehouseId).params, role } },
  );
  return res.data;
}

export function carrierTrackingUrl(carrier: string, trackingNumber: string): string {
  const t = encodeURIComponent(trackingNumber.trim());
  switch (String(carrier).toUpperCase()) {
    case "INPOST":
      return `https://inpost.pl/sledzenie-przesylek?number=${t}`;
    case "DPD":
      return `https://tracktrace.dpd.com.pl/parcelDetails?parcelNumber=${t}`;
    case "DHL":
      return `https://www.dhl.com/pl-pl/home/tracking/tracking-parcel.html?submit=1&tracking-id=${t}`;
    default:
      return `https://www.google.com/search?q=${t}+tracking`;
  }
}

export async function downloadComplaintShipmentLabelBlob(
  complaintId: number,
  tenantId: number,
  warehouseId: number,
  role: ComplaintShipmentRole = "CUSTOMER",
): Promise<Blob> {
  const res = await api.get<Blob>(`/complaints/${complaintId}/shipment/label`, {
    ...qp(tenantId, warehouseId),
    params: { ...qp(tenantId, warehouseId).params, role },
    responseType: "blob",
  });
  return res.data;
}
