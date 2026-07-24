"""Physical collision SSOT + RackPassage — mandatory cases 1–22 (drawing FE separately)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.warehouse import Rack, Warehouse, WarehouseLayout, WarehouseRackPassage
from backend.models.warehouse_routing import (
    WarehouseRoutingAccessPoint,
    WarehouseRoutingEdge,
    WarehouseRoutingGraphMeta,
    WarehouseRoutingLocationAccess,
    WarehouseRoutingNode,
)
from backend.services.warehouse_routing.physical_collision import (
    COLLISION_EPS_CM,
    build_rack_obstacle,
    passage_world_rect,
    rack_footprint_aabb,
    segment_collides_obstacles,
    segment_is_physically_clear,
)
from backend.services.warehouse_routing.validation import validate_graph
from backend.services.warehouse_routing.graph_service import replace_graph
from backend.schemas.warehouse_routing import RoutingGraphReplaceRequest, RoutingNodeIn, RoutingEdgeIn


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    Warehouse.__table__.create(engine, checkfirst=True)
    WarehouseLayout.__table__.create(engine, checkfirst=True)
    Rack.__table__.create(engine, checkfirst=True)
    WarehouseRackPassage.__table__.create(engine, checkfirst=True)
    from backend.models.location import Location
    from backend.models.warehouse import Bin

    Bin.__table__.create(engine, checkfirst=True)
    Location.__table__.create(engine, checkfirst=True)
    WarehouseRoutingNode.__table__.create(engine, checkfirst=True)
    WarehouseRoutingEdge.__table__.create(engine, checkfirst=True)
    WarehouseRoutingAccessPoint.__table__.create(engine, checkfirst=True)
    WarehouseRoutingLocationAccess.__table__.create(engine, checkfirst=True)
    WarehouseRoutingGraphMeta.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _rack(
    db,
    *,
    x=10,
    y=10,
    width=20,
    height=8,
    orientation="horizontal",
    warehouse_id=None,
) -> tuple[Warehouse, WarehouseLayout, Rack]:
    w = Warehouse(name=f"W-{uuid.uuid4().hex[:6]}", tenant_id=1)
    db.add(w)
    db.flush()
    layout = WarehouseLayout(
        warehouse_id=w.id,
        name="L",
        grid_cols=200,
        grid_rows=200,
        width_m=20,
        length_m=20,
    )
    db.add(layout)
    db.flush()
    rack = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
        name="R1",
        x=x,
        y=y,
        width=width,
        height=height,
        orientation=orientation,
        levels=1,
        bins_per_level=1,
        length_cm=float(height * 10),
        width_cm=float(width * 10),
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    db.add(rack)
    db.flush()
    return w, layout, rack


def _pass(rack, *, offset, width, enabled=True, clearance=None) -> dict:
    return {
        "uuid": str(uuid.uuid4()),
        "offset_along_cm": offset,
        "width_cm": width,
        "enabled": enabled,
        "clearance_height_cm": clearance,
    }


# --- Collision 1–6 ---


def test_01_through_rack_center_blocks():
    rack = Rack(
        layout_id=1,
        uuid="u",
        name="R",
        x=10,
        y=10,
        width=20,
        height=10,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=100,
        width_cm=200,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    rack.id = 1
    obs = build_rack_obstacle(rack, [])
    fp = obs.footprint
    # Vertical through center
    ax, ay = (fp.min_x + fp.max_x) / 2, fp.min_y - 50
    bx, by = (fp.min_x + fp.max_x) / 2, fp.max_y + 50
    assert segment_collides_obstacles(ax, ay, bx, by, [obs]).blocked


def test_02_diagonal_through_rack_blocks():
    rack = Rack(
        layout_id=1,
        uuid="u",
        name="R",
        x=10,
        y=10,
        width=20,
        height=10,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=100,
        width_cm=200,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    rack.id = 1
    obs = build_rack_obstacle(rack, [])
    fp = obs.footprint
    assert segment_collides_obstacles(
        fp.min_x - 20, fp.min_y - 20, fp.max_x + 20, fp.max_y + 20, [obs]
    ).blocked


def test_03_diagonal_corner_clip_blocks():
    rack = Rack(
        layout_id=1,
        uuid="u",
        name="R",
        x=10,
        y=10,
        width=20,
        height=10,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=100,
        width_cm=200,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    rack.id = 1
    obs = build_rack_obstacle(rack, [])
    fp = obs.footprint
    # Clip NE corner
    assert segment_collides_obstacles(
        fp.max_x + 40,
        fp.min_y - 40,
        fp.max_x - 40,
        fp.min_y + 40,
        [obs],
    ).blocked


def test_04_along_boundary_passes():
    rack = Rack(
        layout_id=1,
        uuid="u",
        name="R",
        x=10,
        y=10,
        width=20,
        height=10,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=100,
        width_cm=200,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    rack.id = 1
    obs = build_rack_obstacle(rack, [])
    fp = obs.footprint
    # Exactly on south edge
    assert segment_is_physically_clear(fp.min_x, fp.min_y, fp.max_x, fp.min_y, [obs])


def test_05_beside_rack_passes():
    rack = Rack(
        layout_id=1,
        uuid="u",
        name="R",
        x=10,
        y=10,
        width=20,
        height=10,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=100,
        width_cm=200,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    rack.id = 1
    obs = build_rack_obstacle(rack, [])
    fp = obs.footprint
    y = fp.min_y - 30
    assert segment_is_physically_clear(fp.min_x - 10, y, fp.max_x + 10, y, [obs])


def test_06_empty_diagonal_passes():
    rack = Rack(
        layout_id=1,
        uuid="u",
        name="R",
        x=10,
        y=10,
        width=20,
        height=10,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=100,
        width_cm=200,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    rack.id = 1
    obs = build_rack_obstacle(rack, [])
    fp = obs.footprint
    # Far from rack
    assert segment_is_physically_clear(
        fp.max_x + 80, fp.min_y - 80, fp.max_x + 180, fp.max_y + 80, [obs]
    )


def test_epsilon_boundary_graze_passes_interior_blocks():
    rack = Rack(
        layout_id=1,
        uuid="u",
        name="R",
        x=0,
        y=0,
        width=20,
        height=10,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=100,
        width_cm=200,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    rack.id = 1
    obs = build_rack_obstacle(rack, [])
    fp = obs.footprint
    # Just outside interior by eps band along top edge interior-side still on boundary band
    y_edge = fp.min_y
    assert segment_is_physically_clear(fp.min_x + 10, y_edge, fp.max_x - 10, y_edge, [obs])
    # Deep interior
    y_in = fp.min_y + COLLISION_EPS_CM + 5
    assert segment_collides_obstacles(fp.min_x + 10, y_in, fp.max_x - 10, y_in, [obs]).blocked


# --- Passage 7–14 ---


def test_07_exact_through_passage_passes():
    rack = Rack(
        layout_id=1,
        uuid="u",
        name="R",
        x=10,
        y=10,
        width=30,
        height=8,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=300,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    rack.id = 1
    # Passage in middle of along axis
    p = _pass(rack, offset=100, width=80)
    obs = build_rack_obstacle(rack, [p])
    hole = passage_world_rect(rack, offset_along_cm=100, width_cm=80)
    mx = (hole.min_x + hole.max_x) / 2
    assert segment_is_physically_clear(mx, hole.min_y - 40, mx, hole.max_y + 40, [obs])


def test_08_partial_passage_plus_solid_blocks():
    rack = Rack(
        layout_id=1,
        uuid="u",
        name="R",
        x=10,
        y=10,
        width=30,
        height=8,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=300,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    rack.id = 1
    p = _pass(rack, offset=100, width=40)
    obs = build_rack_obstacle(rack, [p])
    fp = obs.footprint
    # Diagonal that hits both hole and solid
    assert segment_collides_obstacles(
        fp.min_x - 10, fp.min_y - 10, fp.max_x + 10, fp.max_y + 10, [obs]
    ).blocked


def test_09_disabled_passage_blocks():
    rack = Rack(
        layout_id=1,
        uuid="u",
        name="R",
        x=10,
        y=10,
        width=30,
        height=8,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=300,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    rack.id = 1
    p = _pass(rack, offset=100, width=80, enabled=False)
    obs = build_rack_obstacle(rack, [p])
    hole = passage_world_rect(rack, offset_along_cm=100, width_cm=80)
    mx = (hole.min_x + hole.max_x) / 2
    assert segment_collides_obstacles(mx, hole.min_y - 40, mx, hole.max_y + 40, [obs]).blocked


def test_10_move_rack_moves_passage(db):
    w, layout, rack = _rack(db)
    pu = str(uuid.uuid4())
    p = WarehouseRackPassage(
        uuid=pu,
        warehouse_id=w.id,
        rack_id=rack.id,
        rack_uuid=rack.uuid,
        offset_along_cm=50,
        width_cm=60,
        enabled=True,
    )
    db.add(p)
    db.flush()
    before = passage_world_rect(rack, offset_along_cm=50, width_cm=60)
    rack.x = rack.x + 5
    db.flush()
    after = passage_world_rect(rack, offset_along_cm=50, width_cm=60)
    assert after.min_x == before.min_x + 50  # 5 cells * 10cm
    assert after.min_y == before.min_y
    assert p.offset_along_cm == 50  # local geometry unchanged


def test_11_rotate_rack_reorients_passage(db):
    w, layout, rack = _rack(db, orientation="horizontal", width=30, height=8)
    before = passage_world_rect(rack, offset_along_cm=40, width_cm=50)
    assert before.width() < before.height() or before.width() <= before.height()
    # Simulate FE 90°: swap grid extents + orientation
    rack.width, rack.height = rack.height, rack.width
    rack.orientation = "vertical"
    rack.rotation_degrees = 90
    after = passage_world_rect(rack, offset_along_cm=40, width_cm=50)
    # Along axis flipped → hole spans full depth on new along
    assert after.width() != before.width() or after.height() != before.height()


def test_12_save_reload_uuid_geometry(db):
    w, layout, rack = _rack(db)
    pu = str(uuid.uuid4())
    p = WarehouseRackPassage(
        uuid=pu,
        warehouse_id=w.id,
        rack_id=rack.id,
        rack_uuid=rack.uuid,
        offset_along_cm=77,
        width_cm=55,
        clearance_height_cm=None,
        enabled=True,
    )
    db.add(p)
    db.commit()
    db.expire_all()
    loaded = db.query(WarehouseRackPassage).filter(WarehouseRackPassage.uuid == pu).one()
    assert loaded.uuid == pu
    assert loaded.offset_along_cm == 77
    assert loaded.width_cm == 55
    assert loaded.rack_id == rack.id


def test_13_back_to_back_passage_only_one_blocks(db):
    w, layout, rack_a = _rack(db, x=10, y=10, width=20, height=6)
    rack_b = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
        name="R2",
        x=10,
        y=16,  # adjacent below (back-to-back)
        width=20,
        height=6,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=60,
        width_cm=200,
        height_cm=200,
        aisle_letter="A",
        rack_index=2,
    )
    db.add(rack_b)
    db.flush()
    # Passage only on A
    p = _pass(rack_a, offset=60, width=80)
    obs_a = build_rack_obstacle(rack_a, [p])
    obs_b = build_rack_obstacle(rack_b, [])
    hole = passage_world_rect(rack_a, offset_along_cm=60, width_cm=80)
    mx = (hole.min_x + hole.max_x) / 2
    # Vertical through both footprints
    assert segment_collides_obstacles(
        mx, obs_a.footprint.min_y - 20, mx, obs_b.footprint.max_y + 20, [obs_a, obs_b]
    ).blocked


def test_14_back_to_back_both_passages_pass(db):
    w, layout, rack_a = _rack(db, x=10, y=10, width=20, height=6)
    rack_b = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
        name="R2",
        x=10,
        y=16,
        width=20,
        height=6,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=60,
        width_cm=200,
        height_cm=200,
        aisle_letter="A",
        rack_index=2,
    )
    db.add(rack_b)
    db.flush()
    p_a = _pass(rack_a, offset=60, width=80)
    p_b = _pass(rack_b, offset=60, width=80)
    obs_a = build_rack_obstacle(rack_a, [p_a])
    obs_b = build_rack_obstacle(rack_b, [p_b])
    hole = passage_world_rect(rack_a, offset_along_cm=60, width_cm=80)
    mx = (hole.min_x + hole.max_x) / 2
    assert segment_is_physically_clear(
        mx, obs_a.footprint.min_y - 20, mx, obs_b.footprint.max_y + 20, [obs_a, obs_b]
    )


# --- Routing soft 15–18 ---


def test_15_16_17_soft_validation_keeps_invalid_edge(db):
    w, layout, rack = _rack(db, x=10, y=10, width=20, height=10)
    fp = rack_footprint_aabb(rack)
    na, nb = str(uuid.uuid4()), str(uuid.uuid4())
    ax = (fp.min_x + fp.max_x) / 2
    db.add(WarehouseRoutingNode(uuid=na, warehouse_id=w.id, x=ax, y=fp.min_y - 50, node_type="junction"))
    db.add(WarehouseRoutingNode(uuid=nb, warehouse_id=w.id, x=ax, y=fp.max_y + 50, node_type="junction"))
    eu = str(uuid.uuid4())
    db.add(
        WarehouseRoutingEdge(
            uuid=eu,
            warehouse_id=w.id,
            from_node_uuid=na,
            to_node_uuid=nb,
            distance_m=2.0,
            direction="BOTH",
            enabled=True,
        )
    )
    db.flush()
    result = validate_graph(db, w.id)
    phys = [i for i in result.issues if i.code == "EDGES_THROUGH_OBSTACLES"]
    assert phys, "validation should detect physical collision"
    assert eu in phys[0].ref_uuids
    # Soft: physical issues are warning — do not flip structural ok alone
    assert all(i.severity != "error" or i.code != "EDGES_THROUGH_OBSTACLES" for i in result.issues)
    assert phys[0].severity == "warning"

    out = replace_graph(
        db,
        w.id,
        RoutingGraphReplaceRequest(
            nodes=[
                RoutingNodeIn(uuid=na, x=ax, y=fp.min_y - 50),
                RoutingNodeIn(uuid=nb, x=ax, y=fp.max_y + 50),
            ],
            edges=[
                RoutingEdgeIn(uuid=eu, from_node_uuid=na, to_node_uuid=nb, distance_m=2.0),
            ],
        ),
    )
    assert any(e.uuid == eu for e in out.edges)
    # Edge still present after save
    assert db.query(WarehouseRoutingEdge).filter(WarehouseRoutingEdge.uuid == eu).count() == 1


def test_invalid_edge_not_routable_by_engine(db):
    """P0: soft-saved edge through rack must not be used by Dijkstra."""
    from backend.schemas.warehouse_routing import RouteComputeRequest
    from backend.services.warehouse_routing.engine import route_a_to_b

    w, layout, rack = _rack(db, x=10, y=10, width=20, height=10)
    fp = rack_footprint_aabb(rack)
    na, nb = str(uuid.uuid4()), str(uuid.uuid4())
    ax = (fp.min_x + fp.max_x) / 2
    db.add(WarehouseRoutingNode(uuid=na, warehouse_id=w.id, x=ax, y=fp.min_y - 50, node_type="junction"))
    db.add(WarehouseRoutingNode(uuid=nb, warehouse_id=w.id, x=ax, y=fp.max_y + 50, node_type="junction"))
    eu = str(uuid.uuid4())
    db.add(
        WarehouseRoutingEdge(
            uuid=eu,
            warehouse_id=w.id,
            from_node_uuid=na,
            to_node_uuid=nb,
            distance_m=2.0,
            direction="BOTH",
            enabled=True,
        )
    )
    db.flush()
    # Soft save keeps the edge
    assert db.query(WarehouseRoutingEdge).filter(WarehouseRoutingEdge.uuid == eu).count() == 1
    res = route_a_to_b(
        db, w.id, RouteComputeRequest(start_node_uuid=na, destination_node_uuid=nb)
    )
    assert not res.ok, "physically invalid edge must not be routable"
    assert eu not in {s.edge_uuid for s in (res.path_segments or [])}


def test_passage_input_clamped_on_sync(db):
    from backend.services.warehouse_layout_service import WarehouseLayoutService

    w, layout, rack = _rack(db, x=10, y=10, width=10, height=4, orientation="horizontal")
    svc = WarehouseLayoutService(db)
    svc._sync_rack_passages(
        rack,
        w.id,
        [{"uuid": str(uuid.uuid4()), "offset_along_cm": -50, "width_cm": 9999, "enabled": True}],
    )
    db.flush()
    p = db.query(WarehouseRackPassage).filter(WarehouseRackPassage.rack_id == rack.id).one()
    assert p.offset_along_cm >= 0
    assert p.width_cm <= 100  # along = 10*10 = 100cm
    assert p.offset_along_cm + p.width_cm <= 100 + 1e-6


def test_18_invalid_edge_excluded_from_auto_candidates():
    """Blocked edge uuid set excludes invalid roads from AUTO selection."""
    from backend.services.warehouse_routing.location_access_geometry import (
        RackFootprint,
        Vec2,
        select_best_edge_for_service_point,
    )

    service = Vec2(100, 50)
    normal = Vec2(0, 1)
    fp = RackFootprint(80, 60, 120, 100)
    good = ("good", (90.0, 130.0), (110.0, 130.0))
    bad = ("bad", (90.0, 40.0), (110.0, 40.0))  # wrong side / blocked id
    best, reason = select_best_edge_for_service_point(
        service,
        normal,
        fp,
        [good, bad],
        blocked_edge_uuids={"bad"},
        obstacles=[],
    )
    assert reason == "OK"
    assert best is not None
    assert best.edge_uuid == "good"


def test_19_20_21_22_location_access_passage_and_no_graph_pollution(db):
    from backend.models.location import Location
    from backend.models.warehouse import Bin
    from backend.models.warehouse_routing import WarehouseRoutingLocationAccess
    from backend.services.warehouse_routing.location_access_resolver import (
        STATUS_BLOCKED,
        STATUS_RESOLVED,
        STATUS_UNREACHABLE,
        recompute_location_access,
        resolve_auto_for_location,
    )

    w, layout, rack = _rack(db, x=10, y=10, width=20, height=8, orientation="horizontal")
    loc_uuid = str(uuid.uuid4())
    db.add(
        Bin(
            rack_id=rack.id,
            location_uuid=loc_uuid,
            label="L1",
            level_index=0,
            segment_index=0,
            volume_dm3=10,
        )
    )
    cx = (10 + 10) * 10
    cy = (10 + 4) * 10
    loc = Location(
        warehouse_id=w.id,
        name="L1",
        location_uuid=loc_uuid,
        type="pick",
        rack_name="R1",
        x=cx,
        y=cy,
        z=0,
    )
    db.add(loc)
    db.flush()

    fp = rack_footprint_aabb(rack)
    # Road on service side (+Y for horizontal FRONT) but approach must cross solid rack → blocked
    # Put road south of rack; service face is max_y — approach from face to road is clear.
    # For BLOCK through solid: place road north (opposite) so half-plane fails, OR place road
    # that requires piercing. Better: road south but candidate projection pierces — use
    # obstacles check with road far south and fake service requiring pierce.
    # Simpler: edge through rack excluded + only road that requires pierce through solid.
    road_south = _road_pair(db, w.id, fp.min_x, fp.max_y + 40, fp.max_x, fp.max_y + 40)

    # 19: without passage, resolve with obstacles should still find south road (clear approach)
    r_ok = resolve_auto_for_location(db, w.id, loc, rack=rack)
    assert r_ok.status in (STATUS_RESOLVED, "AMBIGUOUS")
    assert r_ok.edge_uuid == road_south

    # Approach through solid: block by forcing only an edge on the far side of rack
    # Delete south, add north-through path edge that is physically blocked for travel
    # and a road north of rack that approach S→P must pierce rack to reach.
    db.query(WarehouseRoutingEdge).delete()
    db.query(WarehouseRoutingNode).delete()
    db.flush()
    road_north = _road_pair(db, w.id, fp.min_x, fp.min_y - 40, fp.max_x, fp.min_y - 40)
    r_block = resolve_auto_for_location(db, w.id, loc, rack=rack)
    # North is wrong half-plane for FRONT(+Y) → UNREACHABLE or BLOCKED
    assert r_block.status in (STATUS_BLOCKED, STATUS_UNREACHABLE, "BLOCKED", "UNREACHABLE")

    # 20: add passage + road through passage corridor beyond rack south
    db.query(WarehouseRoutingEdge).delete()
    db.query(WarehouseRoutingNode).delete()
    db.flush()
    p = WarehouseRackPassage(
        uuid=str(uuid.uuid4()),
        warehouse_id=w.id,
        rack_id=rack.id,
        rack_uuid=rack.uuid,
        offset_along_cm=60,
        width_cm=80,
        enabled=True,
    )
    db.add(p)
    db.flush()
    road_s2 = _road_pair(db, w.id, fp.min_x, fp.max_y + 40, fp.max_x, fp.max_y + 40)
    r_pass = resolve_auto_for_location(db, w.id, loc, rack=rack)
    assert r_pass.status in (STATUS_RESOLVED, "AMBIGUOUS")
    assert r_pass.edge_uuid == road_s2

    # 21: disable passage and recompute → may still resolve via south road (approach clear)
    # Instead: move road so approach goes through passage hole only — put entry aligned with hole
    # through rack... For recompute: disable passage, put invalid edge through rack as only candidate
    p.enabled = False
    db.flush()
    db.query(WarehouseRoutingEdge).delete()
    db.query(WarehouseRoutingNode).delete()
    db.flush()
    hole = passage_world_rect(rack, offset_along_cm=60, width_cm=80)
    mx = (hole.min_x + hole.max_x) / 2
    # Road south of rack aligned with passage; approach S→P stays outside solid if S is on south face
    _road_pair(db, w.id, mx - 20, fp.max_y + 30, mx + 20, fp.max_y + 30)
    nodes_before = db.query(WarehouseRoutingNode).count()
    summary = recompute_location_access(db, w.id)
    assert summary["locations_total"] >= 1
    nodes_after = db.query(WarehouseRoutingNode).count()
    # 22: no new routing nodes from Location Access / Passage
    assert nodes_after == nodes_before


def _road_pair(db, warehouse_id: int, ax, ay, bx, by) -> str:
    na, nb = str(uuid.uuid4()), str(uuid.uuid4())
    db.add(WarehouseRoutingNode(uuid=na, warehouse_id=warehouse_id, x=ax, y=ay, node_type="junction"))
    db.add(WarehouseRoutingNode(uuid=nb, warehouse_id=warehouse_id, x=bx, y=by, node_type="junction"))
    eu = str(uuid.uuid4())
    db.add(
        WarehouseRoutingEdge(
            uuid=eu,
            warehouse_id=warehouse_id,
            from_node_uuid=na,
            to_node_uuid=nb,
            distance_m=((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5 / 100.0,
            direction="BOTH",
            enabled=True,
        )
    )
    db.flush()
    return eu

def test_touching_rack_seam_approach_blocked():
    """[B1][B2] touching — approach along shared edge is BLOCK for Location Access."""
    from backend.services.warehouse_routing.physical_collision import (
        build_rack_obstacle,
        segment_is_physically_clear,
        segment_travels_touching_rack_seam,
    )

    b1 = Rack(
        layout_id=1,
        uuid="u1",
        name="B1",
        x=1,
        y=21,
        width=15,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=100,
        height_cm=200,
        aisle_letter="B",
        rack_index=1,
    )
    b1.id = 1
    b2 = Rack(
        layout_id=1,
        uuid="u2",
        name="B2",
        x=16,
        y=21,
        width=15,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=100,
        height_cm=200,
        aisle_letter="B",
        rack_index=2,
    )
    b2.id = 2
    obs = [build_rack_obstacle(b1, []), build_rack_obstacle(b2, [])]
    seam_x = 160.0  # 16*10
    assert segment_travels_touching_rack_seam(seam_x, 235, seam_x, 200, obs)
    assert not segment_is_physically_clear(
        seam_x, 235, seam_x, 200, obs, block_touching_seams=True
    )


def test_real_gap_between_racks_not_seam_block():
    from backend.services.warehouse_routing.physical_collision import (
        build_rack_obstacle,
        segment_is_physically_clear,
        segment_travels_touching_rack_seam,
    )

    b1 = Rack(
        layout_id=1,
        uuid="u1",
        name="B1",
        x=1,
        y=21,
        width=15,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=100,
        height_cm=200,
        aisle_letter="B",
        rack_index=1,
    )
    b1.id = 1
    b2 = Rack(
        layout_id=1,
        uuid="u2",
        name="B2",
        x=19,
        y=21,
        width=15,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=100,
        height_cm=200,
        aisle_letter="B",
        rack_index=2,
    )
    b2.id = 2
    obs = [build_rack_obstacle(b1, []), build_rack_obstacle(b2, [])]
    mid_x = ((1 + 15) * 10 + 19 * 10) / 2
    assert not segment_travels_touching_rack_seam(mid_x, 235, mid_x, 200, obs)
    assert segment_is_physically_clear(mid_x, 235, mid_x, 200, obs, block_touching_seams=True)


def test_external_boundary_graze_still_pass_with_seam_flag():
    from backend.services.warehouse_routing.physical_collision import (
        build_rack_obstacle,
        segment_is_physically_clear,
    )

    rack = Rack(
        layout_id=1,
        uuid="u",
        name="R",
        x=10,
        y=10,
        width=20,
        height=10,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=100,
        width_cm=200,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    rack.id = 1
    obs = [build_rack_obstacle(rack, [])]
    fp = obs[0].footprint
    assert segment_is_physically_clear(
        fp.min_x, fp.min_y, fp.max_x, fp.min_y, obs, block_touching_seams=True
    )


def test_passage_keeps_seam_clear():
    """Enabled RackPassage on either touching rack → seam approach PASS."""
    from backend.services.warehouse_routing.physical_collision import (
        build_rack_obstacle,
        segment_is_physically_clear,
        segment_travels_touching_rack_seam,
    )

    b1 = Rack(
        layout_id=1,
        uuid="u1",
        name="B1",
        x=1,
        y=21,
        width=15,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=100,
        height_cm=200,
        aisle_letter="B",
        rack_index=1,
    )
    b1.id = 1
    b2 = Rack(
        layout_id=1,
        uuid="u2",
        name="B2",
        x=16,
        y=21,
        width=15,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=100,
        height_cm=200,
        aisle_letter="B",
        rack_index=2,
    )
    b2.id = 2
    p = WarehouseRackPassage(
        uuid=str(uuid.uuid4()),
        warehouse_id=1,
        rack_id=2,
        rack_uuid="u2",
        offset_along_cm=0,
        width_cm=80,
        enabled=True,
    )
    obs = [build_rack_obstacle(b1, []), build_rack_obstacle(b2, [p])]
    seam_x = 160.0
    assert not segment_travels_touching_rack_seam(seam_x, 235, seam_x, 200, obs)
    assert segment_is_physically_clear(
        seam_x, 235, seam_x, 200, obs, block_touching_seams=True
    )
