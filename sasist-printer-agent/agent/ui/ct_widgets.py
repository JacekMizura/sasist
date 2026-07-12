"""Shared CustomTkinter widgets."""

from __future__ import annotations

import sys
from pathlib import Path

import customtkinter as ctk

from ..version import __version__
from . import theme as T


def project_assets_dir() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass) / "assets"
        return Path(sys.executable).resolve().parent / "assets"
    return Path(__file__).resolve().parent.parent.parent / "assets"


def apply_window_icon(window: ctk.CTk | ctk.CTkToplevel) -> None:
    icon_path = project_assets_dir() / "icon.ico"
    if icon_path.exists():
        try:
            window.iconbitmap(str(icon_path))
        except Exception:
            pass


def card(parent: ctk.CTkBaseClass, title: str) -> ctk.CTkFrame:
    outer = ctk.CTkFrame(parent, fg_color=T.CARD, corner_radius=T.CORNER_RADIUS, border_width=1, border_color=T.BORDER)
    ctk.CTkLabel(outer, text=title, font=T.FONT_SECTION, text_color=T.TEXT, anchor="w").pack(
        fill="x", padx=T.PAD, pady=(T.PAD, 8)
    )
    body = ctk.CTkFrame(outer, fg_color="transparent")
    body.pack(fill="both", expand=True, padx=T.PAD, pady=(0, T.PAD))
    return body


def dense_info_row(parent: ctk.CTkBaseClass, icon: str, label: str, value: str) -> None:
    row = ctk.CTkFrame(parent, fg_color="transparent")
    row.pack(fill="x", pady=3)
    ctk.CTkLabel(row, text=icon, font=T.FONT, width=22, anchor="w").pack(side="left", padx=(0, 4))
    ctk.CTkLabel(row, text=label, font=T.FONT, text_color=T.MUTED, width=130, anchor="w").pack(side="left")
    ctk.CTkLabel(
        row,
        text=value,
        font=T.FONT_BOLD,
        text_color=T.TEXT,
        anchor="w",
        justify="left",
        wraplength=240,
    ).pack(side="left", fill="x", expand=True)


def info_row(parent: ctk.CTkBaseClass, label: str, value: str) -> None:
    row = ctk.CTkFrame(parent, fg_color="transparent")
    row.pack(fill="x", pady=4)
    ctk.CTkLabel(row, text=label, font=T.FONT, text_color=T.MUTED, width=160, anchor="w").pack(side="left")
    ctk.CTkLabel(row, text=value, font=T.FONT_BOLD, text_color=T.TEXT, anchor="w", justify="left", wraplength=520).pack(
        side="left", fill="x", expand=True
    )


def badge(parent: ctk.CTkBaseClass, text: str, *, tone: str = "success") -> ctk.CTkLabel:
    palette = {
        "success": (T.SUCCESS, "#FFFFFF"),
        "danger": (T.DANGER, "#FFFFFF"),
        "warning": (T.WARNING, "#FFFFFF"),
        "neutral": (T.BORDER, T.TEXT),
    }
    bg, fg = palette.get(tone, palette["neutral"])
    widget = ctk.CTkLabel(
        parent,
        text=text,
        font=T.FONT_BOLD,
        fg_color=bg,
        text_color=fg,
        corner_radius=T.CORNER_RADIUS_SM,
        padx=12,
        pady=6,
    )
    return widget


def primary_button(parent: ctk.CTkBaseClass, text: str, command) -> ctk.CTkButton:
    return ctk.CTkButton(
        parent,
        text=text,
        command=command,
        fg_color=T.PRIMARY,
        hover_color=T.PRIMARY_HOVER,
        text_color="#FFFFFF",
        corner_radius=T.CORNER_RADIUS_SM,
        font=T.FONT_BOLD,
    )


def secondary_button(parent: ctk.CTkBaseClass, text: str, command) -> ctk.CTkButton:
    return ctk.CTkButton(
        parent,
        text=text,
        command=command,
        fg_color=T.CARD,
        hover_color=T.BORDER,
        text_color=T.TEXT,
        border_width=1,
        border_color=T.BORDER,
        corner_radius=T.CORNER_RADIUS_SM,
        font=T.FONT,
    )


def sidebar_button(parent: ctk.CTkBaseClass, text: str, command, *, active: bool = False) -> ctk.CTkButton:
    return ctk.CTkButton(
        parent,
        text=text,
        command=command,
        anchor="w",
        fg_color=T.PRIMARY if active else "transparent",
        hover_color=T.PRIMARY_HOVER if active else T.BORDER,
        text_color="#FFFFFF" if active else T.TEXT,
        corner_radius=T.CORNER_RADIUS_SM,
        font=T.FONT_BOLD,
        height=40,
    )


def build_sidebar_header(parent: ctk.CTkBaseClass) -> None:
    ctk.CTkLabel(parent, text="Sasist Printer Agent", font=T.FONT_SECTION, text_color=T.TEXT, anchor="w").pack(
        fill="x", padx=T.PAD, pady=(T.PAD, 2)
    )
    ctk.CTkLabel(parent, text=f"v{__version__}", font=T.FONT_SMALL, text_color=T.MUTED, anchor="w").pack(
        fill="x", padx=T.PAD, pady=(0, T.PAD)
    )
