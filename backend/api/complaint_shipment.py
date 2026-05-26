"""

Complaint shipments: panel-only MVP (mock tracking, generated label PDF, no carrier APIs).

CUSTOMER = zwrot od klienta; SERVICE = nadanie do serwisu / dostawcy.

"""



from __future__ import annotations



import secrets

import string

from datetime import datetime

from io import BytesIO

from typing import Optional, Set



from fastapi import APIRouter, Depends, HTTPException, Query

from fastapi.responses import Response

from reportlab.lib.units import mm

from reportlab.pdfgen import canvas

from sqlalchemy.orm import Session, joinedload



from ..database import get_db

from ..models.complaint import Complaint

from ..services.complaint_audit import append_complaint_audit_event
from ..services.complaint_event_log import record_shipment_status_transition

from ..models.complaint_shipment import ComplaintShipment, ComplaintShipmentEvent

from ..schemas.complaint_shipment import (

    ComplaintServiceShipmentCreate,

    ComplaintShipmentCreate,

    ComplaintShipmentDetail,

    ComplaintShipmentEventRead,

    ComplaintShipmentGetResponse,

    ComplaintShipmentPatch,

)



router = APIRouter(prefix="/complaints", tags=["Complaint shipments"])



ALLOWED_METHODS: Set[str] = {"COURIER_PICKUP", "DROP_OFF", "NO_RETURN"}

ALLOWED_CARRIERS: Set[str] = {"INPOST", "DPD", "DHL"}



ROLE_CUSTOMER = "CUSTOMER"

ROLE_SERVICE = "SERVICE"

ROLE_OUTBOUND = "OUTBOUND"


def _shipment_direction_and_flow(role: str, method: Optional[str]) -> tuple[str, str]:
    """Kierunek względem magazynu + typ przepływu (API — bez nowych kolumn w DB)."""
    r = (role or ROLE_CUSTOMER).strip().upper()
    m = (method or "").strip().upper()
    if r == ROLE_OUTBOUND:
        return "OUTBOUND", "DELIVERY"
    if r == ROLE_SERVICE:
        return "OUTBOUND", "SERVICE_FORWARD"
    if m == "COURIER_PICKUP":
        return "INBOUND", "PICKUP"
    if m == "DROP_OFF":
        return "INBOUND", "DROP_OFF"
    return "INBOUND", "NO_RETURN"


def _sync_complaint_logistics_after_inbound_delivered(db: Session, complaint_id: int) -> None:
    """Po dostawie zwrotu od klienta — etap logistyki: przyjęto do inspekcji (nie dotyka complaint.status)."""
    c = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not c:
        return
    raw = str(getattr(c, "logistics_status", None) or "").strip().upper()
    allowed_before = frozenset({"WAITING_FOR_ITEM", "RECEIVED", ""})
    if raw in allowed_before:
        c.logistics_status = "IN_INSPECTION"
        db.add(c)


ORDERED = "ORDERED"

PICKED_UP = "PICKED_UP"

IN_TRANSIT = "IN_TRANSIT"

DELIVERED = "DELIVERED"

IN_SERVICE = "IN_SERVICE"

RETURNING = "RETURNING"

RETURNED = "RETURNED"

CANCELLED = "CANCELLED"



EVENT_TITLES_CUSTOMER = {

    ORDERED: "Zamówiono odbiór kuriera",

    PICKED_UP: "Przesyłka odebrana przez kuriera",

    IN_TRANSIT: "Przesyłka w transporcie",

    DELIVERED: "Dostarczono do magazynu",

    CANCELLED: "Przesyłka anulowana",

}



EVENT_TITLES_SERVICE = {

    ORDERED: "Nadano przesyłkę — wysłano do serwisu / dostawcy",

    PICKED_UP: "Odebrano przez kuriera",

    IN_TRANSIT: "W transporcie do miejsca docelowego",

    DELIVERED: "Dostarczono do serwisu / dostawcy",

    IN_SERVICE: "Produkt w obsłudze u odbiorcy",

    RETURNING: "Przesyłka w drodze powrotnej do magazynu",

    RETURNED: "Zwrot dostarczony do magazynu",

    CANCELLED: "Przesyłka anulowana",

}



