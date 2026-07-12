"""Agent release version endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ...auth.deps import get_current_user
from ...models.app_user import AppUser
from ...schemas.printing.release import (
    AgentDownloadDebugResponse,
    AgentDownloadInfoResponse,
    AgentVersionResponse,
)
from ...services.printing.agent_auth_service import get_current_agent
from ...services.printing.github_release_service import (
    get_latest_printer_agent_release,
    get_printer_agent_download_debug,
    is_dev_environment,
)
from ...services.printing.release_service import AGENT_UPDATE_MANDATORY

router = APIRouter()


@router.get("/agent/download-info", response_model=AgentDownloadInfoResponse)
def get_agent_download_info(
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
):
    """Public installer metadata for the settings onboarding modal."""
    release = get_latest_printer_agent_release()
    return AgentDownloadInfoResponse(
        download_url=release.download_url,
        latest_version=release.version,
        source=release.source,
    )


@router.get("/agent/download-debug", response_model=AgentDownloadDebugResponse)
def get_agent_download_debug(
    tenant_id: int = Query(..., ge=1),
    force_refresh: bool = Query(default=False),
    _: AppUser = Depends(get_current_user),
):
    """Diagnostic resolver output — available only in dev / non-production environments."""
    if not is_dev_environment():
        raise HTTPException(status_code=404, detail="Not found")
    debug = get_printer_agent_download_debug(force_refresh=force_refresh)
    return AgentDownloadDebugResponse(
        source=debug.source,
        url=debug.url,
        env_url=debug.env_url,
        github_repository=debug.github_repository,
        cache_hit=debug.cache_hit,
        latest_version=debug.latest_version,
    )


@router.get("/agent/version", response_model=AgentVersionResponse)
def get_agent_version(
    tenant_id: int | None = Query(default=None, ge=1),
    _=Depends(get_current_agent),
):
    release = get_latest_printer_agent_release()
    return AgentVersionResponse(
        version=release.version,
        download_url=release.download_url,
        mandatory=AGENT_UPDATE_MANDATORY,
    )
