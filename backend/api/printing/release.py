"""Agent release version endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ...schemas.printing.release import AgentVersionResponse
from ...services.printing.agent_auth_service import get_current_agent
from ...services.printing.release_service import (
    AGENT_DOWNLOAD_URL,
    AGENT_RELEASE_VERSION,
    AGENT_UPDATE_MANDATORY,
)

router = APIRouter()


@router.get("/agent/version", response_model=AgentVersionResponse)
def get_agent_version(
    tenant_id: int = Query(..., ge=1),
    _=Depends(get_current_agent),
):
    return AgentVersionResponse(
        version=AGENT_RELEASE_VERSION,
        download_url=AGENT_DOWNLOAD_URL,
        mandatory=AGENT_UPDATE_MANDATORY,
    )