TRANSITIONS_CUSTOMER: dict[str, Set[str]] = {

    ORDERED: {PICKED_UP, CANCELLED},

    PICKED_UP: {IN_TRANSIT, DELIVERED, CANCELLED},

    IN_TRANSIT: {DELIVERED, CANCELLED},

}



TRANSITIONS_SERVICE: dict[str, Set[str]] = {

    ORDERED: {PICKED_UP, CANCELLED},

    PICKED_UP: {IN_TRANSIT, CANCELLED},

    IN_TRANSIT: {DELIVERED, CANCELLED},

    DELIVERED: {IN_SERVICE, CANCELLED},

    IN_SERVICE: {RETURNING, CANCELLED},

    RETURNING: {RETURNED, CANCELLED},

}



CUSTOMER_PATCHABLE = {PICKED_UP, IN_TRANSIT, DELIVERED, CANCELLED}

SERVICE_PATCHABLE = {PICKED_UP, IN_TRANSIT, DELIVERED, IN_SERVICE, RETURNING, RETURNED, CANCELLED}

OUTBOUND_PATCHABLE = CUSTOMER_PATCHABLE

EXCHANGE_TITLES = {
    ORDERED: "Zamówiono kuriera — dostawa wymiany + odbiór reklamowanego towaru u klienta",
    PICKED_UP: "Kurier odebrał przesyłkę (wymiana + zwrot od klienta)",
    IN_TRANSIT: "Przesyłka w transporcie",
    DELIVERED: "Dostarczono wymianę do klienta; odebrano towar reklamacyjny",
    CANCELLED: "Przesyłka anulowana",
}

REPLACEMENT_TITLES = {
    ORDERED: "Zamówiono kuriera — dostawa nowego towaru (bez odbioru zwrotu)",
    PICKED_UP: "Kurier nadał przesyłkę do klienta",
    IN_TRANSIT: "Przesyłka w transporcie do klienta",
    DELIVERED: "Dostarczono nowe zamówienie do klienta",
    CANCELLED: "Przesyłka anulowana",
}





def _mock_tracking_number() -> str:

    alphabet = string.ascii_uppercase + string.digits

    return "MOCK-" + "".join(secrets.choice(alphabet) for _ in range(12))





def _normalize_role(raw: Optional[str]) -> str:

    u = (raw or ROLE_CUSTOMER).strip().upper()

    if u == ROLE_SERVICE:
        return ROLE_SERVICE
    if u == ROLE_OUTBOUND:
        return ROLE_OUTBOUND
    return ROLE_CUSTOMER





def _load_complaint(db: Session, complaint_id: int, tenant_id: int, warehouse_id: int) -> Complaint:

    c = (

        db.query(Complaint)

        .filter(

            Complaint.id == complaint_id,

            Complaint.tenant_id == tenant_id,

            Complaint.warehouse_id == warehouse_id,

        )

        .first()

    )

    if not c:

        raise HTTPException(status_code=404, detail="Complaint not found")

    return c





def _shipment_by_role(

    db: Session, complaint_id: int, role: str

) -> Optional[ComplaintShipment]:

    return (

        db.query(ComplaintShipment)

        .options(joinedload(ComplaintShipment.events))

        .filter(

            ComplaintShipment.complaint_id == complaint_id,

            ComplaintShipment.shipment_role == role,

        )

        .first()

    )





def _to_detail(sh: ComplaintShipment) -> ComplaintShipmentDetail:

    events = [

        ComplaintShipmentEventRead(

            id=e.id,

            kind=e.kind,

            title=e.title,

            created_at=e.created_at,

        )

        for e in sorted(sh.events or [], key=lambda x: (x.created_at or datetime.min, x.id))

    ]

    role = (sh.shipment_role or ROLE_CUSTOMER).strip().upper()

    if role not in (ROLE_CUSTOMER, ROLE_SERVICE, ROLE_OUTBOUND):

        role = ROLE_CUSTOMER

    direction, flow_type = _shipment_direction_and_flow(role, sh.method)

    return ComplaintShipmentDetail(

        id=sh.id,

        complaint_id=sh.complaint_id,

        shipment_role=role,  # type: ignore[arg-type]

        direction=direction,  # type: ignore[arg-type]

        flow_type=flow_type,  # type: ignore[arg-type]

        shipment_business_type=(
            (str(sh.shipment_business_type).strip() or None)
            if getattr(sh, "shipment_business_type", None)
            else None
        ),

        fulfillment_mode=(
            (str(sh.fulfillment_mode).strip() or None) if getattr(sh, "fulfillment_mode", None) else None
        ),

        method=sh.method,

        carrier=sh.carrier,

        status=sh.status,

        tracking_number=sh.tracking_number,

        label_url=sh.label_url,

        pickup_date=sh.pickup_date,

        pickup_name=sh.pickup_name,

        pickup_address=sh.pickup_address,

        pickup_phone=sh.pickup_phone,

        pickup_email=sh.pickup_email,

        service_rma=sh.service_rma,

        destination_line=sh.destination_line,

        notes=sh.notes,

        created_at=sh.created_at,

        events=events,

    )





