"""First-run setup wizard — CustomTkinter, aligned with MainWindow design."""

from __future__ import annotations

import logging
import threading

import customtkinter as ctk

from . import __version__
from .auth import sync_agent_registration
from .config import AgentConfig, load_config, save_config
from .i18n import pl as PL
from .ui import theme as T
from .ui.connection_test import probe_agent_connection
from .ui.ct_widgets import apply_window_icon, card, info_row, primary_button, secondary_button

logger = logging.getLogger(__name__)

MASK_CHAR = "\u2022"


def run_first_run_setup(config: AgentConfig) -> AgentConfig:
    connected = False
    result_holder: dict[str, AgentConfig] = {}

    ctk.set_appearance_mode("light")
    app = ctk.CTk()
    app.title(PL.WIZARD_TITLE)
    app.geometry("640x560")
    app.minsize(580, 520)
    app.configure(fg_color=T.BG)
    apply_window_icon(app)

    state = {
        "step": 1,
        "api_visible": False,
        "testing": False,
        "test_ok": False,
        "register_result": None,
    }
    server_var = ctk.StringVar(value=config.server_url or "https://sasist.pl")
    api_key_var = ctk.StringVar(value=config.api_key)
    status_var = ctk.StringVar(value="")

    root = ctk.CTkFrame(app, fg_color=T.BG)
    root.pack(fill="both", expand=True, padx=T.PAD, pady=T.PAD)

    header = ctk.CTkFrame(root, fg_color=T.CARD, corner_radius=T.CORNER_RADIUS, border_width=1, border_color=T.BORDER)
    header.pack(fill="x", pady=(0, T.PAD))
    header_inner = ctk.CTkFrame(header, fg_color="transparent")
    header_inner.pack(fill="x", padx=T.PAD, pady=T.PAD)
    ctk.CTkLabel(header_inner, text=PL.WIZARD_HEADER, font=T.FONT_TITLE, text_color=T.TEXT, anchor="w").pack(fill="x")
    step_label = ctk.CTkLabel(header_inner, text=PL.WIZARD_STEP.format(step=1, total=4), font=T.FONT_BOLD, text_color=T.PRIMARY, anchor="w")
    step_label.pack(fill="x", pady=(4, 0))

    content = ctk.CTkScrollableFrame(root, fg_color="transparent", height=320)
    content.pack(fill="both", expand=True)

    footer = ctk.CTkFrame(root, fg_color="transparent")
    footer.pack(fill="x", pady=(T.PAD, 0))
    ctk.CTkLabel(footer, textvariable=status_var, font=T.FONT, text_color=T.DANGER, anchor="w", wraplength=580).pack(fill="x", pady=(0, 8))
    btn_row = ctk.CTkFrame(footer, fg_color="transparent")
    btn_row.pack(fill="x")
    back_btn = secondary_button(btn_row, PL.BACK, lambda: None)
    back_btn.pack(side="left")
    next_btn = primary_button(btn_row, PL.NEXT, lambda: None)
    next_btn.pack(side="right", padx=(8, 0))
    finish_btn = primary_button(btn_row, PL.WIZARD_FINISH, lambda: None)

    def draft() -> AgentConfig:
        draft_cfg = AgentConfig.from_dict(
            {
                **config.to_dict(),
                "server_url": server_var.get().strip().rstrip("/"),
                "api_key": api_key_var.get().strip(),
            }
        )
        draft_cfg.version = __version__
        return draft_cfg

    def set_status(text: str, *, error: bool = True) -> None:
        status_var.set(text)
        # CTkLabel text color via status only — error tone default

    def render() -> None:
        for child in content.winfo_children():
            child.destroy()
        step = state["step"]
        step_label.configure(text=PL.WIZARD_STEP.format(step=step, total=4))
        status_var.set("")
        back_btn.configure(state="normal" if step > 1 else "disabled")
        next_btn.pack_forget()
        finish_btn.pack_forget()
        if step < 4:
            next_btn.pack(side="right", padx=(8, 0))
        else:
            finish_btn.pack(side="right")

        if step == 1:
            body = card(content, PL.WIZARD_SERVER_CARD)
            ctk.CTkLabel(
                body,
                text=PL.WIZARD_SERVER_HINT,
                font=T.FONT,
                text_color=T.MUTED,
                anchor="w",
                wraplength=520,
                justify="left",
            ).pack(fill="x", pady=(0, 8))
            ctk.CTkEntry(body, textvariable=server_var, fg_color=T.PREVIEW_BG, border_color=T.BORDER).pack(fill="x")
        elif step == 2:
            body = card(content, PL.WIZARD_KEY_STEP)
            ctk.CTkLabel(body, text=PL.SETTINGS_API_KEY_HINT, font=T.FONT_SMALL, text_color=T.MUTED, anchor="w", justify="left").pack(
                fill="x", pady=(0, 8)
            )
            row = ctk.CTkFrame(body, fg_color="transparent")
            row.pack(fill="x")
            entry = ctk.CTkEntry(row, textvariable=api_key_var, show=MASK_CHAR if not state["api_visible"] else "", fg_color=T.PREVIEW_BG, border_color=T.BORDER)
            entry.pack(side="left", fill="x", expand=True, padx=(0, 8))

            def toggle() -> None:
                state["api_visible"] = not state["api_visible"]
                entry.configure(show="" if state["api_visible"] else MASK_CHAR)
                toggle_btn.configure(text=f"\U0001f441 {PL.HIDE}" if state["api_visible"] else f"\U0001f441 {PL.SHOW}")

            toggle_btn = secondary_button(row, f"\U0001f441 {PL.SHOW}", toggle)
            toggle_btn.pack(side="left", padx=(0, 8))

            def paste() -> None:
                try:
                    api_key_var.set(app.clipboard_get().strip())
                    set_status(PL.WIZARD_PASTED, error=False)
                except Exception:
                    set_status(PL.WIZARD_CLIPBOARD_FAIL)

            secondary_button(row, PL.PASTE, paste).pack(side="left")
        elif step == 3:
            body = card(content, PL.WIZARD_TEST_CARD)
            ctk.CTkLabel(
                body,
                text=PL.WIZARD_SERVER_LINE.format(url=server_var.get().strip() or "—"),
                font=T.FONT,
                text_color=T.TEXT,
                anchor="w",
            ).pack(fill="x", pady=2)
            ctk.CTkLabel(body, text=PL.WIZARD_KEY_MASKED, font=T.FONT, text_color=T.TEXT, anchor="w").pack(fill="x", pady=2)
            spinner = ctk.CTkLabel(body, text="", font=T.FONT, text_color=T.MUTED, anchor="w")
            spinner.pack(fill="x", pady=(8, 0))
            result = ctk.CTkLabel(body, text="", font=T.FONT, text_color=T.TEXT, anchor="w", wraplength=520, justify="left")
            result.pack(fill="x", pady=(4, 0))

            def run_test() -> None:
                if state["testing"]:
                    return
                d = draft()
                if not d.server_url:
                    set_status(PL.SETTINGS_NEED_URL)
                    return
                if not d.api_key:
                    set_status(PL.SETTINGS_NEED_KEY)
                    return
                state["testing"] = True
                state["test_ok"] = False
                spinner.configure(text=PL.WIZARD_TEST_RUNNING)
                result.configure(text="")

                def worker() -> None:
                    try:
                        probe_agent_connection(d)
                        msg = PL.WIZARD_TEST_OK
                        ok = True
                    except Exception as exc:
                        msg = str(exc)
                        ok = False

                    def done() -> None:
                        state["testing"] = False
                        state["test_ok"] = ok
                        spinner.configure(text="")
                        result.configure(text=msg, text_color=T.SUCCESS if ok else T.DANGER)

                    app.after(0, done)

                threading.Thread(target=worker, daemon=True).start()

            primary_button(body, PL.SETTINGS_TEST_CONNECTION, run_test).pack(anchor="w", pady=(8, 0))
            if state["test_ok"]:
                result.configure(text=PL.WIZARD_TEST_OK, text_color=T.SUCCESS)
        else:
            body = card(content, PL.WIZARD_CONNECT_CARD)
            d = draft()
            info_row(body, PL.WIZARD_COMPUTER_NAME, d.computer_name or "—")
            info_row(body, PL.DIAG_MACHINE_ID, d.machine_id or PL.WIZARD_MACHINE_PENDING)
            info_row(body, PL.DIAG_WAREHOUSE, str(d.warehouse_id) if d.warehouse_id else PL.WIZARD_WAREHOUSE_PENDING)
            info_row(body, PL.DIAG_AGENT_VERSION, __version__)

    def on_next() -> None:
        step = state["step"]
        if step == 1 and not server_var.get().strip():
            set_status(PL.SETTINGS_NEED_URL)
            return
        if step == 2 and not api_key_var.get().strip():
            set_status(PL.SETTINGS_NEED_KEY)
            return
        if step < 4:
            state["step"] = step + 1
            render()

    def on_back() -> None:
        if state["step"] > 1:
            state["step"] -= 1
            render()

    def on_finish() -> None:
        nonlocal connected
        d = draft()
        if not d.server_url or not d.api_key:
            set_status(PL.WIZARD_FILL_BOTH)
            return
        set_status(PL.WIZARD_CONNECTING, error=False)
        status_var.configure(text_color=T.MUTED)
        app.update_idletasks()
        try:
            save_config(d)
            updated, _client = sync_agent_registration(d)
            result_holder["config"] = updated
            connected = True
            app.destroy()
        except Exception as exc:
            logger.exception("First-run setup failed")
            set_status(str(exc))

    back_btn.configure(command=on_back)
    next_btn.configure(command=on_next)
    finish_btn.configure(command=on_finish)
    render()
    app.mainloop()

    loaded = load_config()
    if connected:
        logger.info("First-run setup completed")
        return result_holder.get("config", loaded)
    return loaded
