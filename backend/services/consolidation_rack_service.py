from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException

from ..models.consolidation_rack import ConsolidationRack, RackLevel, RackSegment
from ..models.order import Order


class ConsolidationRackService:
    def __init__(self, db: Session):
        self.db = db

    def list_racks(self, tenant_id: int, warehouse_id: int):
        racks = (
            self.db.query(ConsolidationRack)
            .options(
                joinedload(ConsolidationRack.levels).joinedload(RackLevel.segments),
            )
            .filter(
                ConsolidationRack.tenant_id == tenant_id,
                ConsolidationRack.warehouse_id == warehouse_id,
            )
            .all()
        )
        return [self._rack_to_read(r) for r in racks]

    def _rack_to_read(self, rack: ConsolidationRack):
        levels_out = []
        for lev in sorted(rack.levels or [], key=lambda x: x.level_index):
            segments_out = []
            for seg in sorted(lev.segments or [], key=lambda x: x.segment_index):
                order_number = None
                if seg.order_id:
                    o = self.db.query(Order).filter(Order.id == seg.order_id).first()
                    order_number = o.number if o else None
                segments_out.append({
                    "id": seg.id,
                    "level_id": seg.level_id,
                    "segment_index": seg.segment_index,
                    "order_id": seg.order_id,
                    "order_number": order_number,
                    "fill_percent": seg.fill_percent or 0,
                })
            levels_out.append({
                "id": lev.id,
                "rack_id": lev.rack_id,
                "level_index": lev.level_index,
                "name": lev.name,
                "is_segmented": lev.is_segmented or False,
                "segments": segments_out,
            })
        return {
            "id": rack.id,
            "tenant_id": rack.tenant_id,
            "warehouse_id": rack.warehouse_id,
            "name": rack.name,
            "levels": levels_out,
        }

    def create_rack(self, tenant_id: int, warehouse_id: int, name: str, levels: list):
        rack = ConsolidationRack(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            name=name,
        )
        self.db.add(rack)
        self.db.flush()
        for lv in levels or []:
            level_index = lv.get("level_index", len(rack.levels or []))
            is_segmented = lv.get("is_segmented", False)
            segs = lv.get("segments", [])
            level = RackLevel(
                rack_id=rack.id,
                level_index=level_index,
                name=lv.get("name"),
                is_segmented=is_segmented,
            )
            self.db.add(level)
            self.db.flush()
            if segs:
                for s in segs:
                    seg = RackSegment(
                        level_id=level.id,
                        segment_index=s.get("segment_index", 0),
                        order_id=s.get("order_id"),
                        fill_percent=s.get("fill_percent", 0),
                    )
                    self.db.add(seg)
            else:
                seg = RackSegment(level_id=level.id, segment_index=0, order_id=None, fill_percent=0)
                self.db.add(seg)
        self.db.commit()
        self.db.refresh(rack)
        return self._rack_to_read(rack)

    def get_rack(self, rack_id: int):
        rack = (
            self.db.query(ConsolidationRack)
            .options(
                joinedload(ConsolidationRack.levels).joinedload(RackLevel.segments),
            )
            .filter(ConsolidationRack.id == rack_id)
            .first()
        )
        if not rack:
            raise HTTPException(status_code=404, detail="Regał nie istnieje")
        return self._rack_to_read(rack)

    def update_rack(self, rack_id: int, name: str | None = None):
        rack = self.db.query(ConsolidationRack).filter(ConsolidationRack.id == rack_id).first()
        if not rack:
            raise HTTPException(status_code=404, detail="Regał nie istnieje")
        if name is not None:
            rack.name = name
        self.db.add(rack)
        self.db.commit()
        return self.get_rack(rack_id)

    def delete_rack(self, rack_id: int):
        rack = self.db.query(ConsolidationRack).filter(ConsolidationRack.id == rack_id).first()
        if not rack:
            raise HTTPException(status_code=404, detail="Regał nie istnieje")
        self.db.delete(rack)
        self.db.commit()
        return {"status": "deleted"}

    def assign_segment(self, segment_id: int, order_id: int, fill_percent: float = 100):
        seg = self.db.query(RackSegment).filter(RackSegment.id == segment_id).first()
        if not seg:
            raise HTTPException(status_code=404, detail="Segment nie istnieje")
        order = self.db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Zamówienie nie istnieje")
        seg.order_id = order_id
        seg.fill_percent = max(0, min(100, fill_percent))
        self.db.add(seg)
        self.db.commit()
        self.db.refresh(seg)
        return {"status": "OK", "segment_id": segment_id, "order_id": order_id, "fill_percent": seg.fill_percent}

    def clear_segment(self, segment_id: int):
        seg = self.db.query(RackSegment).filter(RackSegment.id == segment_id).first()
        if not seg:
            raise HTTPException(status_code=404, detail="Segment nie istnieje")
        seg.order_id = None
        seg.fill_percent = 0
        self.db.add(seg)
        self.db.commit()
        return {"status": "OK", "segment_id": segment_id}