def _append_event(db: Session, shipment_id: int, kind: str, *, service_flow: bool) -> None:

    titles = EVENT_TITLES_SERVICE if service_flow else EVENT_TITLES_CUSTOMER

    title = titles.get(kind, kind)

    db.add(

        ComplaintShipmentEvent(

            shipment_id=shipment_id,

            kind=kind,

            title=title,

            created_at=datetime.utcnow(),

        )

    )




def _append_outbound_event(db: Session, shipment_id: int, kind: str, business_type: str) -> None:
    bt = (business_type or "REPLACEMENT").strip().upper()
    titles = EXCHANGE_TITLES if bt == "EXCHANGE" else REPLACEMENT_TITLES
    title = titles.get(kind, kind)
    db.add(
        ComplaintShipmentEvent(
            shipment_id=shipment_id,
            kind=kind,
            title=title,
            created_at=datetime.utcnow(),
        )
    )


def ensure_complaint_outbound_shipment(
    db: Session,
    complaint_id: int,
    *,
    pickup_name: str,
    pickup_address: str,
    pickup_phone: str,
    pickup_email: Optional[str],
    business_type: str,
    fulfillment_mode: str,
) -> Optional[ComplaintShipment]:
    """
    Jedna przesyłka OUTBOUND na reklamację — tworzona po zapisie zamówienia COMPLAINT.
    Nie nadpisuje istniejącej.
    """
    exists = _shipment_by_role(db, complaint_id, ROLE_OUTBOUND)
    if exists:
        return exists
    pn = (pickup_name or "").strip() or "—"
    pa = (pickup_address or "").strip() or "—"
    pp = (pickup_phone or "").strip() or "000000000"
    bt = (business_type or "").strip().upper()
    fm = (fulfillment_mode or "").strip().upper()
    tracking = _mock_tracking_number()
    now = datetime.utcnow()
    sh = ComplaintShipment(
        complaint_id=complaint_id,
        shipment_role=ROLE_OUTBOUND,
        method="COURIER_PICKUP",
        carrier="INPOST",
        status=ORDERED,
        tracking_number=tracking,
        label_url=None,
        pickup_date=None,
        pickup_name=pn,
        pickup_address=pa,
        pickup_phone=pp,
        pickup_email=(pickup_email or "").strip() or None,
        shipment_business_type=bt,
        fulfillment_mode=fm,
        created_at=now,
    )
    db.add(sh)
    db.flush()
    _append_outbound_event(db, sh.id, ORDERED, bt)
    record_shipment_status_transition(
        db,
        complaint_id,
        shipment_id=int(sh.id),
        from_status=None,
        to_status=ORDERED,
        carrier=getattr(sh, "carrier", None),
        tracking_number=getattr(sh, "tracking_number", None),
        role=ROLE_OUTBOUND,
        method=getattr(sh, "method", None),
        business_type=bt,
        fulfillment_mode=fm,
    )
    return sh


