from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from fastapi import Depends
from ..auth.deps import require_any_permission
from ..auth.warehouse_deps import (
    require_operable_warehouse,
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    assert_stock_document_warehouse,
    enforce_warehouse_access,
)
from fastapi.responses import Response
from sqlalchemy.orm import Session
from starlette import status

from ..database import get_db
from ..models.app_user import AppUser
from ..models.cart import Cart
from ..services.cart_service import CartService
from ..services.cart_picking_lifecycle_service import (
    CartLifecycleError,
    InvalidCartTransitionError,
    admin_release_cart,
)
from ..schemas.cart import (
    CartMultiCreate,
    CartBulkCreate,
    CartUpdate,
    CartGroupCreate,
    CartGroupUpdate,
)
from ..schemas.wms_packing import WmsPackingCartOrdersOut
from ..services.wms_packing_service import get_packing_cart_orders_by_scan_code

router = APIRouter(
    prefix="/carts",
    tags=["Carts"]
)


class AdminReleaseCartBody(BaseModel):
    acknowledge: bool = Field(..., description="Wymagane potwierdzenie konsekwencji")

# ==========================================================
# GET ALL: Pobiera listę wózków przypisanych do Tenanta
# ==========================================================
@router.get("/")
def get_carts(tenant_id: int, cart_type: str | None = None, db: Session = Depends(get_db)):
    service = CartService(db)
    return service.get_all(tenant_id, cart_type)


