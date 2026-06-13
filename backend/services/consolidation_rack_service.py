import re

from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException

from ..models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from ..models.order import Order
from ..services.order_consolidation.progress_helpers import segment_slot_label
from ..services.order_consolidation.segment_capacity_service import sync_segment_capacity_dm3

_SLOT_LABEL_RE = re.compile(r"^[\w\-.]+$", re.UNICODE)


def _normalize_slot_label(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _slot_label_key(value: str) -> str:
    return value.upper().replace(" ", "")


class ConsolidationRackService:
    def __init__(self, db: Session):
        self.db = db

    def list_racks(self, tenant_id: int, warehouse_id: int):
        racks = (
            self.db.query(ConsolidationRack)
            .options(
                joinedload(ConsolidationRack.levels).joinedload(ConsolidationRackLevel.segments),
            )
            .filter(
                ConsolidationRack.tenant_id == tenant_id,
                ConsolidationRack.warehouse_id == warehouse_id,
            )
            .all()
        )
        return [self._rack_to_read(r) for r in racks]

    def _segment_to_read(self, seg: RackSegment, level: ConsolidationRackLevel):
        order_number = None
        if seg.order_id:
            o = self.db.query(Order).filter(Order.id == seg.order_id).first()
            order_number = o.number if o else None
        return {
            "id": seg.id,
            "level_id": seg.level_id,
            "segment_index": seg.segment_index,
            "order_id": seg.order_id,
            "order_number": order_number,
            "fill_percent": seg.fill_percent or 0,
            "slot_label": seg.slot_label,
            "effective_slot_label": segment_slot_label(level, seg),
            "length_mm": seg.length_mm,
            "width_mm": seg.width_mm,
            "height_mm": seg.height_mm,
            "capacity_dm3": seg.capacity_dm3,
        }

    def _rack_to_read(self, rack: ConsolidationRack):
        levels_out = []
        for lev in sorted(rack.levels or [], key=lambda x: x.level_index):
            segments_out = []
            for seg in sorted(lev.segments or [], key=lambda x: x.segment_index):
                segments_out.append(self._segment_to_read(seg, lev))
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
            level = ConsolidationRackLevel(
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
                        slot_label=_normalize_slot_label(s.get("slot_label")),
                        length_mm=s.get("length_mm"),
                        width_mm=s.get("width_mm"),
                        height_mm=s.get("height_mm"),
                    )
                    sync_segment_capacity_dm3(seg)
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
                joinedload(ConsolidationRack.levels).joinedload(ConsolidationRackLevel.segments),
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

    def _segment_context(self, segment_id: int) -> tuple[RackSegment, ConsolidationRackLevel, ConsolidationRack]:
        row = (
            self.db.query(RackSegment, ConsolidationRackLevel, ConsolidationRack)
            .join(ConsolidationRackLevel, ConsolidationRackLevel.id == RackSegment.level_id)
            .join(ConsolidationRack, ConsolidationRack.id == ConsolidationRackLevel.rack_id)
            .filter(RackSegment.id == segment_id)
            .first()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Segment nie istnieje")
        return row

    def _assert_slot_label_unique(
        self,
        rack: ConsolidationRack,
        segment: RackSegment,
        slot_label: str | None,
    ) -> None:
        if not slot_label:
            return
        needle = _slot_label_key(slot_label)
        for lev in rack.levels or []:
            for seg in lev.segments or []:
                if int(seg.id) == int(segment.id):
                    continue
                other = segment_slot_label(lev, seg)
                if _slot_label_key(other) == needle:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Etykieta półki '{slot_label}' jest już używana w regale {rack.name}.",
                    )

    def update_segment(
        self,
        segment_id: int,
        *,
        slot_label: str | None = None,
        length_mm: float | None = None,
        width_mm: float | None = None,
        height_mm: float | None = None,
        unset_slot_label: bool = False,
    ):
        seg, level, rack = self._segment_context(segment_id)

        if unset_slot_label:
            seg.slot_label = None
        elif slot_label is not None:
            normalized = _normalize_slot_label(slot_label)
            if normalized and not _SLOT_LABEL_RE.match(normalized):
                raise HTTPException(
                    status_code=422,
                    detail="Nazwa półki może zawierać litery, cyfry, myślnik, kropkę i podkreślenie.",
                )
            self._assert_slot_label_unique(rack, seg, normalized)
            seg.slot_label = normalized

        if length_mm is not None:
            seg.length_mm = float(length_mm) if float(length_mm) > 0 else None
        if width_mm is not None:
            seg.width_mm = float(width_mm) if float(width_mm) > 0 else None
        if height_mm is not None:
            seg.height_mm = float(height_mm) if float(height_mm) > 0 else None

        sync_segment_capacity_dm3(seg)
        self.db.add(seg)
        self.db.commit()
        self.db.refresh(seg)
        return self._segment_to_read(seg, level)

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
