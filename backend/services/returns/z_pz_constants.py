"""Canonical warehouse document type for RMZ return receipts (PZ zwrotna)."""

from __future__ import annotations

# DB value — UI label „Z-PZ”
Z_PZ = "Z_PZ"

# Legacy aliases kept for putaway / queries on older rows
PZ_RT = "PZ_RT"
RETURN_RECEIPT = "RETURN_RECEIPT"

RETURN_RECEIPT_DOCUMENT_TYPES = frozenset({Z_PZ, PZ_RT, RETURN_RECEIPT})

DISPOSITION_SALEABLE = "SALEABLE"
DISPOSITION_OUTLET_B = "OUTLET_B"
DISPOSITION_SERVICE_C = "SERVICE_C"
