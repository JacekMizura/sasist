"""Reusable Tkinter widgets — Sasist Printer Agent desktop UI."""

from __future__ import annotations

import sys
import tkinter as tk
from pathlib import Path
from tkinter import ttk
from typing import Callable

from ..version import __version__
from . import theme as T


def project_assets_dir() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass) / "assets"
        return Path(sys.executable).resolve().parent / "assets"
    return Path(__file__).resolve().parent.parent.parent / "assets"


_assets_dir = project_assets_dir()


def apply_window_icon(root: tk.Tk | tk.Toplevel) -> None:
    icon_path = _assets_dir / "icon.ico"
    if icon_path.exists():
        try:
            root.iconbitmap(str(icon_path))
        except tk.TclError:
            pass


def configure_styles() -> ttk.Style:
    style = ttk.Style()
    try:
        style.theme_use("clam")
    except tk.TclError:
        pass

    style.configure("Sasist.TFrame", background=T.BG)
    style.configure("SasistCard.TFrame", background=T.CARD)
    style.configure(
        "Sasist.TEntry",
        fieldbackground=T.CARD,
        bordercolor=T.BORDER,
        lightcolor=T.BORDER,
        darkcolor=T.BORDER,
        padding=8,
    )
    style.configure(
        "Sasist.TCombobox",
        fieldbackground=T.CARD,
        background=T.CARD,
        bordercolor=T.BORDER,
        arrowcolor=T.PRIMARY,
        padding=6,
    )
    style.configure(
        "Sasist.Vertical.TScrollbar",
        background=T.CARD,
        troughcolor=T.BG,
        bordercolor=T.BORDER,
        arrowcolor=T.PRIMARY,
    )
    style.configure(
        "Sasist.Horizontal.TScrollbar",
        background=T.CARD,
        troughcolor=T.BG,
        bordercolor=T.BORDER,
        arrowcolor=T.PRIMARY,
    )
    style.configure(
        "Sasist.TButton",
        background=T.CARD,
        foreground=T.NEUTRAL_TEXT,
        bordercolor=T.BORDER,
        padding=(14, 8),
        font=T.FONT_FAMILY,
    )
    style.map(
        "Sasist.TButton",
        background=[("active", T.PRIMARY_LIGHT), ("pressed", T.PRIMARY_LIGHT)],
    )
    style.configure(
        "SasistPrimary.TButton",
        background=T.PRIMARY,
        foreground="white",
        bordercolor=T.PRIMARY,
        padding=(14, 8),
        font=T.FONT_FAMILY_BOLD,
    )
    style.map(
        "SasistPrimary.TButton",
        background=[("active", T.PRIMARY_HOVER), ("pressed", T.PRIMARY_HOVER)],
        foreground=[("active", "white"), ("pressed", "white")],
    )
    return style