def _build_label_pdf(

    *,

    tracking_number: str,

    carrier: str,

    complaint_ref: Optional[str],

    destination_line: Optional[str] = None,

    service_rma: Optional[str] = None,

    extra_lines: Optional[list[tuple[str, str]]] = None,

) -> bytes:
    """Stub shipping label PDF: fixed label media box in mm (never office default page size)."""
    width_mm = 100.0
    height_mm = 150.0
    assert width_mm and height_mm
    page_w = width_mm * mm
    page_h = height_mm * mm
    print("FINAL PDF SIZE:", width_mm, height_mm)

    buf = BytesIO()

    pdf = canvas.Canvas(buf, pagesize=(page_w, page_h))

    margin_x = 14.0
    y = page_h - 28.0
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(
        margin_x,
        y,
        "Etykieta przesyłki (symulacja — brak integracji z przewoźnikiem)",
    )
    pdf.setFont("Helvetica", 10)
    y -= 26.0

    rows: list[tuple[str, str]] = [

        ("Numer śledzenia", tracking_number),

        ("Przewoźnik", carrier),

        ("Reklamacja", complaint_ref or "—"),

    ]

    if destination_line:

        rows.append(("Cel (serwis / dostawca)", destination_line[:120]))

    if service_rma:

        rows.append(("RMA", service_rma))

    if extra_lines:
        rows.extend(extra_lines)

    for row_label, value in rows:
        if y < 36.0:
            break
        pdf.drawString(margin_x, y, f"{row_label}: {value}")
        y -= 22.0

    pdf.showPage()

    pdf.save()

    return buf.getvalue()





def _get_pair_response(db: Session, complaint_id: int) -> ComplaintShipmentGetResponse:

    cust = _shipment_by_role(db, complaint_id, ROLE_CUSTOMER)

    svc = _shipment_by_role(db, complaint_id, ROLE_SERVICE)

    ob = _shipment_by_role(db, complaint_id, ROLE_OUTBOUND)

    return ComplaintShipmentGetResponse(

        shipment=_to_detail(cust) if cust else None,

        service_shipment=_to_detail(svc) if svc else None,

        outbound_shipment=_to_detail(ob) if ob else None,

    )





@router.get("/{complaint_id}/shipment", response_model=ComplaintShipmentGetResponse)

def get_complaint_shipment(

    complaint_id: int,

    tenant_id: int = Query(...),

    warehouse_id: int = Query(...),

    db: Session = Depends(get_db),

):

    _load_complaint(db, complaint_id, tenant_id, warehouse_id)

    return _get_pair_response(db, complaint_id)





@router.post("/{complaint_id}/shipment", response_model=ComplaintShipmentGetResponse)

def create_complaint_shipment(

    complaint_id: int,

    body: ComplaintShipmentCreate,

    tenant_id: int = Query(...),

    warehouse_id: int = Query(...),

    db: Session = Depends(get_db),

):

    _load_complaint(db, complaint_id, tenant_id, warehouse_id)

    exists = (

        db.query(ComplaintShipment)

        .filter(

            ComplaintShipment.complaint_id == complaint_id,

            ComplaintShipment.shipment_role == ROLE_CUSTOMER,

        )

        .first()

    )

    if exists:

        raise HTTPException(status_code=409, detail="Shipment already exists for this complaint")



    method = (body.method or "").strip().upper()

    carrier = (body.carrier or "").strip().upper()

    if method not in ALLOWED_METHODS:

        raise HTTPException(status_code=400, detail="Invalid method")

    if carrier not in ALLOWED_CARRIERS:

        raise HTTPException(status_code=400, detail="Invalid carrier")



    if method in ("COURIER_PICKUP", "DROP_OFF"):

        if not (body.pickup_name or "").strip():

            raise HTTPException(status_code=400, detail="pickup_name is required for this method")

        if not (body.pickup_address or "").strip():

            raise HTTPException(status_code=400, detail="pickup_address is required for this method")

        if not (body.pickup_phone or "").strip():

            raise HTTPException(status_code=400, detail="pickup_phone is required for this method")



    tracking = _mock_tracking_number()

    now = datetime.utcnow()



    sh = ComplaintShipment(

        complaint_id=complaint_id,

        shipment_role=ROLE_CUSTOMER,

        method=method,

        carrier=carrier,

        status=ORDERED,

        tracking_number=tracking,

        label_url=None,

        pickup_date=body.pickup_date,

        pickup_name=(body.pickup_name or "").strip() or None,

        pickup_address=(body.pickup_address or "").strip() or None,

        pickup_phone=(body.pickup_phone or "").strip() or None,

        pickup_email=(body.pickup_email or "").strip() or None,

        notes=(body.notes or "").strip() or None,

        created_at=now,

    )

    db.add(sh)

    db.flush()

    _append_event(db, sh.id, ORDERED, service_flow=False)

    append_complaint_audit_event(
        db,
        complaint_id,
        "courier_ordered",
        f"Zamówiono odbiór od klienta: {carrier} ({method}).",
        meta={
            "tracking_number": tracking,
            "shipment_id": sh.id,
            "carrier": carrier,
            "method": method,
            "role": ROLE_CUSTOMER,
        },
    )

    db.commit()



    return _get_pair_response(db, complaint_id)





