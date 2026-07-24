"""
API: Authored Warehouse Routing Graph (NEW SSOT).

Independent from /warehouse-graph (legacy auto graph) and /route/path (legacy Dijkstra).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.warehouse_routing import (
    LocationAccessOut,
    LocationAccessOverrideRequest,
    LocationAccessRecomputeOut,
    LocationAccessSummaryOut,
    LocationRouteRequest,
    RouteComputeRequest,
    RouteComputeResponse,
    RoutingGraphOut,
    RoutingGraphReplaceRequest,
    RoutingValidationResult,
)
from ..services.warehouse_routing import get_graph, replace_graph, route_a_to_b, validate_graph
from ..services.warehouse_routing.constants import (
    ERROR_VERSION_CONFLICT,
    RoutingGraphValidationError,
    RoutingGraphVersionConflict,
)
from ..services.warehouse_routing.engine import route_via_virtual_entries
from ..services.warehouse_routing.location_access_resolver import location_access_summary, recompute_location_access
from ..services.warehouse_routing.location_access_service import (
    get_location_access,
    list_location_access,
    restore_auto,
    set_manual_override,
)
from ..models.warehouse_routing import WarehouseRoutingLocationAccess


def _access_out(row: WarehouseRoutingLocationAccess) -> LocationAccessOut:
    return LocationAccessOut(
        uuid=row.uuid,
        warehouse_id=int(row.warehouse_id),
        location_id=int(row.location_id),
        binding_mode=row.binding_mode,
        status=row.status,
        edge_uuid=row.edge_uuid,
        t=row.t,
        service_point_x_cm=row.service_point_x_cm,
        service_point_y_cm=row.service_point_y_cm,
        entry_x_cm=row.entry_x_cm,
        entry_y_cm=row.entry_y_cm,
        access_approach_m=row.access_approach_m,
        rack_id=row.rack_id,
        rack_uuid=row.rack_uuid,
        legacy_node_uuid=row.legacy_node_uuid,
        graph_revision=row.graph_revision,
    )


router = APIRouter(prefix="/warehouse-routing", tags=["Warehouse Routing Graph"])


@router.get("/{warehouse_id}/graph", response_model=RoutingGraphOut)
def api_get_routing_graph(warehouse_id: int, db: Session = Depends(get_db)):
    return get_graph(db, warehouse_id)


@router.put("/{warehouse_id}/graph", response_model=RoutingGraphOut)
def api_put_routing_graph(
    warehouse_id: int,
    payload: RoutingGraphReplaceRequest,
    db: Session = Depends(get_db),
):
    """Replace authored graph. Does not modify physical layout or legacy WarehouseNode."""
    try:
        return replace_graph(db, warehouse_id, payload, materialize_crossings=True)
    except RoutingGraphVersionConflict as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": ERROR_VERSION_CONFLICT,
                "revision": exc.current_revision,
                "message": (
                    "Konfiguracja tras została zmieniona przez innego użytkownika. "
                    "Odśwież dane i spróbuj ponownie."
                ),
            },
        ) from exc
    except RoutingGraphValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{warehouse_id}/route", response_model=RouteComputeResponse)
def api_compute_route(
    warehouse_id: int,
    payload: RouteComputeRequest,
    db: Session = Depends(get_db),
):
    """A→B via NEW Routing Engine only (no legacy graph fallback)."""
    return route_a_to_b(db, warehouse_id, payload)


@router.post("/{warehouse_id}/validate", response_model=RoutingValidationResult)
def api_validate_routing_graph(warehouse_id: int, db: Session = Depends(get_db)):
    return validate_graph(db, warehouse_id)


@router.get("/{warehouse_id}/location-access", response_model=list[LocationAccessOut])
def api_list_location_access(warehouse_id: int, db: Session = Depends(get_db)):
    return [_access_out(r) for r in list_location_access(db, warehouse_id)]


@router.get("/{warehouse_id}/location-access/summary", response_model=LocationAccessSummaryOut)
def api_location_access_summary(warehouse_id: int, db: Session = Depends(get_db)):
    return LocationAccessSummaryOut(**location_access_summary(db, warehouse_id))


@router.post("/{warehouse_id}/location-access/recompute", response_model=LocationAccessRecomputeOut)
def api_recompute_location_access(warehouse_id: int, db: Session = Depends(get_db)):
    result = recompute_location_access(db, warehouse_id, migrate_aps=True)
    db.commit()
    return LocationAccessRecomputeOut(**result)


@router.post(
    "/{warehouse_id}/location-access/{location_id}/override",
    response_model=LocationAccessOut,
)
def api_override_location_access(
    warehouse_id: int,
    location_id: int,
    payload: LocationAccessOverrideRequest,
    db: Session = Depends(get_db),
):
    try:
        row = set_manual_override(
            db,
            warehouse_id,
            location_id,
            edge_uuid=payload.edge_uuid,
            t=payload.t,
            node_uuid=payload.node_uuid,
        )
        db.commit()
        return _access_out(row)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/{warehouse_id}/location-access/{location_id}/restore-auto",
    response_model=LocationAccessOut,
)
def api_restore_auto_location_access(
    warehouse_id: int,
    location_id: int,
    db: Session = Depends(get_db),
):
    try:
        row = restore_auto(db, warehouse_id, location_id)
        db.commit()
        return _access_out(row)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{warehouse_id}/route-locations", response_model=RouteComputeResponse)
def api_route_between_locations(
    warehouse_id: int,
    payload: LocationRouteRequest,
    db: Session = Depends(get_db),
):
    """Foundation route Location→Location via virtual entries (not Stage-3 WMS wiring)."""
    a = get_location_access(db, warehouse_id, payload.start_location_id)
    b = get_location_access(db, warehouse_id, payload.destination_location_id)
    if a is None or b is None:
        return RouteComputeResponse(
            ok=False,
            error_code="LOCATION_ACCESS_MISSING",
            message="Brak wyliczonego dostępu lokalizacji — uruchom przeliczenie dostępu.",
        )
    if a.legacy_node_uuid and b.legacy_node_uuid and not a.edge_uuid and not b.edge_uuid:
        # Legacy node override path via node A→B
        return route_a_to_b(
            db,
            warehouse_id,
            RouteComputeRequest(
                start_node_uuid=a.legacy_node_uuid,
                destination_node_uuid=b.legacy_node_uuid,
                process_type=payload.process_type,
                transport_type=payload.transport_type,
            ),
        )
    if not a.edge_uuid or a.t is None or not b.edge_uuid or b.t is None:
        return RouteComputeResponse(
            ok=False,
            error_code="LOCATION_ACCESS_INCOMPLETE",
            message="Dostęp lokalizacji nie ma przypisanego odcinka trasy.",
        )
    return route_via_virtual_entries(
        db,
        warehouse_id,
        start_edge_uuid=a.edge_uuid,
        start_t=float(a.t),
        start_approach_m=float(a.access_approach_m or 0.0),
        dest_edge_uuid=b.edge_uuid,
        dest_t=float(b.t),
        dest_approach_m=float(b.access_approach_m or 0.0),
        process_type=payload.process_type,
        transport_type=payload.transport_type,
    )
