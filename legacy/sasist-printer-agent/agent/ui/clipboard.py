"""Clipboard helpers with visual button feedback."""

from __future__ import annotations

import customtkinter as ctk

from ..i18n import pl as PL

COPY_FEEDBACK_MS = 2000


def copy_to_clipboard(widget: ctk.CTkBaseClass, text: str) -> bool:
    if not text:
        return False
    try:
        widget.clipboard_clear()
        widget.clipboard_append(text)
        return True
    except Exception:
        return False


def copy_button_feedback(
    button: ctk.CTkButton,
    text: str,
    *,
    original_text: str | None = None,
) -> bool:
    if not copy_to_clipboard(button, text):
        return False
    label = original_text if original_text is not None else str(button.cget("text"))
    button.configure(text=PL.COPIED)

    def restore() -> None:
        if button.winfo_exists():
            button.configure(text=label)

    button.after(COPY_FEEDBACK_MS, restore)
    return True