@router.post("/{complaint_id}/shipment/service", response_model=ComplaintShipmentGetResponse)

def create_complaint_service_shipment(

    complaint_id: int,

    body: ComplaintServiceShipmentCreate,

    tenant_id: int = Query(...),

    warehouse_id: int = Query(...),

    db: Session = Depends(get_db),

):

    _load_complaint(db, complaint_id, tenant_id, warehouse_id)

    exists = (

        db.query(ComplaintShipment)

        .filter(

            ComplaintShipment.complaint_id == complaint_id,

            ComplaintShipment.shipment_role == ROLE_SERVICE,

        )

        .first()

    )

    if exists:

        raise HTTPException(status_code=409, detail="Service shipment already exists for this complaint")



    method = (body.method or "").strip().upper()

    carrier = (body.carrier or "").strip().upper()

    if method not in ALLOWED_METHODS:

        raise HTTPException(status_code=400, detail="Invalid method")

    if carrier not in ALLOWED_CARRIERS:

        raise HTTPException(status_code=400, detail="Invalid carrier")

    if method == "NO_RETURN":

        raise HTTPException(status_code=400, detail="Service shipment requires COURIER_PICKUP or DROP_OFF")



    if method in ("COURIER_PICKUP", "DROP_OFF"):

        if not (body.pickup_name or "").strip():

            raise HTTPException(status_code=400, detail="pickup_name is required for this method")

        if not (body.pickup_address or "").strip():

            raise HTTPException(status_code=400, detail="pickup_address is required for this method")

        if not (body.pickup_phone or "").strip():

            raise HTTPException(status_code=400, detail="pickup_phone is required for this method")



    tracking = _mock_tracking_number()

    now = datetime.utcnow()

    sh = ComplaintShipment(

        complaint_id=complaint_id,

        shipment_role=ROLE_SERVICE,

        method=method,

        carrier=carrier,

        status=ORDERED,

        tracking_number=tracking,

        label_url=None,

        pickup_date=body.pickup_date,

        pickup_name=(body.pickup_name or "").strip() or None,

        pickup_address=(body.pickup_address or "").strip() or None,

        pickup_phone=(body.pickup_phone or "").strip() or None,

        pickup_email=(body.pickup_email or "").strip() or None,

        service_rma=(body.service_rma or "").strip(),

        destination_line=(body.destination_line or "").strip(),

        notes=(body.notes or "").strip() or None,

        created_at=now,

    )

    db.add(sh)

    db.flush()

    _append_event(db, sh.id, ORDERED, service_flow=True)
    record_shipment_status_transition(
        db,
        complaint_id,
        shipment_id=int(sh.id),
        from_status=None,
        to_status=ORDERED,
        carrier=getattr(sh, "carrier", None),
        tracking_number=getattr(sh, "tracking_number", None),
        role=ROLE_SERVICE,
        method=method,
    )

    db.commit()



    return _get_pair_response(db, complaint_id)





@router.patch("/{complaint_id}/shipment", response_model=ComplaintShipmentGetResponse)

