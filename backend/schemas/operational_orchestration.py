from __future__ import annotations

from pydantic import BaseModel, Field


class TaskTransitionBody(BaseModel):
    new_state: str = Field(..., min_length=1, max_length=16)
    blocked_reason: str | None = Field(None, max_length=128)


class TaskAssignBody(BaseModel):
    operator_user_id: int = Field(..., ge=1)
    activate: bool = False


class TaskOrchestrationRead(BaseModel):
    task_id: int
    orchestration_state: str | None = None
    status: str
    assigned_user_id: int | None = None
    blocked_reason: str | None = None
