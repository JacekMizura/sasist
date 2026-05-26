from datetime import date, datetime

from typing import List, Literal, Optional



from pydantic import BaseModel, Field



ComplaintShipmentMethod = Literal["COURIER_PICKUP", "DROP_OFF", "NO_RETURN"]

ComplaintShipmentCarrier = Literal["INPOST", "DPD", "DHL"]

ComplaintShipmentRole = Literal["CUSTOMER", "SERVICE", "OUTBOUND"]

ComplaintShipmentBusinessType = Literal["EXCHANGE", "REPLACEMENT"]

ComplaintShipmentFulfillmentMode = Literal["DELIVERY_AND_PICKUP", "DELIVERY_ONLY"]

ComplaintShipmentStatus = Literal[

    "ORDERED",

    "PICKED_UP",

    "IN_TRANSIT",

    "DELIVERED",

    "IN_SERVICE",

    "RETURNING",

    "RETURNED",

    "CANCELLED",

]


ComplaintShipmentDirection = Literal["INBOUND", "OUTBOUND"]

# PICKUP = kurier odbiera od nadawcy; DELIVERY = nadanie do odbiorcy; SERVICE_FORWARD = do serwisu/dostawcy
ComplaintShipmentFlowType = Literal["PICKUP", "DROP_OFF", "NO_RETURN", "DELIVERY", "SERVICE_FORWARD"]





class ComplaintShipmentEventRead(BaseModel):

    id: int

    kind: str

    title: str

    created_at: Optional[datetime] = None





class ComplaintShipmentCreate(BaseModel):

    method: ComplaintShipmentMethod

    carrier: ComplaintShipmentCarrier

    pickup_name: Optional[str] = None

    pickup_address: Optional[str] = None

    pickup_phone: Optional[str] = None

    pickup_email: Optional[str] = None

    pickup_date: Optional[date] = None

    notes: Optional[str] = None





class ComplaintServiceShipmentCreate(BaseModel):

    """Wysyłka do serwisu / dostawcy — jak kurier, z miejscem docelowym i RMA."""



    method: ComplaintShipmentMethod = "COURIER_PICKUP"

    carrier: ComplaintShipmentCarrier

    destination_line: str = Field(..., min_length=1)

    service_rma: str = Field(..., min_length=1)

    pickup_name: Optional[str] = None

    pickup_address: Optional[str] = None

    pickup_phone: Optional[str] = None

    pickup_email: Optional[str] = None

    pickup_date: Optional[date] = None

    notes: Optional[str] = None





class ComplaintShipmentPatch(BaseModel):

    status: ComplaintShipmentStatus





class ComplaintShipmentDetail(BaseModel):

    id: int

    complaint_id: int

    shipment_role: ComplaintShipmentRole

    #: INBOUND = zwrot/odbiór w kierunku magazynu; OUTBOUND = nadanie od magazynu (w tym do klienta lub serwisu).
    direction: ComplaintShipmentDirection = "INBOUND"

    #: Oś czasu i integracje — np. PICKUP przy odbiorze od klienta kurierem.
    flow_type: ComplaintShipmentFlowType = "PICKUP"

    shipment_business_type: Optional[str] = None

    fulfillment_mode: Optional[str] = None

    method: str

    carrier: str

    status: str

    tracking_number: str

    label_url: Optional[str] = None

    pickup_date: Optional[date] = None

    pickup_name: Optional[str] = None

    pickup_address: Optional[str] = None

    pickup_phone: Optional[str] = None

    pickup_email: Optional[str] = None

    service_rma: Optional[str] = None

    destination_line: Optional[str] = None

    notes: Optional[str] = None

    created_at: Optional[datetime] = None

    events: List[ComplaintShipmentEventRead] = Field(default_factory=list)





class ComplaintShipmentGetResponse(BaseModel):

    shipment: Optional[ComplaintShipmentDetail] = None

    service_shipment: Optional[ComplaintShipmentDetail] = None

    outbound_shipment: Optional[ComplaintShipmentDetail] = None

