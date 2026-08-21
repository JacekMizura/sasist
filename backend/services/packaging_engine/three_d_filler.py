"""3D Matching filler reserve — shrink usable carton volume by filler_percent.

Semantics (Sellasist-aligned):
  filler_pct ∈ [0, 99]
  u = 1 - filler_pct / 100          # remaining usable volume fraction
  scale = u ** (1/3)                # isotropic edge scale so volume *= u
  usable_L/W/H *= scale

filler_pct = 0 → identity (same usable dimensions as before).
filler_pct = 100 is rejected / clamped — zero usable volume is undefined for fit.
"""

from __future__ import annotations

from dataclasses import replace

from ..fit_engine.models import FitContainer

MAX_FILLER_PERCENT = 99.0


def clamp_filler_percent(raw: object) -> float:
    try:
        v = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    if v != v:
        return 0.0
    return max(0.0, min(MAX_FILLER_PERCENT, v))


def filler_edge_scale(filler_percent: float) -> float:
    f = clamp_filler_percent(filler_percent)
    if f <= 0:
        return 1.0
    u = 1.0 - (f / 100.0)
    if u <= 0:
        return 0.0
    return float(u ** (1.0 / 3.0))


def apply_filler_to_container(container: FitContainer, filler_percent: float) -> FitContainer:
    """Return a new FitContainer with usable dims shrunk for filler reserve."""
    scale = filler_edge_scale(filler_percent)
    if abs(scale - 1.0) < 1e-12:
        return container
    warn = tuple(container.warnings) + ("FILLER_RESERVE_APPLIED",)
    return replace(
        container,
        length_cm=float(container.length_cm) * scale,
        width_cm=float(container.width_cm) * scale,
        height_cm=float(container.height_cm) * scale,
        warnings=warn,
    )
