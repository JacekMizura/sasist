"""Log viewer window — Sasist Printer Agent."""

from __future__ import annotations

import os
import tkinter as tk
from pathlib import Path
from tkinter import ttk

from . import theme as T
from .dialogs import show_error, show_info
from .host import get_ui_host
from .window_registry import WindowRegistry
from .widgets import (
    app_header,
    apply_window_icon,
    filter_chip_row,
    primary_button,
    secondary_button,
    styled_listbox,
    styled_text,
    window_shell,
)


WINDOW_KEY = "logs"


class LogViewerWindow:
    REFRESH_MS = 2500

    def __init__(self, log_dir: Path) -> None:
        self._log_dir = log_dir
        self._files: list[Path] = []
        self._refresh_job: str | None = None

    def show(self) -> None:
        get_ui_host().call(self._open)

    def _open(self) -> None:
        if WindowRegistry.focus_if_open(WINDOW_KEY):
            return

        self._log_dir.mkdir(parents=True, exist_ok=True)
        root = get_ui_host().root
        win = tk.Toplevel(root)
        win.title("Sasist Printer Agent — Logi")
        win.geometry("940x580")
        win.minsize(780, 500)
        apply_window_icon(win)
        WindowRegistry.register(WINDOW_KEY, win)
        shell = window_shell(win)
        app_header(shell, "Logi")

        tk.Label(
            shell,
            text=str(self._log_dir),
            font=T.FONT_SMALL,
            fg=T.MUTED_TEXT,
            bg=T.BG,
            anchor="w",
            padx=T.PADDING,
        ).pack(fill="x", pady=(0, 8))

        toolbar = tk.Frame(shell, bg=T.BG, padx=T.PADDING)
        toolbar.pack(fill="x", pady=(0, 8))
        tk.Label(toolbar, text="Filtr:", font=T.FONT_FAMILY_BOLD, fg=T.MUTED_TEXT, bg=T.BG).pack(side="left")
        filter_var = tk.StringVar(value="ALL")

        content = tk.Frame(shell, bg=T.BG, padx=T.PADDING)
        content.pack(fill="both", expand=True, pady=(0, T.PADDING))
        content.grid_columnconfigure(1, weight=1)
        content.grid_rowconfigure(0, weight=1)

        list_shell = tk.Frame(content, bg=T.BORDER, padx=1, pady=1)
        list_shell.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        list_frame = tk.Frame(list_shell, bg=T.CARD)
        list_frame.pack(fill="both", expand=True)
        tk.Label(list_frame, text="Pliki", font=T.FONT_FAMILY_BOLD, fg=T.NEUTRAL_TEXT, bg=T.CARD).pack(
            anchor="w", padx=12, pady=(10, 6)
        )
        file_list = styled_listbox(list_frame, width=28)
        file_list.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        preview_shell = tk.Frame(content, bg=T.BORDER, padx=1, pady=1)
        preview_shell.grid(row=0, column=1, sticky="nsew")
        preview_frame = tk.Frame(preview_shell, bg=T.CARD)
        preview_frame.pack(fill="both", expand=True)
        tk.Label(preview_frame, text="Podgląd", font=T.FONT_FAMILY_BOLD, fg=T.NEUTRAL_TEXT, bg=T.CARD).pack(
            anchor="w", padx=12, pady=(10, 6)
        )
        text_wrap = tk.Frame(preview_frame, bg=T.CARD)
        text_wrap.pack(fill="both", expand=True, padx=12, pady=(0, 12))
        preview = styled_text(text_wrap)
        preview_y = ttk.Scrollbar(text_wrap, orient="vertical", style="Sasist.Vertical.TScrollbar", command=preview.yview)
        preview_x = ttk.Scrollbar(text_wrap, orient="horizontal", style="Sasist.Horizontal.TScrollbar", command=preview.xview)
        preview.configure(yscrollcommand=preview_y.set, xscrollcommand=preview_x.set)
        preview.grid(row=0, column=0, sticky="nsew")
        preview_y.grid(row=0, column=1, sticky="ns")
        preview_x.grid(row=1, column=0, sticky="ew")
        text_wrap.grid_columnconfigure(0, weight=1)
        text_wrap.grid_rowconfigure(0, weight=1)

        footer = tk.Frame(shell, bg=T.CARD, padx=T.PADDING, pady=T.PADDING)
        footer.pack(fill="x")

        def selected_path() -> Path | None:
            if not self._files:
                return None
            sel = file_list.curselection()
            if not sel:
                return None
            idx = int(sel[0])
            if idx < 0 or idx >= len(self._files):
                return None
            return self._files[idx]

        def apply_filter(raw: str) -> str:
            level = filter_var.get().strip().upper()
            if level == "ALL":
                return raw
            lines = []
            for line in raw.splitlines():
                upper = line.upper()
                if level == "ERROR" and "ERROR" in upper:
                    lines.append(line)
                elif level == "WARNING" and "WARNING" in upper:
                    lines.append(line)
                elif level == "INFO" and "INFO" in upper:
                    lines.append(line)
            return "\n".join(lines) if lines else f"(Brak wpisów {level})"

        def load_preview() -> None:
            preview.configure(state="normal")
            preview.delete("1.0", tk.END)
            if not self._files:
                preview.insert(tk.END, "Brak plików logów.")
            else:
                path = selected_path()
                if path is None:
                    preview.insert(tk.END, "Wybierz plik logu po lewej.")
                elif not path.exists():
                    preview.insert(tk.END, f"Plik nie istnieje:\n{path}")
                else:
                    try:
                        raw = path.read_text(encoding="utf-8", errors="replace")
                    except OSError as exc:
                        raw = f"Nie udało się odczytać pliku:\n{exc}"
                    preview.insert(tk.END, apply_filter(raw))
            preview.configure(state="disabled")

        filter_chip_row(toolbar, ["ALL", "INFO", "WARNING", "ERROR"], filter_var, load_preview)

        def refresh_file_list(*, keep_selection: bool = True) -> None:
            previous = selected_path()
            self._files = sorted(
                [p for p in self._log_dir.glob("*.log") if p.is_file()],
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            if not self._files and (self._log_dir / "agent.log").exists():
                self._files = [self._log_dir / "agent.log"]
            file_list.delete(0, tk.END)
            if not self._files:
                file_list.insert(tk.END, "Brak plików logów.")
                file_list.configure(state="disabled")
            else:
                file_list.configure(state="normal")
                for path in self._files:
                    file_list.insert(tk.END, path.name)
                index = 0
                if keep_selection and previous is not None:
                    try:
                        index = self._files.index(previous)
                    except ValueError:
                        index = 0
                file_list.selection_clear(0, tk.END)
                file_list.selection_set(index)
                file_list.activate(index)
            load_preview()

        def schedule_refresh() -> None:
            if not win.winfo_exists():
                return
            refresh_file_list()
            self._refresh_job = win.after(self.REFRESH_MS, schedule_refresh)

        def copy_to_clipboard() -> None:
            if not self._files:
                show_info(win, "Logi", "Brak plików logów.")
                return
            path = selected_path()
            if path is None:
                show_info(win, "Logi", "Wybierz plik logu.")
                return
            try:
                raw = path.read_text(encoding="utf-8", errors="replace")
            except OSError as exc:
                show_error(win, "Logi", str(exc))
                return
            win.clipboard_clear()
            win.clipboard_append(apply_filter(raw))
            show_info(win, "Logi", "Skopiowano do schowka.")

        def open_in_notepad() -> None:
            if not self._files:
                show_info(win, "Logi", "Brak plików logów.")
                return
            path = selected_path()
            if path is None:
                show_info(win, "Logi", "Wybierz plik logu.")
                return
            if not path.exists():
                show_error(win, "Logi", "Plik nie istnieje.")
                return
            os.startfile(str(path))

        def on_close() -> None:
            if self._refresh_job is not None:
                try:
                    win.after_cancel(self._refresh_job)
                except tk.TclError:
                    pass
                self._refresh_job = None
            win.destroy()

        file_list.bind("<<ListboxSelect>>", lambda _e: load_preview())

        left = tk.Frame(footer, bg=T.CARD)
        left.pack(side="left")
        secondary_button(left, "Kopiuj", copy_to_clipboard).pack(side="left", padx=(0, 8))
        secondary_button(left, "Otwórz w Notepad", open_in_notepad).pack(side="left")
        secondary_button(footer, "Zamknij", on_close).pack(side="right")
        primary_button(footer, "Odśwież", lambda: refresh_file_list(keep_selection=True)).pack(side="right", padx=(0, 8))

        win.protocol("WM_DELETE_WINDOW", on_close)
        refresh_file_list(keep_selection=False)
        schedule_refresh()
