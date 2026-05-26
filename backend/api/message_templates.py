"""API: szablony wiadomości — rezerwacja ścieżki pod przyszły CRUD (bez zmiany istniejących modułów)."""

from fastapi import APIRouter

# Mounted in main.py under `/api/admin/message-templates` and legacy `/api/message-templates`.
router = APIRouter(tags=["Message templates"])


@router.get("/")
def list_message_templates():
    """Zwraca pustą listę do czasu wdrożenia pełnego modułu szablonów wiadomości."""
    return []
