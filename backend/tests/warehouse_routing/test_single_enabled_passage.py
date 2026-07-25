"""Hard rule: at most one enabled under-rack passage — reject, never soft-pick."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.schemas.warehouse_layout import RackSchema
from backend.schemas.warehouse_template import WarehouseTemplatePayload
from backend.services.warehouse_layout.passage_void import get_passage_void_height_cm
from backend.services.warehouse_layout.single_passage import (
    SINGLE_ENABLED_PASSAGE_ERROR,
    MultipleEnabledPassagesError,
    assert_at_most_one_enabled_passage,
    count_enabled_passages,
    has_multiple_enabled_passages,
)
from backend.services.warehouse_template_service import _default_passages_to_json


def test_assert_rejects_two_enabled():
    with pytest.raises(MultipleEnabledPassagesError) as ei:
        assert_at_most_one_enabled_passage(
            [
                {"enabled": True, "clearance_height_cm": 80},
                {"enabled": True, "clearance_height_cm": 120},
            ]
        )
    assert str(ei.value) == SINGLE_ENABLED_PASSAGE_ERROR


def test_assert_allows_one_enabled_plus_disabled():
    assert_at_most_one_enabled_passage(
        [
            {"enabled": False, "clearance_height_cm": 200},
            {"enabled": True, "clearance_height_cm": 80},
        ]
    )
    assert count_enabled_passages([{"enabled": True}, {"enabled": False}]) == 1
    assert has_multiple_enabled_passages([{"enabled": True}]) is False


def test_void_height_rejects_multiple_enabled():
    with pytest.raises(MultipleEnabledPassagesError):
        get_passage_void_height_cm(
            [
                {"enabled": True, "clearance_height_cm": 80},
                {"enabled": True, "clearance_height_cm": 160},
            ]
        )


def test_void_height_single_enabled():
    assert (
        get_passage_void_height_cm(
            [
                {"enabled": False, "clearance_height_cm": 200},
                {"enabled": True, "clearance_height_cm": 80},
            ]
        )
        == 80
    )


def test_rack_schema_rejects_two_enabled_passages():
    with pytest.raises(ValidationError) as ei:
        RackSchema(
            name="R1",
            passages=[
                {"offset_along_cm": 10, "width_cm": 40, "enabled": True},
                {"offset_along_cm": 60, "width_cm": 40, "enabled": True},
            ],
        )
    assert SINGLE_ENABLED_PASSAGE_ERROR in str(ei.value)


def test_rack_schema_allows_one_enabled():
    rack = RackSchema(
        name="R1",
        passages=[
            {"offset_along_cm": 10, "width_cm": 40, "enabled": False},
            {"offset_along_cm": 60, "width_cm": 40, "enabled": True},
        ],
    )
    assert rack.passages is not None
    assert len(rack.passages) == 2


def test_template_payload_rejects_two_enabled_defaults():
    with pytest.raises(ValidationError) as ei:
        WarehouseTemplatePayload(
            id="t1",
            name="T",
            default_passages=[
                {"offset_along_cm": 10, "width_cm": 40, "enabled": True},
                {"offset_along_cm": 60, "width_cm": 40, "enabled": True},
            ],
        )
    assert SINGLE_ENABLED_PASSAGE_ERROR in str(ei.value)


def test_default_passages_to_json_rejects_two_enabled():
    with pytest.raises(HTTPException) as ei:
        _default_passages_to_json(
            [
                {"offset_along_cm": 10, "width_cm": 40, "enabled": True},
                {"offset_along_cm": 60, "width_cm": 40, "enabled": True},
            ]
        )
    assert ei.value.status_code == 400
    assert ei.value.detail == SINGLE_ENABLED_PASSAGE_ERROR


def test_default_passages_to_json_allows_single():
    raw = _default_passages_to_json(
        [{"offset_along_cm": 40, "width_cm": 90, "clearance_height_cm": 120, "enabled": True}]
    )
    assert raw is not None
    assert "90" in raw
