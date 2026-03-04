from sqlalchemy.orm import Session, joinedload
from sqlalchemy import delete
from fastapi import HTTPException

from ..models.picking_zone import PickingZone, order_zone_association
from ..models.order import Order


def _zone_used_volume(db: Session, zone_id: int) -> float:
    """Sum of total_volume_dm3 for all orders assigned to this zone."""
    orders = (
        db.query(Order)
        .join(order_zone_association, Order.id == order_zone_association.c.order_id)
        .filter(order_zone_association.c.zone_id == zone_id)
        .all()
    )
    return round(sum(getattr(o, "total_volume_dm3", 0) or 0 for o in orders), 2)


def _zone_occupancy(capacity: float, used: float) -> float:
    if not capacity or capacity <= 0:
        return 0.0
    return round(100.0 * used / capacity, 2)


class PickingZoneService:
    def __init__(self, db: Session):
        self.db = db

    def list_zones(self, tenant_id: int, warehouse_id: int):
        zones = (
            self.db.query(PickingZone)
            .options(joinedload(PickingZone.orders))
            .filter(
                PickingZone.tenant_id == tenant_id,
                PickingZone.warehouse_id == warehouse_id,
            )
            .all()
        )
        result = []
        for z in zones:
            used = _zone_used_volume(self.db, z.id)
            occ = _zone_occupancy(z.capacity_volume or 0, used)
            result.append({
                "id": z.id,
                "tenant_id": z.tenant_id,
                "warehouse_id": z.warehouse_id,
                "name": z.name,
                "capacity_volume": z.capacity_volume or 0,
                "used_volume": used,
                "occupancy_percent": occ,
                "length_cm": getattr(z, "length_cm", None),
                "width_cm": getattr(z, "width_cm", None),
                "height_cm": getattr(z, "height_cm", None),
                "max_weight_kg": getattr(z, "max_weight_kg", None),
                "orders": [
                    {"order_id": o.id, "order_number": getattr(o, "number", None)}
                    for o in (z.orders or [])
                ],
            })
        return result

    def create_zone(
        self,
        tenant_id: int,
        warehouse_id: int,
        name: str,
        capacity_volume: float = 0,
        length_cm: float | None = None,
        width_cm: float | None = None,
        height_cm: float | None = None,
        max_weight_kg: float | None = None,
    ):
        vol = capacity_volume or 0
        if length_cm and width_cm and height_cm and vol == 0:
            vol = round((length_cm * width_cm * height_cm) / 1000.0, 2)
        zone = PickingZone(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            name=name,
            capacity_volume=vol,
            length_cm=length_cm,
            width_cm=width_cm,
            height_cm=height_cm,
            max_weight_kg=max_weight_kg,
        )
        self.db.add(zone)
        self.db.commit()
        self.db.refresh(zone)
        return {
            "id": zone.id,
            "tenant_id": zone.tenant_id,
            "warehouse_id": zone.warehouse_id,
            "name": zone.name,
            "capacity_volume": zone.capacity_volume or 0,
            "used_volume": 0,
            "occupancy_percent": 0,
            "length_cm": getattr(zone, "length_cm", None),
            "width_cm": getattr(zone, "width_cm", None),
            "height_cm": getattr(zone, "height_cm", None),
            "max_weight_kg": getattr(zone, "max_weight_kg", None),
            "orders": [],
        }

    def update_zone(
        self,
        zone_id: int,
        name: str | None = None,
        capacity_volume: float | None = None,
        length_cm: float | None = None,
        width_cm: float | None = None,
        height_cm: float | None = None,
        max_weight_kg: float | None = None,
    ):
        zone = self.db.query(PickingZone).filter(PickingZone.id == zone_id).first()
        if not zone:
            raise HTTPException(status_code=404, detail="Strefa nie istnieje")
        if name is not None:
            zone.name = name
        if capacity_volume is not None:
            zone.capacity_volume = capacity_volume
        if length_cm is not None:
            zone.length_cm = length_cm
        if width_cm is not None:
            zone.width_cm = width_cm
        if height_cm is not None:
            zone.height_cm = height_cm
        if max_weight_kg is not None:
            zone.max_weight_kg = max_weight_kg
        if length_cm is not None and width_cm is not None and height_cm is not None and (capacity_volume is None or capacity_volume == 0):
            zone.capacity_volume = round((length_cm * width_cm * height_cm) / 1000.0, 2)
        self.db.add(zone)
        self.db.commit()
        self.db.refresh(zone)
        used = _zone_used_volume(self.db, zone.id)
        return {
            "id": zone.id,
            "tenant_id": zone.tenant_id,
            "warehouse_id": zone.warehouse_id,
            "name": zone.name,
            "capacity_volume": zone.capacity_volume or 0,
            "used_volume": used,
            "occupancy_percent": _zone_occupancy(zone.capacity_volume or 0, used),
            "length_cm": getattr(zone, "length_cm", None),
            "width_cm": getattr(zone, "width_cm", None),
            "height_cm": getattr(zone, "height_cm", None),
            "max_weight_kg": getattr(zone, "max_weight_kg", None),
            "orders": [
                {"order_id": o.id, "order_number": getattr(o, "number", None)}
                for o in (zone.orders or [])
            ],
        }

    def delete_zone(self, zone_id: int):
        zone = self.db.query(PickingZone).filter(PickingZone.id == zone_id).first()
        if not zone:
            raise HTTPException(status_code=404, detail="Strefa nie istnieje")
        self.db.delete(zone)
        self.db.commit()
        return {"status": "deleted"}

    def assign_order(self, zone_id: int, order_id: int):
        zone = self.db.query(PickingZone).filter(PickingZone.id == zone_id).first()
        if not zone:
            raise HTTPException(status_code=404, detail="Strefa nie istnieje")
        order = self.db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Zamówienie nie istnieje")
        if order not in (zone.orders or []):
            zone.orders = list(zone.orders or []) + [order]
            self.db.add(zone)
        self.db.commit()
        self.db.refresh(zone)
        used = _zone_used_volume(self.db, zone.id)
        zone.used_volume = used
        self.db.add(zone)
        self.db.commit()
        return {"status": "OK", "zone_id": zone_id, "order_id": order_id}

    def unassign_order(self, zone_id: int, order_id: int):
        self.db.execute(
            delete(order_zone_association).where(
                order_zone_association.c.zone_id == zone_id,
                order_zone_association.c.order_id == order_id,
            )
        )
        self.db.commit()
        zone = self.db.query(PickingZone).filter(PickingZone.id == zone_id).first()
        if zone:
            used = _zone_used_volume(self.db, zone.id)
            zone.used_volume = used
            self.db.add(zone)
            self.db.commit()
        return {"status": "OK", "zone_id": zone_id, "order_id": order_id}
