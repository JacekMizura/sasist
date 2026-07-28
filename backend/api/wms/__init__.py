"""WMS API package."""

from fastapi import APIRouter

from .workstations import router as workstations_router

router = APIRouter()
router.include_router(workstations_router)

__all__ = ["router", "workstations_router"]
