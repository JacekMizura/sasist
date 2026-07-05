"""Built-in Twig helpers — registered via helper registry, not RenderPipeline."""

from __future__ import annotations

import io
from datetime import date as date_cls
from datetime import datetime as datetime_cls
from decimal import Decimal, InvalidOperation
from typing import Any

import qrcode

from ...services.production_execution.barcode_html import code128_png_data_uri
from .helper_registry import TwigHelperRegistry, get_twig_helper_registry


def _parse_number(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value))
    text = str(value).strip().replace(",", ".")
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def barcode(value: Any, *, bar_height: float = 36.0) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    uri = code128_png_data_uri(text, bar_height=bar_height)
    if not uri:
        return ""
    return f'<img src="{uri}" alt="" style="max-width:100%;height:auto;" />'


def qr(value: Any, *, box_size: int = 4) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    img = qrcode.make(text)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    import base64

    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    uri = f"data:image/png;base64,{b64}"
    return f'<img src="{uri}" alt="" style="max-width:72px;height:auto;" />'


def money(value: Any, currency: str = "PLN") -> str:
    num = _parse_number(value)
    if num is None:
        return "—"
    formatted = f"{num:.2f}".replace(".", ",")
    cur = str(currency or "PLN").strip()
    return f"{formatted} {cur}"


def quantity(value: Any, unit: str = "szt.") -> str:
    num = _parse_number(value)
    if num is None:
        return "—"
    if num == num.to_integral():
        qty = str(int(num))
    else:
        qty = f"{num:.4f}".rstrip("0").rstrip(".")
    u = str(unit or "").strip()
    return f"{qty} {u}".strip()


def date(value: Any, fmt: str = "%d.%m.%Y") -> str:
    if value is None:
        return "—"
    if isinstance(value, datetime_cls):
        return value.strftime(fmt)
    if isinstance(value, date_cls):
        return value.strftime(fmt)
    text = str(value).strip()
    return text or "—"


def datetime(value: Any, fmt: str = "%d.%m.%Y %H:%M") -> str:
    return date(value, fmt=fmt)


def yes_no(value: Any) -> str:
    if value in (True, 1, "1", "true", "True", "TAK", "tak", "yes"):
        return "Tak"
    if value in (False, 0, "0", "false", "False", "NIE", "nie", "no"):
        return "Nie"
    return "—"


def phone(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return "—"
    digits = "".join(ch for ch in text if ch.isdigit() or ch == "+")
    return digits or text


def url(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.startswith(("http://", "https://", "data:", "/")):
        return text
    return f"https://{text}"


def asset(path: Any) -> str:
    text = str(path or "").strip()
    if not text:
        return ""
    if text.startswith(("http://", "https://", "data:")):
        return text
    return text if text.startswith("/") else f"/{text.lstrip('/')}"


def image(url: Any, alt: str = "") -> str:
    src = url if str(url or "").startswith("http") else asset(url)
    if not src:
        return ""
    alt_text = str(alt or "").replace('"', "&quot;")
    return f'<img src="{src}" alt="{alt_text}" />'


def company_logo(context: dict[str, Any]) -> str:
    logo_url = context.get("logo") or (context.get("branding") or {}).get("logo_url")
    if not logo_url:
        return ""
    return image(logo_url, alt="Logo")


def plural(count: Any, singular: str, plural_form: str) -> str:
    num = _parse_number(count)
    n = int(num) if num is not None else 0
    word = singular if abs(n) == 1 else plural_form
    return f"{n} {word}"


def page_break() -> str:
    return '<div class="page-break"></div>'


def section(title: str, body: str = "") -> str:
    t = str(title or "").replace("<", "&lt;")
    b = str(body or "")
    return f'<section class="doc-section"><h2 class="doc-subtitle">{t}</h2>{b}</section>'


def table(headers: list[Any] | tuple[Any, ...], rows: list[Any]) -> str:
    head_cells = "".join(f"<th>{str(h)}</th>" for h in headers)
    body_rows = []
    for row in rows or []:
        if isinstance(row, dict):
            cells = row.values()
        else:
            cells = row
        body_rows.append("".join(f"<td>{str(c)}</td>" for c in cells))
    tbody = "".join(f"<tr>{r}</tr>" for r in body_rows)
    return f'<table class="doc-table"><thead><tr>{head_cells}</tr></thead><tbody>{tbody}</tbody></table>'


def signature(label: str, name: str = "") -> str:
    lbl = str(label or "Podpis").replace("<", "&lt;")
    nm = str(name or "").replace("<", "&lt;")
    return f'<div class="signature-box"><strong>{lbl}</strong><div style="margin-top:28px;">{nm or "&nbsp;"}</div></div>'


def stamp(text: str = "PIECZĘĆ") -> str:
    t = str(text or "PIECZĘĆ").replace("<", "&lt;")
    return (
        f'<div class="doc-stamp" style="display:inline-block;border:2px solid #333;'
        f'border-radius:50%;width:72px;height:72px;line-height:72px;text-align:center;'
        f'font-size:9px;font-weight:700;">{t}</div>'
    )


def percent(value: Any, digits: int = 2) -> str:
    num = _parse_number(value)
    if num is None:
        return "—"
    return f"{num:.{digits}f}%".replace(".", ",")


def twig_default(value: Any, default_value: str = "", boolean: bool = False) -> Any:
    """Twig/Jinja-compatible default filter."""
    if value is None:
        return default_value
    if boolean and not value:
        return default_value
    return value


def register_builtin_twig_helpers(registry: TwigHelperRegistry | None = None) -> TwigHelperRegistry:
    reg = registry or get_twig_helper_registry()
    reg.register_function("barcode", barcode)
    reg.register_function("qr", qr)
    reg.register_function("money", money)
    reg.register_function("quantity", quantity)
    reg.register_function("date", date)
    reg.register_function("datetime", datetime)
    reg.register_function("yes_no", yes_no)
    reg.register_function("phone", phone)
    reg.register_function("url", url)
    reg.register_function("asset", asset)
    reg.register_function("image", image)
    reg.register_function("company_logo", company_logo)
    reg.register_function("plural", plural)
    reg.register_function("page_break", page_break)
    reg.register_function("section", section)
    reg.register_function("table", table)
    reg.register_function("signature", signature)
    reg.register_function("stamp", stamp)
    reg.register_function("percent", percent)
    reg.register_filter("money", money)
    reg.register_filter("quantity", quantity)
    reg.register_filter("date", date)
    reg.register_filter("datetime", datetime)
    reg.register_filter("yes_no", yes_no)
    reg.register_filter("phone", phone)
    reg.register_filter("url", url)
    reg.register_filter("percent", percent)
    reg.register_filter("default", twig_default)
    return reg


register_builtin_twig_helpers()
