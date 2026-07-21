"""
Hierarchical permission catalog — backend source of truth.

Leaves store stable dot-keys persisted in ``user_permissions.permission_key``.
``PERMISSION_TREE`` drives Module → Section → permission UI (exactly two nesting levels
below the root category). ``PERMISSION_KEYS`` is the flat union.
"""

from __future__ import annotations

from typing import Any


# --- Tree builders ---------------------------------------------------------------------------


def _leaf(key: str, label: str) -> dict[str, Any]:
    return {"key": key, "label": label}


def _node(nid: str, label: str, children: list[dict[str, Any]]) -> dict[str, Any]:
    return {"id": nid, "label": label, "children": children}


def _walk_collect_keys(nodes: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    for n in nodes:
        if "key" in n:
            out.append(str(n["key"]))
        ch = n.get("children")
        if ch:
            out.extend(_walk_collect_keys(ch))
    return out


# Category (module) → Section → leaves (keys persisted verbatim)

PERMISSION_TREE: list[dict[str, Any]] = [
    _node(
        "cat_orders",
        "Zamówienia",
        [
            _node(
                "sec_orders_view",
                "Widok",
                [
                    _leaf("orders.list", "Lista zamówień"),
                    _leaf("orders.detail", "Szczegóły zamówienia"),
                    _leaf("orders.customer", "Dane klienta"),
                    _leaf("orders.history", "Historia zmian"),
                    _leaf("orders.documents", "Dokumenty"),
                    _leaf(
                        "orders.view",
                        "Podgląd ogólny",
                    ),
                ],
            ),
            _node(
                "sec_orders_ops",
                "Operacje",
                [
                    _leaf("orders.create", "Tworzenie"),
                    _leaf("orders.edit", "Edycja"),
                    _leaf("orders.cancel", "Anulowanie"),
                    _leaf("orders.delete", "Usuwanie"),
                    _leaf("orders.merge", "Scalanie"),
                    _leaf("orders.split", "Dzielenie"),
                    _leaf("orders.duplicate", "Duplikacja"),
                ],
            ),
            _node(
                "sec_orders_fulfillment",
                "Realizacja",
                [
                    _leaf("orders.pick", "Kompletacja"),
                    _leaf("orders.pack", "Pakowanie"),
                    _leaf("orders.ship", "Oznacz jako wysłane"),
                    _leaf("orders.unship", "Cofnij wysyłkę"),
                    _leaf("orders.labels", "Generowanie etykiet"),
                ],
            ),
            _node(
                "sec_orders_status",
                "Statusy",
                [
                    _leaf("orders.status.new", "Nowe"),
                    _leaf("orders.status.paid", "Opłacone"),
                    _leaf("orders.status.picking", "Do kompletacji"),
                    _leaf("orders.status.ready_to_pack", "Do pakowania"),
                    _leaf("orders.status.packed", "Spakowane"),
                    _leaf("orders.status.shipped", "Wysłane"),
                    _leaf("orders.status.cancelled", "Anulowane"),
                    _leaf("orders.status.returned", "Zwrot"),
                ],
            ),
            _node(
                "sec_orders_finance",
                "Finansowe",
                [
                    _leaf("orders.finance.invoices", "Faktury"),
                    _leaf("orders.finance.corrections", "Korekty"),
                    _leaf("orders.finance.refunds", "Zwroty płatności"),
                ],
            ),
            _node(
                "sec_orders_export",
                "Eksport",
                [_leaf("orders.export", "Eksport danych")],
            ),
        ],
    ),
    _node(
        "cat_warehouse",
        "Magazyn",
        [
            _node(
                "sec_wh_floor",
                "Obszar magazynowy",
                [
                    _leaf("warehouse.locations", "Lokalizacje"),
                    _leaf("warehouse.relocations", "Przesunięcia"),
                    _leaf("warehouse.inventory", "Inwentaryzacje"),
                    _leaf("warehouse.receipts", "Przyjęcia"),
                    _leaf(
                        "warehouse.receipts.control",
                        "Przyjęcia — podgląd ilości z dokumentu i różnic",
                    ),
                    _leaf("warehouse.issues", "Wydania"),
                    _leaf("warehouse.reservations", "Rezerwacje"),
                    _leaf("warehouse.stock", "Stany"),
                    _leaf("warehouse.adjustments", "Korekty"),
                    _leaf("warehouse.operations", "Operacje magazynowe (ogólne)"),
                ],
            ),
            _node(
                "sec_wh_wms",
                "Kompletacja (WMS)",
                [
                    _leaf("warehouse.picking.start", "Start"),
                    _leaf("warehouse.picking.continue", "Kontynuacja"),
                    _leaf("warehouse.picking.assign", "Przypisywanie"),
                    _leaf("warehouse.picking.override", "Override"),
                    _leaf("warehouse.carts.admin_release", "Awaryjne zwolnienie wózka"),
                ],
            ),
            _node(
                "sec_wh_doc_status",
                "Statusy dokumentów magazynowych",
                [
                    _leaf("inventory.status.draft", "Szkic"),
                    _leaf("inventory.status.closed", "Zamknięty"),
                ],
            ),
            _node(
                "sec_inv_count",
                "Inwentaryzacja (ERP/WMS)",
                [
                    _leaf("inventory.view", "Podgląd inwentaryzacji"),
                    _leaf("inventory.export", "Eksport raportów"),
                    _leaf("inventory.audit_package", "Pakiet audytowy"),
                    _leaf("inventory.execute", "Liczenie WMS"),
                    _leaf("inventory.recount", "Przeliczenia"),
                    _leaf("inventory.override", "Override liczenia"),
                    _leaf("inventory.submit", "Przekazanie do zatwierdzenia"),
                    _leaf("inventory.approve", "Zatwierdzenie"),
                    _leaf("inventory.reject", "Odrzucenie"),
                    _leaf("inventory.post", "Księgowanie RW/PW"),
                    _leaf("inventory.force_unlock", "Wymuszone odblokowanie"),
                    _leaf("inventory.cancel", "Anulowanie inwentaryzacji"),
                    _leaf("inventory.delete", "Usuwanie dokumentów"),
                ],
            ),
        ],
    ),
    _node(
        "cat_products",
        "Asortyment",
        [
            _node(
                "sec_products",
                "Produkty",
                [
                    _leaf("products.view", "Podgląd"),
                    _leaf("products.edit", "Edycja danych"),
                    _leaf("products.pricing", "Edycja cen"),
                    _leaf("products.stock_edit", "Edycja stanów"),
                    _leaf("products.sku", "Edycja SKU"),
                    _leaf("products.images", "Edycja zdjęć"),
                    _leaf("products.import", "Import"),
                    _leaf("products.export", "Eksport"),
                    _leaf("products.merge", "Łączenie ofert"),
                ],
            ),
        ],
    ),
    _node(
        "cat_purchasing",
        "Zakupy",
        [
            _node(
                "sec_po",
                "Zamówienia zakupu",
                [
                    _leaf("purchasing.orders.create", "Tworzenie"),
                    _leaf("purchasing.orders.approve", "Akceptacja"),
                    _leaf("purchasing.orders.receive", "Przyjęcie"),
                ],
            ),
        ],
    ),
    _node(
        "cat_settings",
        "Ustawienia",
        [
            _node(
                "sec_settings",
                "Panel",
                [
                    _leaf("settings.statuses", "Statusy"),
                    _leaf("settings.users", "Administratorzy"),
                    _leaf("settings.company", "Firma — profil i branding"),
                    _leaf("settings.automation", "Automatyzacja"),
                ],
            ),
        ],
    ),
    _node(
        "cat_complaints",
        "Reklamacje",
        [
            _node(
                "sec_complaints",
                "Obsługa",
                [_leaf("complaints.manage", "Obsługa reklamacji")],
            ),
            _node(
                "sec_complaints_status",
                "Statusy",
                [
                    _leaf("complaints.status.new", "Nowe"),
                    _leaf("complaints.status.accepted", "Zaakceptowane"),
                    _leaf("complaints.status.rejected", "Odrzucone"),
                ],
            ),
        ],
    ),
    _node(
        "cat_returns",
        "Zwroty",
        [
            _node(
                "sec_returns_status",
                "Statusy",
                [
                    _leaf("returns.status.pending", "Oczekuje"),
                    _leaf("returns.status.received", "Przyjęto"),
                ],
            ),
        ],
    ),
    _node(
        "cat_audit",
        "Audyt",
        [
            _node(
                "sec_audit",
                "Bezpieczeństwo",
                [_leaf("audit.view", "Podgląd logów")],
            ),
        ],
    ),
    _node(
        "cat_workforce",
        "WMS",
        [
            _node(
                "sec_workforce_core",
                "Operacje i analityka",
                [
                    _leaf("workforce.dashboard", "Panel operacyjny"),
                    _leaf("workforce.activity.read", "Podgląd logów aktywności operatorów"),
                    _leaf("workforce.activity.write", "Rejestrowanie zdarzeń operacyjnych"),
                    _leaf("workforce.costs.read", "Koszty pracodawcy — podgląd"),
                    _leaf("workforce.costs.write", "Koszty pracodawcy — edycja"),
                    _leaf("workforce.status_matrix.read", "Macierz dostępu do statusów panelu"),
                    _leaf("workforce.status_matrix.write", "Macierz dostępu do statusów — edycja"),
                    _leaf("workforce.analytics.export", "Eksport zbiorczy metryk operacyjnych"),
                ],
            ),
            _node(
                "sec_workforce_ops",
                "Uprawnienia operacji (skrót dla ról magazynowych)",
                [
                    _leaf("workforce.ops.import_csv", "Import CSV danych"),
                    _leaf("workforce.ops.export_data", "Eksport danych"),
                    _leaf("workforce.ops.stock_edit", "Korekty stanów magazynowych"),
                    _leaf("workforce.ops.price_edit", "Zmiana cen"),
                    _leaf("workforce.ops.delete_entities", "Usuwanie / archiwizacja encji"),
                    _leaf("workforce.ops.print_labels", "Druk etykiet"),
                    _leaf("workforce.ops.label_templates", "Szablony etykiet"),
                    _leaf("workforce.ops.approve_complaints", "Decyzje reklamacyjne"),
                    _leaf("workforce.ops.edit_locations", "Edycja lokalizacji magazynowych"),
                ],
            ),
        ],
    ),
]


PERMISSION_KEYS: tuple[str, ...] = tuple(sorted(set(_walk_collect_keys(PERMISSION_TREE))))


def _pfx(keys: tuple[str, ...], *prefixes: str) -> tuple[str, ...]:
    return tuple(sorted(k for k in keys if any(k.startswith(p) for p in prefixes)))


# Role presets — subsets of PERMISSION_KEYS (super role bypasses checks entirely).
ROLE_PERMISSION_PRESETS: dict[str, tuple[str, ...]] = {
    "super_admin": PERMISSION_KEYS,
    "admin": tuple(
        k
        for k in PERMISSION_KEYS
        if not k.startswith("purchasing.") or k in ("purchasing.orders.create", "purchasing.orders.receive")
    ),
    "warehouse_manager": tuple(
        sorted(
            {
                *_pfx(PERMISSION_KEYS, "workforce."),
                *(
                    "orders.list",
                    "orders.detail",
                    "orders.customer",
                    "orders.history",
                    "orders.documents",
                    "orders.create",
                    "orders.edit",
                    "orders.cancel",
                    "orders.merge",
                    "orders.split",
                    "orders.duplicate",
                    "orders.pick",
                    "orders.pack",
                    "orders.ship",
                    "orders.unship",
                    "orders.labels",
                    "orders.export",
                    "warehouse.locations",
                    "warehouse.relocations",
                    "warehouse.inventory",
                    "warehouse.receipts",
                    "warehouse.receipts.control",
                    "warehouse.issues",
                    "warehouse.reservations",
                    "warehouse.stock",
                    "warehouse.adjustments",
                    "warehouse.operations",
                    "warehouse.picking.start",
                    "warehouse.picking.continue",
                    "warehouse.picking.assign",
                    "warehouse.picking.override",
                    "warehouse.carts.admin_release",
                    "products.view",
                    "products.edit",
                    "products.pricing",
                    "products.stock_edit",
                    "products.sku",
                    "products.images",
                    "products.import",
                    "products.export",
                    "products.merge",
                    "complaints.manage",
                ),
                *_pfx(PERMISSION_KEYS, "orders.status.", "complaints.status.", "returns.status.", "inventory.status."),
            }
        )
    ),
    "picker": tuple(
        sorted(
            {
                *(
                    "orders.list",
                    "orders.detail",
                    "orders.pick",
                    "warehouse.operations",
                    "warehouse.locations",
                    "warehouse.stock",
                    "warehouse.picking.start",
                    "warehouse.picking.continue",
                    "warehouse.picking.assign",
                    "workforce.dashboard",
                    "workforce.activity.read",
                    "workforce.activity.write",
                    "workforce.status_matrix.read",
                ),
                *_pfx(PERMISSION_KEYS, "orders.status."),
            }
        )
    ),
    "packer": tuple(
        sorted(
            {
                *(
                    "orders.list",
                    "orders.detail",
                    "orders.pack",
                    "warehouse.operations",
                    "warehouse.locations",
                    "workforce.dashboard",
                    "workforce.activity.read",
                    "workforce.activity.write",
                    "workforce.status_matrix.read",
                    "workforce.ops.print_labels",
                ),
                *_pfx(PERMISSION_KEYS, "orders.status."),
            }
        )
    ),
    "purchasing": (
        "orders.list",
        "orders.detail",
        "products.view",
        "purchasing.orders.create",
        "purchasing.orders.approve",
        "purchasing.orders.receive",
        "warehouse.operations",
        "warehouse.receipts",
    ),
    "analyst": tuple(
        sorted(
            {
                *(
                    "orders.list",
                    "orders.detail",
                    "orders.export",
                    "products.view",
                    "warehouse.inventory",
                    "warehouse.stock",
                    "warehouse.operations",
                    "audit.view",
                    "workforce.dashboard",
                    "workforce.activity.read",
                    "workforce.costs.read",
                    "workforce.analytics.export",
                ),
                *_pfx(PERMISSION_KEYS, "orders.status.", "inventory.status."),
            }
        )
    ),
    "readonly": tuple(
        sorted(
            {
                *(
                    "orders.list",
                    "orders.detail",
                    "products.view",
                    "warehouse.operations",
                ),
                *_pfx(PERMISSION_KEYS, "orders.status."),
            }
        )
    ),
    # legacy names used by older clients
    "viewer": (
        "orders.list",
        "orders.detail",
        "products.view",
        "warehouse.operations",
    ),
}

# Inventory module role presets (Phase 3)
from ..services.inventory_count.permissions import INVENTORY_ROLE_PRESETS  # noqa: E402

ROLE_PERMISSION_PRESETS.update(INVENTORY_ROLE_PRESETS)
