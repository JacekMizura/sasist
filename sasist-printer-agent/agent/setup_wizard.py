"""First-run setup wizard — server URL and API key."""

from __future__ import annotations

import logging
import tkinter as tk

from .auth import sync_agent_registration
from .config import AgentConfig, load_config, save_config
from .ui import theme as T
from .ui.dialogs import show_success
from .ui.widgets import (
    app_header,
    apply_window_icon,
    card,
    configure_styles,
    labeled_entry,
    primary_button,
    secondary_button,
    window_shell,
)

logger = logging.getLogger(__name__)


def run_first_run_setup(config: AgentConfig) -> AgentConfig:
    connected = False

    root = tk.Tk()
    root.title("Sasist Printer Agent — konfiguracja")
    root.geometry("560x460")
    root.minsize(520, 420)
    root.resizable(False, False)
    apply_window_icon(root)
    configure_styles()

    shell = window_shell(root)
    app_header(shell, "Konfiguracja początkowa")

    body = tk.Frame(shell, bg=T.BG, padx=T.PADDING, pady=T.PADDING)
    body.pack(fill="both", expand=True)

    step_var = tk.IntVar(value=1)
    step_label = tk.Label(body, text="Krok 1 z 4", font=T.FONT_FAMILY_BOLD, fg=T.PRIMARY, bg=T.BG, anchor="w")
    step_label.pack(fill="x", pady=(0, 8))

    content = tk.Frame(body, bg=T.BG)
    content.pack(fill="both", expand=True)

    server_var = tk.StringVar(value=config.server_url or "https://sasist.pl")
    api_key_var = tk.StringVar(value=config.api_key)
    status_var = tk.StringVar(value="")
    tk.Label(body, textvariable=status_var, font=T.FONT_FAMILY, fg=T.WARNING, bg=T.BG, anchor="w").pack(fill="x", pady=(8, 0))

    footer = tk.Frame(shell, bg=T.CARD, padx=T.PADDING, pady=T.PADDING)
    footer.pack(fill="x", side="bottom")
    back_btn = secondary_button(footer, "Wstecz", lambda: None)
    back_btn.pack(side="left")
    next_btn = primary_button(footer, "Dalej", lambda: None)
    next_btn.pack(side="right", padx=(0, 8))
    connect_btn = primary_button(footer, "Połącz", lambda: None)

    def _draft_config() -> AgentConfig:
        return AgentConfig.from_dict(
            {
                **config.to_dict(),
                "server_url": server_var.get().strip().rstrip("/"),
                "api_key": api_key_var.get().strip(),
            }
        )

    def _render_step() -> None:
        for child in content.winfo_children():
            child.destroy()

        step = step_var.get()
        step_label.configure(text=f"Krok {step} z 4")
        status_var.set("")

        if step == 1:
            frame = card(content, "Adres serwera")
            tk.Label(
                frame,
                text="Podaj adres serwera Sasist, z którym agent będzie się łączył.",
                font=T.FONT_FAMILY,
                fg=T.MUTED_TEXT,
                bg=T.CARD,
                anchor="w",
                wraplength=460,
                justify="left",
            ).pack(fill="x", pady=(0, 8))
            labeled_entry(frame, "URL serwera", server_var)
        elif step == 2:
            frame = card(content, "Klucz API")
            tk.Label(
                frame,
                text="Wklej klucz API typu Printer Agent wygenerowany w panelu Sasist.",
                font=T.FONT_FAMILY,
                fg=T.MUTED_TEXT,
                bg=T.CARD,
                anchor="w",
                wraplength=460,
                justify="left",
            ).pack(fill="x", pady=(0, 8))
            labeled_entry(frame, "Klucz API", api_key_var, secret=True)
        elif step == 3:
            frame = card(content, "Test połączenia")
            tk.Label(
                frame,
                text="Sprawdź połączenie z serwerem przed zapisaniem konfiguracji.",
                font=T.FONT_FAMILY,
                fg=T.MUTED_TEXT,
                bg=T.CARD,
                anchor="w",
                wraplength=460,
                justify="left",
            ).pack(fill="x", pady=(0, 8))
            tk.Label(frame, text=f"Serwer: {server_var.get().strip() or '—'}", font=T.FONT_FAMILY, bg=T.CARD, anchor="w").pack(
                fill="x", pady=2
            )
            tk.Label(frame, text="Klucz API: ********", font=T.FONT_FAMILY, bg=T.CARD, anchor="w").pack(fill="x", pady=2)

            def run_test() -> None:
                draft = _draft_config()
                if not draft.server_url:
                    status_var.set("Podaj URL serwera.")
                    return
                if not draft.api_key:
                    status_var.set("Podaj klucz API.")
                    return
                save_config(draft)
                status_var.set("Test połączenia…")
                root.update_idletasks()
                try:
                    sync_agent_registration(draft)
                except Exception as exc:
                    logger.exception("First-run connection test failed")
                    status_var.set(str(exc))
                    return
                status_var.set("Połączenie OK.")

            primary_button(frame, "Test połączenia", run_test).pack(anchor="w", pady=(8, 0))
        else:
            frame = card(content, "Połącz")
            tk.Label(
                frame,
                text="Zapisz konfigurację i połącz ten komputer z magazynem Sasist.",
                font=T.FONT_FAMILY,
                fg=T.MUTED_TEXT,
                bg=T.CARD,
                anchor="w",
                wraplength=460,
                justify="left",
            ).pack(fill="x", pady=(0, 8))
            tk.Label(frame, text=f"Serwer: {server_var.get().strip() or '—'}", font=T.FONT_FAMILY, bg=T.CARD, anchor="w").pack(
                fill="x", pady=2
            )

        back_btn.configure(state="normal" if step > 1 else "disabled")
        if step < 4:
            connect_btn.pack_forget()
            if not next_btn.winfo_ismapped():
                next_btn.pack(side="right", padx=(0, 8))
        else:
            next_btn.pack_forget()
            if not connect_btn.winfo_ismapped():
                connect_btn.pack(side="right", padx=(0, 8))

    def on_next() -> None:
        step = step_var.get()
        if step == 1 and not server_var.get().strip():
            status_var.set("Podaj URL serwera.")
            return
        if step == 2 and not api_key_var.get().strip():
            status_var.set("Podaj klucz API.")
            return
        if step < 4:
            step_var.set(step + 1)
            _render_step()

    def on_back() -> None:
        step = step_var.get()
        if step > 1:
            step_var.set(step - 1)
            _render_step()

    def on_connect() -> None:
        nonlocal connected
        draft = _draft_config()
        if not draft.server_url:
            status_var.set("Podaj URL serwera.")
            return
        if not draft.api_key:
            status_var.set("Podaj klucz API.")
            return

        save_config(draft)
        status_var.set("Łączenie…")
        root.update_idletasks()
        try:
            sync_agent_registration(draft)
        except Exception as exc:
            logger.exception("First-run setup failed")
            status_var.set(str(exc))
            return

        connected = True
        show_success(root, "Połączenie", "Komputer został połączony z magazynem.")
        root.destroy()

    def on_cancel() -> None:
        save_config(_draft_config())
        root.destroy()

    back_btn.configure(command=on_back)
    next_btn.configure(command=on_next)
    connect_btn.configure(command=on_connect)
    cancel_btn = secondary_button(footer, "Zapisz i zamknij", on_cancel)
    cancel_btn.pack(side="right")

    _render_step()
    root.mainloop()
    loaded = load_config()
    if connected:
        logger.info("First-run setup completed")
    return loaded
