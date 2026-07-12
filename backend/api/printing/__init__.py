"""Sasist Printer Agent MVP — HTTP API."""

from fastapi import APIRouter

from .agents import router as agents_router
from .auto_print import router as auto_print_router
from .defaults import router as defaults_router
from .jobs import router as jobs_router
from .printers import router as printers_router
from .release import router as release_router

router = APIRouter(prefix="/printing", tags=["Printing"])
router.include_router(agents_router)
router.include_router(printers_router)
router.include_router(jobs_router)
router.include_router(defaults_router)
router.include_router(release_router)
router.include_router(auto_print_router)