@router.get("/by-code/{code}")
def get_cart_by_code(
    code: str,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    """Wózek po kodzie skanowanym (``code`` lub legacy ``barcode``) w obrębie tenant + magazyn."""
    service = CartService(db)
    return service.get_details_by_code(tenant_id, warehouse_id, code)


@router.get("/by-code/{code}/orders", response_model=WmsPackingCartOrdersOut)
def get_cart_packing_orders_by_code(
    code: str,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1, description="order_ui_status_id — status kolejki pakowania"),
    mode: str = Query(
        ...,
        description="bulk | baskets — jak na ekranie pakowania (no_cart nieobsługiwane)",
    ),
    db: Session = Depends(get_db),
):
    """
    Zamówienia z kolejki pakowania dla wózka po kodzie skanu (odpowiednik intencji ``GET /carts/{code}/orders``;
    ścieżka ``by-code/{code}`` unika kolizji z ``/{cart_id}/labels``).
    """
    try:
        return get_packing_cart_orders_by_scan_code(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            cart_code=code,
            status_id=status,
            mode=mode,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ==========================================================
# CREATE GROUP: Tworzy nową grupę wózków
# ==========================================================
@router.get("/groups/")
def list_cart_groups(
    tenant_id: int,
    cart_type: str,
    db: Session = Depends(get_db),
):
    service = CartService(db)
    return service.get_groups(tenant_id, cart_type)


@router.post("/groups/")
def create_cart_group(
    tenant_id: int,
    data: CartGroupCreate,
    db: Session = Depends(get_db)
):
    service = CartService(db)
    return service.create_group(tenant_id, data.cart_type, data.name, data.description)


@router.put("/groups/{group_id}/")
def update_cart_group(
    group_id: int,
    data: CartGroupUpdate,
    db: Session = Depends(get_db),
):
    service = CartService(db)
    return service.update_group(group_id, data.name, data.description)


@router.delete("/groups/{group_id}/")
def delete_cart_group(
    group_id: int,
    db: Session = Depends(get_db),
):
    service = CartService(db)
    return service.delete_group(group_id)

# ==========================================================
# BARCODES / LABELS: PDF z kodami kreskowymi (Code128)
# ==========================================================
def _pdf_response(pdf_bytes: bytes, filename: str) -> Response:
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{cart_id}/labels")
def get_cart_labels(
    cart_id: int,
    tenant_id: int = 1,
    db: Session = Depends(get_db),
):
    """Download PDF with cart label using default cart template. Falls back to legacy barcode-only PDF if no template set."""
    service = CartService(db)
    pdf_bytes = service.get_cart_labels_pdf(cart_id, tenant_id)
    return _pdf_response(pdf_bytes, f"cart-{cart_id}-labels.pdf")


@router.get("/{cart_id}/barcode")
def get_cart_barcode(cart_id: int, db: Session = Depends(get_db)):
    """Download PDF with cart barcode only. Code128. Returns application/pdf."""
    service = CartService(db)
    pdf_bytes = service.get_cart_barcode_pdf(cart_id)
    return _pdf_response(pdf_bytes, f"cart-{cart_id}-barcode.pdf")


@router.get("/{cart_id}/basket-labels")
def get_cart_basket_labels(
    cart_id: int,
    tenant_id: int = 1,
    db: Session = Depends(get_db),
):
    """Download PDF with one page per basket using default basket template. Falls back to legacy barcode-only PDF if no template set."""
    service = CartService(db)
    pdf_bytes = service.get_basket_labels_pdf(cart_id, tenant_id)
    return _pdf_response(pdf_bytes, f"cart-{cart_id}-basket-labels.pdf")


@router.get("/{cart_id}/basket-barcodes")
def get_cart_basket_barcodes(cart_id: int, db: Session = Depends(get_db)):
    """Download PDF with basket barcodes only. Code128. Returns application/pdf."""
    service = CartService(db)
    pdf_bytes = service.get_basket_barcodes_pdf(cart_id)
    return _pdf_response(pdf_bytes, f"cart-{cart_id}-basket-barcodes.pdf")


@router.get("/{cart_id}/all-barcodes")
def get_cart_all_barcodes(cart_id: int, db: Session = Depends(get_db)):
    """Download PDF with cart barcode + all basket barcodes. Code128. Returns application/pdf."""
    service = CartService(db)
    pdf_bytes = service.get_barcodes_pdf(cart_id)
    return _pdf_response(pdf_bytes, f"cart-{cart_id}-all-barcodes.pdf")


@router.get("/{cart_id}/barcodes")
def get_cart_barcodes(cart_id: int, db: Session = Depends(get_db)):
    """Legacy: same as GET /carts/{cart_id}/all-barcodes."""
    service = CartService(db)
    pdf_bytes = service.get_barcodes_pdf(cart_id)
    return _pdf_response(pdf_bytes, f"cart-{cart_id}-barcodes.pdf")


@router.get("/{cart_id}/barcodes/pdf")
def get_cart_barcodes_pdf(cart_id: int, db: Session = Depends(get_db)):
    """Legacy alias: same as GET /carts/{cart_id}/all-barcodes."""
    service = CartService(db)
    pdf_bytes = service.get_barcodes_pdf(cart_id)
    return _pdf_response(pdf_bytes, f"cart-{cart_id}-barcodes.pdf")


# ==========================================================
# GET DETAILS: Pobiera pełne dane wózka wraz z jego koszykami
# ==========================================================
@router.get("/{cart_id}/")
def get_cart_details(cart_id: int, db: Session = Depends(get_db)):
    service = CartService(db)
    return service.get_details(cart_id)

def _cart_to_response_item(cart):
    """Format created cart like get_all items for frontend consistency."""
    cart.recalculate_total_volume()
    raw_type = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    clean_type = raw_type.split(".")[-1].upper()
    raw_status = cart.status.value if hasattr(cart.status, "value") else str(cart.status)
    clean_status = raw_status.split(".")[-1].upper()
    return {
        "id": cart.id,
        "name": cart.name,
        "code": getattr(cart, "code", None) or getattr(cart, "barcode", None),
        "barcode": getattr(cart, "barcode", None),
        "type": clean_type,
        "status": clean_status,
        "group_id": cart.group_id,
        "image_url": cart.image_url,
        "total_baskets": len(cart.baskets) if clean_type == "MULTI" else 1,
        "total_volume_dm3": round(cart.total_volume or 0, 2),
        "used_volume": round(cart.used_volume or 0, 2),
        "width": getattr(cart, "width", None) or 0,
        "length": getattr(cart, "length", None) or 0,
        "height": getattr(cart, "height", None) or 0,
    }


# ==========================================================
# CREATE MULTI: Tworzy nowy wózek z wieloma koszykami naraz
# ==========================================================
@router.post("/multi/", status_code=status.HTTP_201_CREATED)
def create_multi_cart(
    data: CartMultiCreate,
    db: Session = Depends(get_db)
):
    service = CartService(db)
    cart = service.create_multi_cart(data)
    return _cart_to_response_item(cart)


# ==========================================================
# UPDATE CART: Aktualizuje nazwę wózka i jego strukturę koszyków
# ==========================================================
@router.put("/{cart_id}/")
def update_cart(
    cart_id: int, 
    data: CartUpdate,
    db: Session = Depends(get_db)
):
    service = CartService(db)
    # Logika: Service powinien obsłużyć podmienianie koszyków
    return service.update_cart(cart_id, data)

# ==========================================================
# DELETE: Usuwa wózek oraz wszystkie przypisane do niego koszyki
# ==========================================================
@router.delete("/{cart_id}/")
def delete_cart(cart_id: int, db: Session = Depends(get_db)):
    service = CartService(db)
    return service.delete_cart(cart_id)

# ==========================================================
# RESET / CLEAR: Czyści przypisania (order.cart_id/basket_id = NULL)
# ==========================================================
@router.post("/{cart_id}/reset/")
def reset_cart(cart_id: int, db: Session = Depends(get_db)):
    service = CartService(db)
    return service.reset_cart(cart_id)


@router.post("/{cart_id}/clear/")
def clear_cart(cart_id: int, db: Session = Depends(get_db)):
    """Wyczyść wózek: odepnij wszystkie zamówienia od tego wózka."""
    service = CartService(db)
    return service.clear_cart(cart_id)


def admin_release_cart_endpoint(
    cart_id: int,
    body: AdminReleaseCartBody,
    db: Session = Depends(get_db),
    actor: AppUser = Depends(
        require_any_permission("warehouse.carts.admin_release", "warehouse.picking.override")
    ),
):
    """
    Awaryjne zwolnienie wózka z panelu administracyjnego.
    Wyłącznie przez CartLifecycleService — bez lokalnych UPDATE poza SSOT.
    """
    import logging
    import traceback as _tb

    _log = logging.getLogger("admin_release.diag")
    step = 0

    def _step(n: int, msg: str) -> None:
        nonlocal step
        step = n
        _log.error("ADMIN_RELEASE STEP %s cart_id=%s %s", n, cart_id, msg)

    try:
        _step(1, f"endpoint enter actor_id={getattr(actor, 'id', None)} ack={getattr(body, 'acknowledge', None)}")
        cart = db.query(Cart).filter(Cart.id == int(cart_id)).first()
        _step(2, f"cart loaded id={getattr(cart, 'id', None)} status={getattr(cart, 'status', None)}")
        if cart is None:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")
        _step(
            3,
            f"calling admin_release_cart tenant={cart.tenant_id} wh={cart.warehouse_id}",
        )
        result = admin_release_cart(
            db,
            cart_id=int(cart_id),
            tenant_id=int(cart.tenant_id),
            warehouse_id=int(cart.warehouse_id),
            admin_user_id=int(actor.id),
            acknowledge=bool(body.acknowledge),
        )
        _step(4, f"admin_release_cart returned keys={list(result.keys())}")
        db.commit()
        _step(5, "db.commit OK")
        out = {"status": "OK", **result}
        _step(6, "response built")
        return out
    except InvalidCartTransitionError as e:
        _log.error(
            "ADMIN_RELEASE FAIL AT STEP %s (InvalidCartTransition) cart_id=%s\n%s",
            step,
            cart_id,
            _tb.format_exc(),
        )
        db.rollback()
        raise HTTPException(status_code=409, detail=str(e.message or e)) from e
    except CartLifecycleError as e:
        _log.error(
            "ADMIN_RELEASE FAIL AT STEP %s (CartLifecycleError) cart_id=%s\n%s",
            step,
            cart_id,
            _tb.format_exc(),
        )
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e.message or e)) from e
    except HTTPException:
        raise
    except Exception as e:
        tb_list = _tb.extract_tb(e.__traceback__)
        last = tb_list[-1] if tb_list else None
        _log.error(
            "ADMIN_RELEASE FAIL AT STEP %s cart_id=%s\n%s",
            step,
            cart_id,
            _tb.format_exc(),
        )
        db.rollback()
        # TEMP diagnostics: surface step + exception in 500 body (remove after fix)
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ADMIN_RELEASE FAIL",
                "step": step,
                "exception_type": type(e).__name__,
                "exception": str(e)[:800],
                "file": last.filename if last else None,
                "line": last.lineno if last else None,
                "func": last.name if last else None,
            },
        ) from e


