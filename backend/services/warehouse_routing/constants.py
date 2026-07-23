"""Constants for authored Warehouse Routing Graph (Stage 1)."""

from __future__ import annotations

# Layout coordinate system: 1 cell = 10 cm (same as frontend GRID_UNIT_CM).
GRID_UNIT_CM = 10.0

NODE_TYPE_JUNCTION = "junction"
NODE_TYPE_OPERATIONAL = "operational"
NODE_TYPE_ACCESS = "access"

NODE_TYPES = frozenset({NODE_TYPE_JUNCTION, NODE_TYPE_OPERATIONAL, NODE_TYPE_ACCESS})

OP_PICKING_START = "picking_start"
OP_PACKING = "packing"
OP_RECEIVING_DOCK = "receiving_dock"
OP_RECEIVING_BUFFER = "receiving_buffer"
OP_PUTAWAY_BUFFER = "putaway_buffer"
OP_CART_PARKING = "cart_parking"
OP_CONSOLIDATION = "consolidation"
OP_END_POINT = "end_point"

OPERATIONAL_TYPES = frozenset(
    {
        OP_PICKING_START,
        OP_PACKING,
        OP_RECEIVING_DOCK,
        OP_RECEIVING_BUFFER,
        OP_PUTAWAY_BUFFER,
        OP_CART_PARKING,
        OP_CONSOLIDATION,
        OP_END_POINT,
    }
)

DIRECTION_BOTH = "BOTH"
DIRECTION_FORWARD = "FORWARD"
DIRECTION_BACKWARD = "BACKWARD"
DIRECTIONS = frozenset({DIRECTION_BOTH, DIRECTION_FORWARD, DIRECTION_BACKWARD})

# Process / transport codes used by engine filters (extensible).
PROCESS_PICKING = "picking"
PROCESS_PUTAWAY = "putaway"
PROCESS_REPLENISHMENT = "replenishment"
PROCESS_RELOCATION = "relocation"
PROCESS_ANY = "any"

TRANSPORT_FOOT = "foot"
TRANSPORT_CART = "cart"
TRANSPORT_PALLET_JACK = "pallet_jack"
TRANSPORT_FORKLIFT = "forklift"
TRANSPORT_ANY = "any"

ERROR_ROUTING_GRAPH_NOT_CONFIGURED = "ROUTING_GRAPH_NOT_CONFIGURED"
ERROR_NO_PATH = "NO_PATH"
ERROR_DISCONNECTED = "DISCONNECTED_DESTINATION"
ERROR_NODE_NOT_FOUND = "NODE_NOT_FOUND"
ERROR_INVALID_REQUEST = "INVALID_REQUEST"
ERROR_VERSION_CONFLICT = "ROUTING_GRAPH_VERSION_CONFLICT"
ERROR_OVERLAPPING_EDGES = "OVERLAPPING_EDGES"
ERROR_FOREIGN_LOCATION = "LOCATION_NOT_IN_WAREHOUSE"


class RoutingGraphVersionConflict(Exception):
    """Optimistic concurrency: client revision does not match server."""

    def __init__(self, current_revision: int):
        self.current_revision = int(current_revision)
        super().__init__(f"{ERROR_VERSION_CONFLICT}: current_revision={current_revision}")


class RoutingGraphValidationError(Exception):
    """Hard validation failure during replace (e.g. overlapping edges)."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"{code}: {message}")
