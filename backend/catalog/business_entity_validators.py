"""Optional tax ID / NIP-style identifiers for manufacturers and suppliers."""

from __future__ import annotations

import re
from typing import Optional


def validate_tax_id_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    compact = re.sub(r"[\s\-]", "", raw)
    if len(compact) > 20:
        raise ValueError("NIP / identyfikator: maks. 20 znaków (bez spacji i myślników)")
    if not re.match(r"^[0-9A-Za-z]+$", compact):
        raise ValueError("NIP: dozwolone są tylko cyfry i litery (oraz spacje/myślniki w zapisie)")
    return raw