# Slash-safe: proxy / axios may strip or keep trailing slash → both must resolve (no 307→404).
router.add_api_route(
    "/{cart_id}/admin-release",
    admin_release_cart_endpoint,
    methods=["POST"],
    response_model=None,
    name="admin_release_cart",
)
router.add_api_route(
    "/{cart_id}/admin-release/",
    admin_release_cart_endpoint,
    methods=["POST"],
    response_model=None,
    name="admin_release_cart_slash",
    include_in_schema=False,
)


# ==========================================================
# BASKET OPERATIONS: Zarządzanie pojedynczymi koszykami
# ==========================================================

@router.put("/basket/{basket_id}/")
def update_basket(
    basket_id: int,
    data: dict,
    db: Session = Depends(get_db)
):
    service = CartService(db)
    return service.update_basket(basket_id, data)

@router.delete("/basket/{basket_id}/")
def delete_basket(
    basket_id: int,
    db: Session = Depends(get_db)
):
    service = CartService(db)
    return service.delete_basket(basket_id)


@router.post("/basket/{basket_id}/clear/")
def clear_basket(basket_id: int, db: Session = Depends(get_db)):
    """Opróżnij koszyk: odepnij zamówienie od tego koszyka."""
    service = CartService(db)
    return service.clear_basket(basket_id)

# ==========================================================
# CREATE BULK: Tworzy standardowy wózek jednokomorowy
# ==========================================================
@router.post("/bulk/", status_code=status.HTTP_201_CREATED)
def create_bulk_cart(data: CartBulkCreate, db: Session = Depends(get_db)):
    service = CartService(db)
    cart = service.create_bulk_cart(data)
    return _cart_to_response_item(cart)