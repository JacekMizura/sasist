"""Etap 3.2 — Putaway nearest / ranking must not use Location.pick_sequence."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_putaway_strategy_no_pick_sequence_routing():
    src = (ROOT / "services" / "slotting" / "putaway_strategy_service.py").read_text(encoding="utf-8")
    assert "hop_cost_m" in src or "putaway_hop_cost_m" in src
    assert "runtime_graph_reader" in src or "putaway_hop_cost_m" in src
    assert "Location.pick_sequence" not in src
    assert "500.0 - float(pick_sequence)" not in src
    assert "pick_sequence=getattr" not in src


def test_wms_putaway_fallback_no_pick_sequence_priority():
    src = (ROOT / "services" / "wms_putaway_service.py").read_text(encoding="utf-8")
    assert "putaway_hop_cost_m" in src
    assert "10_000.0 - seq_score" not in src
    assert "getattr(loc, \"pick_sequence\"" not in src
    assert "getattr(loc, 'pick_sequence'" not in src
