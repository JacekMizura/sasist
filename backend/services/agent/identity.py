"""Edge agent identity — business APIs use EdgeAgent; PrinterAgent remains physical/compat alias."""

from __future__ import annotations

from ...models.printing.printer_agent import PrinterAgent

# Compat physical model until Etap 5 rename (printer_agents → edge_agents).
EdgeAgent = PrinterAgent

__all__ = ["EdgeAgent", "PrinterAgent"]
