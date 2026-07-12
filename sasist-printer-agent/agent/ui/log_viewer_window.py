"""Log viewer window — Sasist Printer Agent."""

from __future__ import annotations

import os
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

from . import theme as T
from .widgets import apply_window_icon, configure_styles, primary_button, secondary_button


class LogViewerWindow:
    REFRESH_MS = 2500

    def __init__(self, log_dir: Path) -> None:
        self._log_dir = log_dir
        self._root: tk.Tk | None = None
        self._files: list[Path] = []
        self._refresh_job: str | None = None

    def show(self) -> None:
        self._log_dir.mkdir(parents=True, exist_ok=True)

        root = tk.Tk()
        root.title("Sasist Printer Agent — Logi")
        root.geometry("920x560")
        root.minsize(760, 480)
        root.configure(bg=T.BG)
        apply_window_icon(root)
        configure_styles()
        self._root = root

        header = tk.Frame(root, bg=T.CARD, padx=T.PADDING, pady=14)
        header.pack(fill="x")
        tk.Label(
            header,
            text="Logi agenta",
            font=T.FONT_TITLE,
            fg=T.NEUTRAL_TEXT,
            bg=T.CARD,
            anchor="w",
        ).pack(fill="x")
        tk.Label(
            header,
            text=str(self._log_dir),
            font=T.FONT_SMALL,
            fg=T.MUTED_TEXT,
            bg=T.CARD,
            anchor="w",
        ).pack(fill="x", pady=(4, 0))

        toolbar = tk.Frame(root, bg=T.BG, padx=T.PADDING, pady=(12, 8))
        toolbar.pack(fill="x")
        tk.Label(toolbar, text="Filtr:", font=T.FONT_FAMILY, fg=T.MUTED_TEXT, bg=T.BG).pack(side="left")
        filter_var = tk.StringVar(value="ALL")
        filter_box = ttk.Combobox(
            toolbar,
            textvariable=filter_var,
            values=["ALL", "ERROR", "WARNING", "INFO"],
            state="readonly",
            width=12,
        )
        filter_box.pack(side="left", padx=(8, 0))

        content = tk.Frame(root, bg=T.BG, padx=T.PADDING, pady=(0, T.PADDING))
        content.pack(fill="both", expand=True)
        content.grid_columnconfigure(1, weight=1)
        content.grid_rowconfigure(0, weight=1)

        list_shell = tk.Frame(content, bg=T.BORDER, padx=1, pady=1)
        list_shell.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        list_frame = tk.Frame(list_shell, bg=T.CARD)
        list_frame.pack(fill="both", expand=True)
        tk.Label(list_frame, text="Pliki", font=T.FONT_FAMILY_BOLD, fg=T.NEUTRAL_TEXT, bg=T.CARD).pack(
            anchor="w", padx=12, pady=(10, 6)
        )
        file_list = tk.Listbox(
            list_frame,
            width=28,
            font=T.FONT_FAMILY,
            bg=T.CARD,
            fg=T.NEUTRAL_TEXT,
            selectbackground=T.PRIMARY_LIGHT,
            selectforeground=T.NEUTRAL_TEXT,
            borderwidth=0,
            highlightthickness=0,
            activestyle="none",
        )
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
        preview = tk.Text(
            text_wrap,
            wrap="none",
            font=("Consolas", 10),
            bg="#FFFBF5",
            fg=T.NEUTRAL_TEXT,
            borderwidth=0,
            highlightthickness=0,
            padx=10,
            pady=10,
        )
        preview_y = ttk.Scrollbar(text_wrap, orient="vertical", command=preview.yview)
        preview_x = ttk.Scrollbar(text_wrap, orient="horizontal", command=preview.xview)
        preview.configure(yscrollcommand=preview_y.set, xscrollcommand=preview_x.set)
        preview.grid(row=0, column=0, sticky="nsew")
        preview_y.grid(row=0, column=1, sticky="ns")
        preview_x.grid(row=1, column=0, sticky="ew")
        text_wrap.grid_columnconfigure(0, weight=1)
        text_wrap.grid_rowconfigure(0, weight=1)

        footer = tk.Frame(root, bg=T.CARD, padx=T.PADDING, pady=T.PADDING)
        footer.pack(fill="x")

        def selected_path() -> Path | None:
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
            path = selected_path()
            preview.configure(state="normal")
            preview.delete("1.0", tk.END)
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
            for path in self._files:
                file_list.insert(tk.END, path.name)
            if self._files:
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
            refresh_file_list()
            self._refresh_job = root.after(self.REFRESH_MS, schedule_refresh)

        def copy_to_clipboard() -> None:
            path = selected_path()
            if path is None:
                messagebox.showinfo("Logi", "Wybierz plik logu.", parent=root)
                return
            try:
                raw = path.read_text(encoding="utf-8", errors="replace")
            except OSError as exc:
                messagebox.showerror("Logi", str(exc), parent=root)
                return
            root.clipboard_clear()
            root.clipboard_append(apply_filter(raw))
            messagebox.showinfo("Logi", "Skopiowano do schowka.", parent=root)

        def open_in_notepad() -> None:
            path = selected_path()
            if path is None:
                messagebox.showinfo("Logi", "Wybierz plik logu.", parent=root)
                return
            if not path.exists():
                messagebox.showerror("Logi", "Plik nie istnieje.", parent=root)
                return
            os.startfile(str(path))

        file_list.bind("<<ListboxSelect>>", lambda _e: load_preview())
        filter_box.bind("<<ComboboxSelected>>", lambda _e: load_preview())

        left = tk.Frame(footer, bg=T.CARD)
        left.pack(side="left")
        secondary_button(left, "Kopiuj", copy_to_clipboard).pack(side="left", padx=(0, 8))
        secondary_button(left, "Otwórz w Notepad", open_in_notepad).pack(side="left")
        secondary_button(footer, "Zamknij", root.destroy).pack(side="right")
        primary_button(footer, "Odśwież", lambda: refresh_file_list(keep_selection=True)).pack(side="right", padx=(0, 8))

        def on_close() -> None:
            if self._refresh_job is not None:
                root.after_cancel(self._refresh_job)
            root.destroy()

        root.protocol("WM_DELETE_WINDOW", on_close)
        refresh_file_list(keep_selection=False)
        schedule_refresh()
        root.mainloop()
        self._root = None