def patch_complaint_shipment(

    complaint_id: int,

    body: ComplaintShipmentPatch,

    tenant_id: int = Query(...),

    warehouse_id: int = Query(...),

    role: Optional[str] = Query(ROLE_CUSTOMER, description="CUSTOMER, SERVICE, or OUTBOUND"),

    db: Session = Depends(get_db),

):

    _load_complaint(db, complaint_id, tenant_id, warehouse_id)

    r = _normalize_role(role)

    sh = _shipment_by_role(db, complaint_id, r)

    if not sh:

        raise HTTPException(status_code=404, detail="Shipment not found")



    new_status = (body.status or "").strip().upper()

    role_norm = (sh.shipment_role or "").strip().upper()

    service_flow = role_norm == ROLE_SERVICE

    outbound_flow = role_norm == ROLE_OUTBOUND

    patchable = (

        SERVICE_PATCHABLE if service_flow else OUTBOUND_PATCHABLE if outbound_flow else CUSTOMER_PATCHABLE

    )

    if new_status not in patchable:

        raise HTTPException(status_code=400, detail="Invalid status")

    if new_status == ORDERED:

        raise HTTPException(status_code=400, detail="Invalid status")



    cur = (sh.status or "").upper()

    if service_flow:

        if cur in (RETURNED, CANCELLED):

            raise HTTPException(status_code=400, detail="Shipment is terminal")

        transitions = TRANSITIONS_SERVICE

    elif outbound_flow:

        if cur in (DELIVERED, CANCELLED):

            raise HTTPException(status_code=400, detail="Shipment is terminal")

        transitions = TRANSITIONS_CUSTOMER

        if new_status in (IN_SERVICE, RETURNING, RETURNED):

            raise HTTPException(status_code=400, detail="Invalid status for outbound shipment")

    else:

        if cur in (DELIVERED, CANCELLED):

            raise HTTPException(status_code=400, detail="Shipment is terminal")

        transitions = TRANSITIONS_CUSTOMER

        if new_status in (IN_SERVICE, RETURNING, RETURNED):

            raise HTTPException(status_code=400, detail="Invalid status for customer shipment")



    if new_status == CANCELLED:

        pass

    elif new_status not in transitions.get(cur, set()):

        raise HTTPException(status_code=400, detail=f"Cannot transition from {cur} to {new_status}")



    if new_status != cur:

        sh.status = new_status

        if outbound_flow:

            _append_outbound_event(

                db,

                sh.id,

                new_status,

                (sh.shipment_business_type or "REPLACEMENT"),

            )

        else:

            _append_event(db, sh.id, new_status, service_flow=service_flow)

        record_shipment_status_transition(
            db,
            complaint_id,
            shipment_id=int(sh.id),
            from_status=cur,
            to_status=new_status,
            carrier=getattr(sh, "carrier", None),
            tracking_number=getattr(sh, "tracking_number", None),
            role=role_norm,
            method=getattr(sh, "method", None),
            business_type=getattr(sh, "shipment_business_type", None),
            fulfillment_mode=getattr(sh, "fulfillment_mode", None),
        )

        if (

            not outbound_flow

            and not service_flow

            and new_status == DELIVERED

        ):

            _sync_complaint_logistics_after_inbound_delivered(db, complaint_id)

    db.commit()



    return _get_pair_response(db, complaint_id)





@router.get("/{complaint_id}/shipment/label")

def download_complaint_shipment_label(

    complaint_id: int,

    tenant_id: int = Query(...),

    warehouse_id: int = Query(...),

    role: Optional[str] = Query(ROLE_CUSTOMER, description="CUSTOMER, SERVICE, or OUTBOUND"),

    db: Session = Depends(get_db),

):

    c = _load_complaint(db, complaint_id, tenant_id, warehouse_id)

    r = _normalize_role(role)

    sh = (

        db.query(ComplaintShipment)

        .filter(

            ComplaintShipment.complaint_id == complaint_id,

            ComplaintShipment.shipment_role == r,

        )

        .first()

    )

    if not sh:

        raise HTTPException(status_code=404, detail="Shipment not found")

    extra: Optional[list[tuple[str, str]]] = None

    if r == ROLE_OUTBOUND:

        extra = [

            ("Typ", (sh.shipment_business_type or "—")),

            ("Tryb realizacji", (sh.fulfillment_mode or "—")),

        ]

    elif r == ROLE_CUSTOMER and (sh.notes or "").strip():

        extra = [("Notatka", (sh.notes or "").strip()[:200])]

    pdf_bytes = _build_label_pdf(

        tracking_number=sh.tracking_number,

        carrier=sh.carrier,

        complaint_ref=c.reference_code,

        destination_line=sh.destination_line,

        service_rma=sh.service_rma,

        extra_lines=extra,

    )

    if r == ROLE_SERVICE:

        suffix = "serwis"

    elif r == ROLE_OUTBOUND:

        suffix = "nadanie"

    else:

        suffix = "zwrot"

    filename = f"etykieta-reklamacja-{complaint_id}-{suffix}.pdf"

    return Response(

        content=pdf_bytes,

        media_type="application/pdf",

        headers={"Content-Disposition": f'attachment; filename="{filename}"'},

    )

