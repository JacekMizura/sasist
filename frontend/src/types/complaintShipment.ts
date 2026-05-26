export type ComplaintShipmentMethod = "COURIER_PICKUP" | "DROP_OFF" | "NO_RETURN";



export type ComplaintShipmentCarrier = "INPOST" | "DPD" | "DHL";



export type ComplaintShipmentRole = "CUSTOMER" | "SERVICE" | "OUTBOUND";

export type ComplaintShipmentDirection = "INBOUND" | "OUTBOUND";

export type ComplaintShipmentFlowType = "PICKUP" | "DROP_OFF" | "NO_RETURN" | "DELIVERY" | "SERVICE_FORWARD";



export type ComplaintShipmentStatus =

  | "ORDERED"

  | "PICKED_UP"

  | "IN_TRANSIT"

  | "DELIVERED"

  | "IN_SERVICE"

  | "RETURNING"

  | "RETURNED"

  | "CANCELLED";



export type ComplaintShipmentEvent = {

  id: number;

  kind: string;

  title: string;

  created_at?: string | null;

};



export type ComplaintShipmentDetail = {

  id: number;

  complaint_id: number;

  shipment_role: ComplaintShipmentRole;

  direction?: ComplaintShipmentDirection;

  flow_type?: ComplaintShipmentFlowType;

  shipment_business_type?: string | null;

  fulfillment_mode?: string | null;

  method: string;

  carrier: string;

  status: string;

  tracking_number: string;

  label_url?: string | null;

  pickup_date?: string | null;

  pickup_name?: string | null;

  pickup_address?: string | null;

  pickup_phone?: string | null;

  pickup_email?: string | null;

  service_rma?: string | null;

  destination_line?: string | null;

  notes?: string | null;

  created_at?: string | null;

  events: ComplaintShipmentEvent[];

};



export type ComplaintShipmentGetResponse = {

  shipment: ComplaintShipmentDetail | null;

  service_shipment: ComplaintShipmentDetail | null;

  outbound_shipment?: ComplaintShipmentDetail | null;

};



export type ComplaintShipmentCreatePayload = {

  method: ComplaintShipmentMethod;

  carrier: ComplaintShipmentCarrier;

  pickup_name?: string | null;

  pickup_address?: string | null;

  pickup_phone?: string | null;

  pickup_email?: string | null;

  pickup_date?: string | null;

  notes?: string | null;

};



export type ComplaintServiceShipmentCreatePayload = {

  method?: ComplaintShipmentMethod;

  carrier: ComplaintShipmentCarrier;

  destination_line: string;

  service_rma: string;

  pickup_name?: string | null;

  pickup_address?: string | null;

  pickup_phone?: string | null;

  pickup_email?: string | null;

  pickup_date?: string | null;

  notes?: string | null;

};

