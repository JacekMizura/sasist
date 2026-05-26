#!/usr/bin/env python3
"""
Jednorazowa migracja: stany z lokalizacji „Import” → strefa przyjęcia (PRZYJĘCIE/BUFOR / DOCK),
usunięcie zerowych wierszy inventory, dezaktywacja pustej lokalizacji „Import”.

Uruchomienie z katalogu głównego repozytorium:
  python -m backend.scripts.cleanup_import_placeholder_locations
  python -m backend.scripts.cleanup_import_placeholder_locations --warehouse-id 1 --apply
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend import models  # noqa: F401
from backend.database import SessionLocal
from backend.services.inventory_placeholder_cleanup import cleanup_import_placeholder_locations


def main() -> None:
    p = argparse.ArgumentParser(description="Migracja stanów z lokalizacji „Import”.")
    p.add_argument("--warehouse-id", type=int, default=None, help="Ogranicz do jednego magazynu.")
    p.add_argument(
        "--apply",
        action="store_true",
        help="Zapisz zmiany w bazie (bez tej flagi: tylko symulacja i statystyki).",
    )
    args = p.parse_args()
    dry = not args.apply
    db = SessionLocal()
    try:
        result = cleanup_import_placeholder_locations(db, warehouse_id=args.warehouse_id, dry_run=dry)
        print(result)
    finally:
        db.close()


if __name__ == "__main__":
    main()
