"""Parallel Edge Device Management API (migration alongside /printing)."""

from __future__ import annotations

from fastapi import APIRouter

from .actions import router as actions_router
from .devices import router as devices_router
from .events import router as events_router
from .modules import router as modules_router

router = APIRouter(prefix="/agent", tags=["Edge Agent Devices"])
router.include_router(devices_router)
router.include_router(modules_router)
router.include_router(actions_router)
router.include_router(events_router)
