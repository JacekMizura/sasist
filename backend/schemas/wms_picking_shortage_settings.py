"""API: ustawienia obsługi braków przy zbieraniu WMS."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

ShortageResolvePriority = Literal["normal", "high", "immediate_picking"]


class WmsPickingShortageSettingsRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    shortage_reported_order_ui_status_id: Optional[int] = Field(
        default=None,
        description="Status OMS po zgłoszeniu braku podczas zbierania (null = nie zmieniaj przy zgłoszeniu).",
    )
    auto_enqueue_braki: bool = Field(default=True, description="Automatycznie umieść zamówienie w kolejce Braki (Order Issues).")
    allow_continue_other_lines_after_shortage: bool = Field(
        default=True,
        description="Picker może kontynuować inne linie po zgłoszeniu braku na jednej.",
    )
    priority_after_shortage_resolved: ShortageResolvePriority = Field(
        default="high",
        description="Priorytet po rozwiązaniu problemu (sortowanie kolejek).",
    )
    auto_reopen_picking_after_shortage_resolved: bool = Field(
        default=True,
        description="Po rozwiązaniu problemu pokaż zamówienie ponownie w zbieraniu.",
    )
    recovery_completed_order_ui_status_id: Optional[int] = Field(
        default=None,
        description="Status OMS po domknięciu dogrywki zbierki (null = ustawienia pakowania start_status_id jeśli jest).",
    )
    wms_validation_failed_order_ui_status_id: Optional[int] = Field(
        default=None,
        description="Status panelu po nieudanej Walidacji WMS (null = gate bez zmiany statusu).",
    )


class WmsPickingShortageSettingsSave(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: Optional[int] = Field(default=None, ge=1)
    shortage_reported_order_ui_status_id: Optional[int] = None
    auto_enqueue_braki: bool = True
    allow_continue_other_lines_after_shortage: bool = True
    priority_after_shortage_resolved: ShortageResolvePriority = "high"
    auto_reopen_picking_after_shortage_resolved: bool = True
    recovery_completed_order_ui_status_id: Optional[int] = None
    wms_validation_failed_order_ui_status_id: Optional[int] = None