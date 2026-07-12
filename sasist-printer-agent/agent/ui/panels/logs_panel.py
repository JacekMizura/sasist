"""Logs panel — file list, search, and preview."""

from __future__ import annotations

import os
from pathlib import Path

import customtkinter as ctk

from .. import theme as T
from ..ct_widgets import primary_button, secondary_button


class LogsPanel(ctk.CTkFrame):
    REFRESH_MS = 2500
    FILTER_OPTIONS = ("ALL", "INFO", "WARNING", "ERROR")

    def __init__(self, parent: ctk.CTkBaseClass, log_dir: Path) -> None:
        super().__init__(parent, fg_color="transparent")
        self._log_dir = log_dir
        self._files: list[Path] = []
        self._refresh_job: str | None = None
        self._filter_var = ctk.StringVar(value="ALL")
        self._search_var = ctk.StringVar(value="")
        self._autoscroll_var = ctk.BooleanVar(value=True)
        self._build()

    def _build(self) -> None:
        ctk.CTkLabel(self, text=str(self._log_dir), font=T.FONT_SMALL, text_color=T.MUTED, anchor="w").pack(
            fill="x", pady=(0, 8)
        )

        toolbar = ctk.CTkFrame(self, fg_color="transparent")
        toolbar.pack(fill="x", pady=(0, 8))

        filter_row = ctk.CTkFrame(toolbar, fg_color="transparent")
        filter_row.pack(fill="x", pady=(0, 6))
        ctk.CTkLabel(filter_row, text="Filtr:", font=T.FONT_BOLD, text_color=T.MUTED).pack(side="left", padx=(0, 8))
        self._filter_buttons: dict[str, ctk.CTkButton] = {}
        for option in self.FILTER_OPTIONS:
            btn = ctk.CTkButton(
                filter_row,
                text=option,
                width=72,
                height=28,
                command=lambda value=option: self._select_filter(value),
                fg_color=T.CARD,
                hover_color=T.BORDER,
                text_color=T.TEXT,
                corner_radius=T.CORNER_RADIUS_SM,
                font=T.FONT_SMALL,
            )
            btn.pack(side="left", padx=(0, 6))
            self._filter_buttons[option] = btn

        search_row = ctk.CTkFrame(toolbar, fg_color="transparent")
        search_row.pack(fill="x")
        ctk.CTkLabel(search_row, text="Szukaj:", font=T.FONT_BOLD, text_color=T.MUTED).pack(side="left", padx=(0, 8))
        search_entry = ctk.CTkEntry(
            search_row,
            textvariable=self._search_var,
            placeholder_text="Tekst w logu…",
            fg_color=T.PREVIEW_BG,
            border_color=T.BORDER,
            text_color=T.TEXT,
            corner_radius=T.CORNER_RADIUS_SM,
        )
        search_entry.pack(side="left", fill="x", expand=True, padx=(0, 8))
        search_entry.bind("<KeyRelease>", lambda _event: self._load_preview())
        ctk.CTkCheckBox(
            search_row,
            text="Autoscroll",
            variable=self._autoscroll_var,
            font=T.FONT_SMALL,
            text_color=T.TEXT,
            fg_color=T.PRIMARY,
            hover_color=T.PRIMARY_HOVER,
        ).pack(side="left")

        content = ctk.CTkFrame(self, fg_color="transparent")
        content.pack(fill="both", expand=True)
        content.grid_columnconfigure(1, weight=1)
        content.grid_rowconfigure(0, weight=1)

        list_card = ctk.CTkFrame(content, fg_color=T.CARD, corner_radius=T.CORNER_RADIUS, border_width=1, border_color=T.BORDER)
        list_card.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        ctk.CTkLabel(list_card, text="Pliki", font=T.FONT_BOLD, text_color=T.TEXT, anchor="w").pack(
            fill="x", padx=T.PAD, pady=(T.PAD, 6)
        )
        self._file_list = ctk.CTkScrollableFrame(list_card, fg_color=T.PREVIEW_BG, width=220, height=360)
        self._file_list.pack(fill="both", expand=True, padx=T.PAD, pady=(0, T.PAD))
        self._file_buttons: list[ctk.CTkButton] = []

        preview_card = ctk.CTkFrame(content, fg_color=T.CARD, corner_radius=T.CORNER_RADIUS, border_width=1, border_color=T.BORDER)
        preview_card.grid(row=0, column=1, sticky="nsew")
        ctk.CTkLabel(preview_card, text="Podgląd", font=T.FONT_BOLD, text_color=T.TEXT, anchor="w").pack(
            fill="x", padx=T.PAD, pady=(T.PAD, 6)
        )
        self._preview = ctk.CTkTextbox(
            preview_card,
            font=T.FONT_MONO,
            fg_color=T.PREVIEW_BG,
            text_color=T.TEXT,
            corner_radius=T.CORNER_RADIUS_SM,
            wrap="none",
        )
        self._preview.pack(fill="both", expand=True, padx=T.PAD, pady=(0, T.PAD))
        self._preview.configure(state="disabled")

        footer = ctk.CTkFrame(self, fg_color="transparent")
        footer.pack(fill="x", pady=(T.PAD, 0))
        left = ctk.CTkFrame(footer, fg_color="transparent")
        left.pack(side="left")
        secondary_button(left, "Kopiuj błąd", self._copy_error).pack(side="left", padx=(0, 8))
        secondary_button(left, "Reset filtrów", self._clear_filters).pack(side="left", padx=(0, 8))
        secondary_button(left, "Kopiuj", self._copy_to_clipboard).pack(side="left", padx=(0, 8))
        secondary_button(left, "Otwórz w Notepad", self._open_in_notepad).pack(side="left")
        primary_button(footer, "Odśwież", lambda: self.refresh_file_list(keep_selection=True)).pack(side="right")

        self._selected_index = 0
        self._select_filter("ALL")

    def _select_filter(self, value: str) -> None:
        self._filter_var.set(value)
        for key, btn in self._filter_buttons.items():
            active = key == value
            btn.configure(
                fg_color=T.PRIMARY if active else T.CARD,
                hover_color=T.PRIMARY_HOVER if active else T.BORDER,
                text_color="#FFFFFF" if active else T.TEXT,
            )
        self._load_preview()

    def _clear_filters(self) -> None:
        self._search_var.set("")
        self._select_filter("ALL")

    def _selected_path(self) -> Path | None:
        if not self._files:
            return None
        if self._selected_index < 0 or self._selected_index >= len(self._files):
            return None
        return self._files[self._selected_index]

    def _read_selected_raw(self) -> str:
        path = self._selected_path()
        if path is None or not path.exists():
            return ""
        try:
            return path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            return f"Nie udało się odczytać pliku:\n{exc}"

    def _apply_filter(self, raw: str) -> str:
        level = self._filter_var.get().strip().upper()
        query = self._search_var.get().strip().lower()
        lines: list[str] = []
        for line in raw.splitlines():
            upper = line.upper()
            if level == "ERROR" and "ERROR" not in upper:
                continue
            if level == "WARNING" and "WARNING" not in upper:
                continue
            if level == "INFO" and "INFO" not in upper:
                continue
            if query and query not in line.lower():
                continue
            lines.append(line)
        if not lines:
            if query:
                return f'(Brak wyników dla "{self._search_var.get().strip()}")'
            if level != "ALL":
                return f"(Brak wpisów {level})"
        return "\n".join(lines)

    def _load_preview(self) -> None:
        self._preview.configure(state="normal")
        self._preview.delete("1.0", "end")
        if not self._files:
            self._preview.insert("1.0", "Brak plików logów.")
        else:
            path = self._selected_path()
            if path is None:
                self._preview.insert("1.0", "Wybierz plik logu po lewej.")
            elif not path.exists():
                self._preview.insert("1.0", f"Plik nie istnieje:\n{path}")
            else:
                self._preview.insert("1.0", self._apply_filter(self._read_selected_raw()))
        self._preview.configure(state="disabled")
        if self._autoscroll_var.get():
            self._preview.see("end")

    def _select_file(self, index: int) -> None:
        self._selected_index = index
        for idx, btn in enumerate(self._file_buttons):
            active = idx == index
            btn.configure(
                fg_color=T.PRIMARY if active else T.PREVIEW_BG,
                hover_color=T.PRIMARY_HOVER if active else T.BORDER,
                text_color="#FFFFFF" if active else T.TEXT,
            )
        self._load_preview()

    def refresh_file_list(self, *, keep_selection: bool = True) -> None:
        self._log_dir.mkdir(parents=True, exist_ok=True)
        previous = self._selected_path()
        self._files = sorted(
            [p for p in self._log_dir.glob("*.log") if p.is_file()],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if not self._files and (self._log_dir / "agent.log").exists():
            self._files = [self._log_dir / "agent.log"]

        for child in self._file_list.winfo_children():
            child.destroy()
        self._file_buttons.clear()

        if not self._files:
            ctk.CTkLabel(self._file_list, text="Brak plików logów.", font=T.FONT, text_color=T.MUTED).pack(anchor="w")
            self._selected_index = 0
        else:
            index = 0
            if keep_selection and previous is not None:
                try:
                    index = self._files.index(previous)
                except ValueError:
                    index = 0
            for idx, path in enumerate(self._files):
                btn = ctk.CTkButton(
                    self._file_list,
                    text=path.name,
                    anchor="w",
                    height=32,
                    command=lambda i=idx: self._select_file(i),
                    fg_color=T.PREVIEW_BG,
                    hover_color=T.BORDER,
                    text_color=T.TEXT,
                    corner_radius=T.CORNER_RADIUS_SM,
                    font=T.FONT_SMALL,
                )
                btn.pack(fill="x", pady=2)
                self._file_buttons.append(btn)
            self._select_file(index)
            return

        self._load_preview()

    def start_refresh(self) -> None:
        self.stop_refresh()
        self.refresh_file_list(keep_selection=True)
        self._schedule_refresh()

    def stop_refresh(self) -> None:
        if self._refresh_job is not None:
            try:
                self.after_cancel(self._refresh_job)
            except Exception:
                pass
            self._refresh_job = None

    def _schedule_refresh(self) -> None:
        if not self.winfo_exists():
            return
        self.refresh_file_list()
        self._refresh_job = self.after(self.REFRESH_MS, self._schedule_refresh)

    def _copy_to_clipboard(self) -> None:
        raw = self._read_selected_raw()
        if not raw:
            return
        self.clipboard_clear()
        self.clipboard_append(self._apply_filter(raw))

    def _copy_error(self) -> None:
        raw = self._read_selected_raw()
        if not raw:
            return
        errors = [line for line in raw.splitlines() if "ERROR" in line.upper()]
        if not errors:
            errors = [line for line in raw.splitlines() if "WARNING" in line.upper()]
        if not errors:
            return
        self.clipboard_clear()
        self.clipboard_append("\n".join(errors))

    def _open_in_notepad(self) -> None:
        path = self._selected_path()
        if path is None or not path.exists():
            return
        os.startfile(str(path))

    def set_log_dir(self, log_dir: Path) -> None:
        self._log_dir = log_dir
