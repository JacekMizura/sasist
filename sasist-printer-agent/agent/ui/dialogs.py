"""Custom styled dialogs — replace default Tk message boxes."""

from __future__ import annotations

import tkinter as tk
from typing import Literal

from . import theme as T
from .widgets import app_header, primary_button

DialogTone = Literal["info", "error", "success"]


def show_message(
    parent: tk.Misc,
    *,
    title: str,
    message: str,
    tone: DialogTone = "info",
) -> None:
    dialog = tk.Toplevel(parent)
    dialog.title(f"Sasist Printer Agent — {title}")
    dialog.configure(bg=T.BG)
    dialog.resizable(False, False)
    dialog.transient(parent.winfo_toplevel())
    dialog.grab_set()

    shell = tk.Frame(dialog, bg=T.BG, padx=T.PADDING, pady=T.PADDING)
    shell.pack(fill="both", expand=True)

    app_header(shell, title)

    palette = {
        "info": (T.PRIMARY_LIGHT, T.NEUTRAL_TEXT),
        "error": (T.DANGER_LIGHT, T.DANGER),
        "success": (T.SUCCESS_LIGHT, T.SUCCESS),
    }
    bg, fg = palette.get(tone, palette["info"])

    body = tk.Frame(shell, bg=T.BORDER, padx=1, pady=1)
    body.pack(fill="both", expand=True, pady=(12, 0))
    card = tk.Frame(body, bg=T.CARD, padx=T.CARD_PADX, pady=T.CARD_PADY)
    card.pack(fill="both", expand=True)
    tk.Label(
        card,
        text=message,
        font=T.FONT_FAMILY,
        fg=fg if tone == "error" else T.NEUTRAL_TEXT,
        bg=bg if tone != "info" else T.CARD,
        wraplength=360,
        justify="left",
        padx=12 if tone != "info" else 0,
        pady=12 if tone != "info" else 0,
    ).pack(fill="x")

    footer = tk.Frame(shell, bg=T.BG)
    footer.pack(fill="x", pady=(12, 0))
    primary_button(footer, "OK", dialog.destroy).pack(side="right")

    dialog.update_idletasks()
    width = max(420, dialog.winfo_reqwidth())
    height = dialog.winfo_reqheight()
    parent_root = parent.winfo_toplevel()
    try:
        px = parent_root.winfo_x() + (parent_root.winfo_width() - width) // 2
        py = parent_root.winfo_y() + (parent_root.winfo_height() - height) // 2
    except tk.TclError:
        px, py = 200, 200
    dialog.geometry(f"{width}x{height}+{max(px, 0)}+{max(py, 0)}")
    dialog.wait_window()


def show_info(parent: tk.Misc, title: str, message: str) -> None:
    show_message(parent, title=title, message=message, tone="info")


def show_error(parent: tk.Misc, title: str, message: str) -> None:
    show_message(parent, title=title, message=message, tone="error")


def show_success(parent: tk.Misc, title: str, message: str) -> None:
    show_message(parent, title=title, message=message, tone="success")
