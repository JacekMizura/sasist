from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.warehouse_map_service import WarehouseMapService
from ..schemas.warehouse_map import (
    WarehouseMapRead,
    WarehouseMapCreate,
    WarehouseMapUpdate,
    MapElementCreate,
    MapElementUpdate,
    PathRequest,
    PathResponse,
)

router = APIRouter(prefix="/warehouse-maps", tags=["Warehouse Designer"])


@router.get("/", response_model=dict)
def get_or_create_map(
    tenant_id: int,
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    service = WarehouseMapService(db)
    return service.get_or_create_map(tenant_id, warehouse_id)


@router.get("/{map_id}/", response_model=dict)
def get_map(map_id: int, db: Session = Depends(get_db)):
    service = WarehouseMapService(db)
    return service.get_map(map_id)


@router.put("/{map_id}/", response_model=dict)
def update_map(
    map_id: int,
    data: WarehouseMapUpdate,
    db: Session = Depends(get_db),
):
    service = WarehouseMapService(db)
    return service.update_map(
        map_id,
        data.name,
        data.grid_cols,
        data.grid_rows,
    )


@router.post("/{map_id}/elements/", response_model=dict)
def add_element(
    map_id: int,
    data: MapElementCreate,
    db: Session = Depends(get_db),
):
    service = WarehouseMapService(db)
    return service.add_element(
        map_id,
        data.type,
        data.x,
        data.y,
        data.width or 1,
        data.height or 1,
        data.props,
    )


@router.put("/elements/{element_id}/", response_model=dict)
def update_element(
    element_id: int,
    data: MapElementUpdate,
    db: Session = Depends(get_db),
):
    service = WarehouseMapService(db)
    return service.update_element(
        element_id,
        data.x,
        data.y,
        data.width,
        data.height,
        data.props,
    )


@router.delete("/elements/{element_id}/")
def delete_element(element_id: int, db: Session = Depends(get_db)):
    service = WarehouseMapService(db)
    return service.delete_element(element_id)


@router.get("/{map_id}/walkable/")
def get_walkable_grid(map_id: int, db: Session = Depends(get_db)):
    service = WarehouseMapService(db)
    return {"grid": service.get_walkable_grid(map_id)}


@router.post("/path/", response_model=dict)
def find_path(data: PathRequest, db: Session = Depends(get_db)):
    service = WarehouseMapService(db)
    return service.find_path(
        data.map_id,
        data.start_x,
        data.start_y,
        data.end_x,
        data.end_y,
    )
