#!/usr/bin/env python3
"""E2E DTE verification against running backend (not TestClient)."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

BASE = "http://127.0.0.1:8010/api"
TENANT = 1


def req(method, path, token=None, params=None, body=None, accept="application/json"):
    url = BASE + path
    if params:
        q = "&".join(f"{k}={v}" for k, v in params.items())
        url += ("?" if "?" not in url else "&") + q
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if accept:
        headers["Accept"] = accept
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as resp:
            return resp.status, resp.headers.get("Content-Type", ""), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Content-Type", ""), exc.read()


def pdf_has_content(raw: bytes, needles: list[str] | None = None) -> bool:
    if raw[:4] != b"%PDF" or len(raw) < 5000:
        return False
    if not needles:
        return True
    haystack = raw.decode("latin1", errors="ignore")
    return all(needle in haystack for needle in needles if needle)


def check_pdf(status: int, raw: bytes, must_contain: list[str] | None = None) -> dict:
    ok = status == 200 and pdf_has_content(raw, must_contain)
    haystack = raw.decode("latin1", errors="ignore") if ok else ""
    return {
        "pass": ok,
        "status": status,
        "bytes": len(raw),
        "sample": haystack[:160].replace("\n", " "),
    }


def obtain_token() -> str:
    status, _, raw = req("POST", "/auth/login", body={"login": "admin", "password": "admin"})
    if status == 200:
        return json.loads(raw.decode())["access_token"]

    from backend.auth.passwords import hash_password
    from backend.database import SessionLocal
    from backend.models.app_user import AppUser

    db = SessionLocal()
    try:
        user = db.query(AppUser).filter(AppUser.login == "admin").first()
        if user is None:
            raise RuntimeError("Brak użytkownika admin w bazie dev.")
        user.password_hash = hash_password("e2e-dev")
        db.commit()
    finally:
        db.close()

    status, _, raw = req("POST", "/auth/login", body={"login": "admin", "password": "e2e-dev"})
    if status != 200:
        raise RuntimeError(f"Login failed: {status} {raw[:200]!r}")
    return json.loads(raw.decode())["access_token"]


def main() -> int:
    token = obtain_token()
    results: dict[str, object] = {}

    status, _, raw = req(
        "POST",
        "/document-templates/templates/from-starter",
        token,
        {"tenant_id": TENANT},
        {"kind_code": "picking_list", "name": "E2E picking", "starter_code": "default"},
    )
    if status == 200:
        tpl = json.loads(raw.decode())
        editor_status, _, _ = req(
            "GET",
            f"/document-templates/templates/{tpl['id']}/editor",
            token,
            {"tenant_id": TENANT},
        )
        results["1_marketplace_starter"] = {
            "pass": editor_status == 200 and bool(tpl.get("draft_version")),
            "status": status,
            "editor": editor_status,
            "id": tpl.get("id"),
        }
    else:
        results["1_marketplace_starter"] = {
            "pass": False,
            "status": status,
            "body": raw[:300].decode(errors="replace"),
        }

    status, _, raw = req(
        "GET",
        "/document-templates/templates/list",
        token,
        {"tenant_id": TENANT, "template_role": "DOCUMENT"},
    )
    items = json.loads(raw.decode()).get("items", []) if status == 200 else []
    partials = [i for i in items if i.get("template_role") == "PARTIAL"]
    bases = [i for i in items if i.get("template_role") == "BASE"]
    results["2_templates_list"] = {
        "pass": status == 200 and not partials and not bases,
        "status": status,
        "count": len(items),
        "roles": sorted({i.get("template_role") for i in items}),
    }

    from backend.database import SessionLocal
    from backend.models.order import Order
    from backend.models.product import Product
    from backend.models.stock_document import StockDocument

    db = SessionLocal()
    try:
        orders = (
            db.query(Order)
            .filter(Order.tenant_id == TENANT)
            .order_by(Order.id.desc())
            .limit(3)
            .all()
        )
        products = (
            db.query(Product)
            .filter(Product.tenant_id == TENANT, Product.deleted_at.is_(None))
            .order_by(Product.id.desc())
            .limit(3)
            .all()
        )
        wz = (
            db.query(StockDocument)
            .filter(StockDocument.tenant_id == TENANT, StockDocument.document_type == "WZ")
            .order_by(StockDocument.id.desc())
            .first()
        )
    finally:
        db.close()

    order = orders[0] if orders else None
    if order:
        st1, _, raw1 = req(
            "GET",
            f"/orders/{order.id}/confirmation.pdf",
            token,
            {"tenant_id": TENANT},
            accept="application/pdf",
        )
        st2, _, raw2 = req(
            "GET",
            f"/orders/{order.id}/picking-list.pdf",
            token,
            {"tenant_id": TENANT},
            accept="application/pdf",
        )
        num = str(order.number or order.id)
        conf = check_pdf(st1, raw1, [num[: min(4, len(num))], str(order.id)])
        pick = check_pdf(st2, raw2, [str(order.id)])
        results["3_orders_print"] = {
            "pass": conf["pass"] and pick["pass"],
            "confirmation": conf,
            "picking_list": pick,
        }
    else:
        results["3_orders_print"] = {"pass": False, "error": "no orders"}

    product = products[0] if products else None
    if product:
        st, _, raw = req(
            "GET",
            f"/products/{product.id}/product-card.pdf",
            token,
            {"tenant_id": TENANT},
            accept="application/pdf",
        )
        name = (product.name or product.sku or "")[:6]
        needle = [name] if len(name) >= 3 else None
        results["4_product_card"] = check_pdf(st, raw, needle)
        results["4_product_card"]["product_name"] = product.name
    else:
        results["4_product_card"] = {"pass": False}

    if wz:
        wh = int(wz.warehouse_id or 1)
        st, _, raw = req(
            "GET",
            f"/stock-documents/{wz.id}/pdf",
            token,
            {"tenant_id": TENANT, "warehouse_id": wh},
            accept="application/pdf",
        )
        docnum = str(getattr(wz, "document_number", "") or "")
        needles = [docnum[:6]] if len(docnum) >= 4 else ["WZ"]
        results["5_wz_pdf"] = check_pdf(st, raw, needles)
    else:
        results["5_wz_pdf"] = {"pass": False}

    endpoints = []
    for path, params in [
        ("/document-templates/catalog", {"tenant_id": TENANT}),
        ("/document-templates/published-options", {"tenant_id": TENANT, "kind_code": "picking_list"}),
        ("/document-templates/templates/list", {"tenant_id": TENANT, "template_role": "DOCUMENT"}),
    ]:
        st, _, _ = req("GET", path, token, params)
        endpoints.append({"path": path, "status": st})
    results["6_devtools_dte"] = {
        "pass": all(item["status"] == 200 for item in endpoints),
        "endpoints": endpoints,
    }

    print(json.dumps(results, indent=2, ensure_ascii=False))
    return 0 if all(v.get("pass") for v in results.values() if isinstance(v, dict)) else 2


if __name__ == "__main__":
    raise SystemExit(main())