def load_logo_photo(max_height: int = 36) -> tk.PhotoImage | None:
    for name in ("sasist-logo.png", "icon-32.png", "icon-64.png"):
        path = _assets_dir / name
        if not path.exists():
            continue
        try:
            img = tk.PhotoImage(file=str(path))
            if img.height() > max_height:
                factor = max(1, img.height() // max_height)
                img = img.subsample(factor, factor)
            return img
        except tk.TclError:
            continue
    return None


def app_header(parent: tk.Widget, window_title: str) -> tk.Frame:
    """Unified header: logo + Sasist Printer Agent / window title / version."""
    bar = tk.Frame(parent, bg=T.CARD, padx=T.PADDING, pady=T.PADDING)
    bar.pack(fill="x")
    row = tk.Frame(bar, bg=T.CARD)
    row.pack(fill="x")

    logo = load_logo_photo()
    if logo is not None:
        logo_label = tk.Label(row, image=logo, bg=T.CARD)
        logo_label.image = logo
        logo_label.pack(side="left", padx=(0, 12))

    text_col = tk.Frame(row, bg=T.CARD)
    text_col.pack(side="left", fill="x", expand=True)
    tk.Label(
        text_col,
        text="Sasist Printer Agent",
        font=T.FONT_SECTION,
        fg=T.MUTED_TEXT,
        bg=T.CARD,
        anchor="w",
    ).pack(fill="x")
    tk.Label(
        text_col,
        text=window_title,
        font=T.FONT_TITLE,
        fg=T.NEUTRAL_TEXT,
        bg=T.CARD,
        anchor="w",
    ).pack(fill="x", pady=(2, 0))
    tk.Label(
        text_col,
        text=f"v{__version__}",
        font=T.FONT_SMALL,
        fg=T.MUTED_TEXT,
        bg=T.CARD,
        anchor="w",
    ).pack(fill="x", pady=(2, 0))
    return bar


def header_bar(parent: tk.Widget, title: str) -> tk.Frame:
    return app_header(parent, title)


class ScrollableBody(tk.Frame):
    def __init__(self, parent: tk.Widget, **kwargs) -> None:
        super().__init__(parent, bg=T.BG, **kwargs)
        canvas = tk.Canvas(self, bg=T.BG, highlightthickness=0, borderwidth=0)
        scrollbar = ttk.Scrollbar(self, orient="vertical", style="Sasist.Vertical.TScrollbar", command=canvas.yview)
        self.inner = tk.Frame(canvas, bg=T.BG)
        self.inner.bind(
            "<Configure>",
            lambda _e: canvas.configure(scrollregion=canvas.bbox("all")),
        )
        self._window_id = canvas.create_window((0, 0), window=self.inner, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        def _on_canvas_configure(event: tk.Event) -> None:
            canvas.itemconfigure(self._window_id, width=event.width)

        canvas.bind("<Configure>", _on_canvas_configure)

        def _on_mousewheel(event: tk.Event) -> None:
            canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

        def _bind_wheel(_event: tk.Event) -> None:
            canvas.bind_all("<MouseWheel>", _on_mousewheel)

        def _unbind_wheel(_event: tk.Event) -> None:
            canvas.unbind_all("<MouseWheel>")

        canvas.bind("<Enter>", _bind_wheel)
        canvas.bind("<Leave>", _unbind_wheel)
        self._canvas = canvas


def divider(parent: tk.Widget) -> tk.Frame:
    line = tk.Frame(parent, bg=T.BORDER, height=1)
    line.pack(fill="x", pady=(0, 12))
    return line


def badge(parent: tk.Widget, text: str, *, tone: str = "success") -> tk.Label:
    palette = {
        "success": (T.SUCCESS, "white"),
        "danger": (T.DANGER, "white"),
        "warning": (T.WARNING, "white"),
        "neutral": (T.PRIMARY_LIGHT, T.NEUTRAL_TEXT),
    }
    bg, fg = palette.get(tone, palette["neutral"])
    return tk.Label(
        parent,
        text=text,
        font=T.FONT_FAMILY_BOLD,
        fg=fg,
        bg=bg,
        padx=12,
        pady=5,
    )


def card(parent: tk.Widget, title: str) -> tk.Frame:
    outer = tk.Frame(parent, bg=T.BG)
    outer.pack(fill="x", pady=(0, 12))
    shell = tk.Frame(outer, bg=T.BORDER, padx=1, pady=1)
    shell.pack(fill="x")
    frame = tk.Frame(shell, bg=T.CARD, padx=T.CARD_PADX, pady=T.CARD_PADY)
    frame.pack(fill="x")
    tk.Label(frame, text=title, font=T.FONT_SECTION, fg=T.NEUTRAL_TEXT, bg=T.CARD, anchor="w").pack(
        fill="x", pady=(0, 10)
    )
    body = tk.Frame(frame, bg=T.CARD)
    body.pack(fill="x")
    return body


def info_row(parent: tk.Widget, label: str, value: str) -> None:
    row = tk.Frame(parent, bg=T.CARD)
    row.pack(fill="x", pady=3)
    tk.Label(row, text=label, font=T.FONT_FAMILY, fg=T.MUTED_TEXT, bg=T.CARD, width=18, anchor="w").pack(
        side="left"
    )
    tk.Label(
        row,
        text=value,
        font=T.FONT_FAMILY_BOLD,
        fg=T.NEUTRAL_TEXT,
        bg=T.CARD,
        anchor="w",
        wraplength=360,
        justify="left",
    ).pack(side="left", fill="x", expand=True)


def primary_button(parent: tk.Widget, text: str, command: Callable[[], None]) -> ttk.Button:
    return ttk.Button(parent, text=text, style="SasistPrimary.TButton", command=command)


def secondary_button(parent: tk.Widget, text: str, command: Callable[[], None]) -> ttk.Button:
    return ttk.Button(parent, text=text, style="Sasist.TButton", command=command)


def labeled_entry(parent: tk.Widget, label: str, textvariable: tk.StringVar, *, secret: bool = False) -> ttk.Entry:
    tk.Label(parent, text=label, font=T.FONT_FAMILY_BOLD, fg=T.NEUTRAL_TEXT, bg=T.CARD, anchor="w").pack(
        fill="x", pady=(0, 4)
    )
    entry = ttk.Entry(parent, textvariable=textvariable, style="Sasist.TEntry", show="*" if secret else "")
    entry.pack(fill="x", pady=(0, 14))
    return entry


def filter_chip_row(
    parent: tk.Widget,
    options: list[str],
    selected: tk.StringVar,
    on_change: Callable[[], None],
) -> tk.Frame:
    row = tk.Frame(parent, bg=T.BG)
    row.pack(fill="x")
    buttons: dict[str, tk.Label] = {}

    def _select(value: str) -> None:
        selected.set(value)
        for key, widget in buttons.items():
            active = key == value
            widget.configure(
                bg=T.PRIMARY if active else T.CARD,
                fg="white" if active else T.NEUTRAL_TEXT,
            )
        on_change()

    for option in options:
        btn = tk.Label(
            row,
            text=option,
            font=T.FONT_FAMILY_BOLD,
            bg=T.CARD,
            fg=T.NEUTRAL_TEXT,
            padx=12,
            pady=6,
            cursor="hand2",
        )
        btn.pack(side="left", padx=(0, 6))
        btn.bind("<Button-1>", lambda _e, value=option: _select(value))
        buttons[option] = btn

    _select(selected.get())
    return row


def styled_listbox(parent: tk.Widget, **kwargs) -> tk.Listbox:
    defaults = {
        "font": T.FONT_FAMILY,
        "bg": T.CARD,
        "fg": T.NEUTRAL_TEXT,
        "selectbackground": T.PRIMARY_LIGHT,
        "selectforeground": T.NEUTRAL_TEXT,
        "borderwidth": 0,
        "highlightthickness": 0,
        "activestyle": "none",
    }
    defaults.update(kwargs)
    return tk.Listbox(parent, **defaults)


def styled_text(parent: tk.Widget, **kwargs) -> tk.Text:
    defaults = {
        "wrap": "none",
        "font": T.FONT_MONO,
        "bg": T.PREVIEW_BG,
        "fg": T.NEUTRAL_TEXT,
        "borderwidth": 0,
        "highlightthickness": 0,
        "padx": 10,
        "pady": 10,
    }
    defaults.update(kwargs)
    return tk.Text(parent, **defaults)


def window_shell(parent: tk.Toplevel) -> tk.Frame:
    parent.configure(bg=T.BG)
    shell = tk.Frame(parent, bg=T.BG)
    shell.pack(fill="both", expand=True)
    return shell
