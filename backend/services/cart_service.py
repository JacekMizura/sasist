import logging
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException

from ..models.cart import Cart
from ..models.cart_basket import CartBasket
from ..models.cart_group import CartGroup
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.enums import CartType, CartStatus
from ..schemas.cart import CartBulkCreate, CartUpdate

logger = logging.getLogger(__name__)


def _order_total_weight_kg(order) -> float:
    """Sum of (quantity * product.weight) for all items; product.weight in kg (CSV comma-to-dot)."""
    total = 0.0
    for item in getattr(order, "items", []) or []:
        product = getattr(item, "product", None)
        w = float(product.weight or 0) if product else 0
        qty = int(item.quantity or 0)
        total += w * qty
    return round(total, 3)

class CartService:
    def __init__(self, db: Session):
        self.db = db

    def create_bulk_cart(self, data: CartBulkCreate):
        vol = (data.length * data.width * data.height) / 1000
        new_cart = Cart(
            name=data.name.upper(),
            tenant_id=data.tenant_id,
            warehouse_id=data.warehouse_id,
            group_id=getattr(data, 'group_id', None),
            image_url=getattr(data, 'image_url', None),
            length=data.length,
            width=data.width,
            height=data.height,
            total_volume=vol,
            type=CartType.BULK,
            status=CartStatus.AVAILABLE
        )
        self.db.add(new_cart)
        try:
            self.db.commit()
            self.db.refresh(new_cart)
            logger.info("create_bulk_cart committed cart id=%s tenant_id=%s warehouse_id=%s", new_cart.id, data.tenant_id, data.warehouse_id)
            return new_cart
        except IntegrityError as e:
            self.db.rollback()
            logger.exception("create_bulk_cart IntegrityError (e.g. missing tenant_id/warehouse_id): %s", e)
            raise HTTPException(status_code=422, detail=f"Błąd zapisu wózka: {str(e.orig)}")

    def create_multi_cart(self, data):
        cart = Cart(
            name=data.name.upper(),
            tenant_id=data.tenant_id,
            warehouse_id=data.warehouse_id,
            group_id=getattr(data, 'group_id', None),
            image_url=getattr(data, 'image_url', None),
            type=CartType.MULTI,
            total_volume=0,
            status=CartStatus.AVAILABLE
        )
        self.db.add(cart)
        self.db.flush()

        baskets_data = data.baskets if hasattr(data, 'baskets') else data.get('baskets', [])
        for b_info in baskets_data:
            get_val = lambda obj, key, default: getattr(obj, key, default) if hasattr(obj, key) else obj.get(key, default)
            l = get_val(b_info, 'length', 0)
            w = get_val(b_info, 'width', 0)
            h = get_val(b_info, 'height', 0)
            vol_cm3 = (l * w * h)
            
            basket = CartBasket(
                cart_id=cart.id,
                name=get_val(b_info, 'name', f"S-{get_val(b_info, 'row', 0)}/{get_val(b_info, 'column', 0)}"),
                row=get_val(b_info, 'row', 0),
                column=get_val(b_info, 'column', 0),
                inner_length=l,
                inner_width=w,
                inner_height=h,
                usable_volume=vol_cm3
            )
            self.db.add(basket)

        self.db.flush()
        cart.recalculate_total_volume()
        try:
            self.db.commit()
            self.db.refresh(cart)
            logger.info("create_multi_cart committed cart id=%s tenant_id=%s warehouse_id=%s", cart.id, cart.tenant_id, cart.warehouse_id)
            return cart
        except IntegrityError as e:
            self.db.rollback()
            logger.exception("create_multi_cart IntegrityError (e.g. missing tenant_id/warehouse_id): %s", e)
            raise HTTPException(status_code=422, detail=f"Błąd zapisu wózka: {str(e.orig)}")

    def get_groups(self, tenant_id: int, cart_type: str):
        """
        Lightweight group listing for dropdowns. `cart_type` must be BULK or MULTI.
        """
        ct = CartType[cart_type.upper()]
        groups = (
            self.db.query(CartGroup)
            .filter(CartGroup.tenant_id == tenant_id, CartGroup.cart_type == ct)
            .all()
        )
        return [
            {"id": g.id, "tenant_id": g.tenant_id, "cart_type": cart_type.upper(), "name": g.name, "description": g.description}
            for g in groups
        ]

    def get_all(self, tenant_id: int, cart_type: str | None = None):
        ct = CartType[cart_type.upper()] if cart_type else None

        groups_q = (
            self.db.query(CartGroup)
            .filter(CartGroup.tenant_id == tenant_id)
            .options(
                joinedload(CartGroup.carts).joinedload(Cart.baskets),
                joinedload(CartGroup.carts)
                .joinedload(Cart.assigned_orders)
                .joinedload(Order.items)
                .joinedload(OrderItem.product),
            )
        )
        if ct is not None:
            groups_q = groups_q.filter(CartGroup.cart_type == ct)
        groups = groups_q.all()

        carts_q = self.db.query(Cart).filter(Cart.tenant_id == tenant_id, Cart.group_id == None)
        if ct is not None:
            carts_q = carts_q.filter(Cart.type == ct)
        unassigned_carts = carts_q.options(
            joinedload(Cart.baskets),
            joinedload(Cart.assigned_orders).joinedload(Order.items).joinedload(OrderItem.product),
        ).all()

        def format_item(cart):
            cart.recalculate_total_volume()
            raw_type = cart.type.value if hasattr(cart.type, 'value') else str(cart.type)
            clean_type = raw_type.split('.')[-1].upper()
            raw_status = cart.status.value if hasattr(cart.status, 'value') else str(cart.status)
            clean_status = raw_status.split('.')[-1].upper()
            assigned = getattr(cart, "assigned_orders", None) or []
            assigned_orders = [
                {"order_id": o.id, "total_volume_dm3": round(getattr(o, "total_volume_dm3", 0) or 0, 2)}
                for o in assigned
            ]
            order_numbers = [str(o.number) for o in assigned if getattr(o, "number", None) not in (None, "")]
            total_weight_kg = round(sum(_order_total_weight_kg(o) for o in assigned), 3)
            used_volume = round(sum(getattr(o, "total_volume_dm3", 0) or 0 for o in assigned), 2)
            return {
                "id": cart.id,
                "name": cart.name,
                "type": clean_type,
                "status": clean_status,
                "group_id": cart.group_id,
                "image_url": cart.image_url,
                "total_baskets": len(cart.baskets) if clean_type == "MULTI" else 1,
                "total_volume_dm3": round(cart.total_volume or 0, 2),
                "used_volume": used_volume,
                "assigned_orders": assigned_orders,
                "order_numbers": order_numbers,
                "total_weight_kg": total_weight_kg,
                "width": cart.width or 0,
                "length": cart.length or 0,
                "height": cart.height or 0
            }

        result = []
        for g in groups:
            result.append({
                "id": g.id,
                "name": g.name,
                "is_group": True,
                "cart_type": (g.cart_type.name.upper() if hasattr(g.cart_type, "name") else str(g.cart_type).split(".")[-1].upper()),
                "items": [
                    format_item(c)
                    for c in g.carts
                    if (ct is None or c.type == ct) and (not hasattr(g, "cart_type") or c.type == g.cart_type)
                ]
            })

        if unassigned_carts:
            result.append({
                "id": 999,
                "name": "WÓZKI NIEPRZYPISANE",
                "is_group": True,
                "items": [format_item(c) for c in unassigned_carts]
            })
        return result

    def get_details(self, cart_id: int):
        cart = self.db.query(Cart).options(
            joinedload(Cart.baskets).joinedload(CartBasket.order).joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Cart.assigned_orders).joinedload(Order.items).joinedload(OrderItem.product),
        ).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")

        raw_type = cart.type.value if hasattr(cart.type, 'value') else str(cart.type)
        clean_type = raw_type.split('.')[-1].upper()
        assigned = getattr(cart, "assigned_orders", None) or []
        used_volume = round(sum(getattr(o, "total_volume_dm3", 0) or 0 for o in assigned), 2)
        order_numbers = [str(o.number) for o in assigned if getattr(o, "number", None) not in (None, "")]
        total_weight_kg = round(sum(_order_total_weight_kg(o) for o in assigned), 3)

        baskets_out = []
        for b in cart.baskets or []:
            o = getattr(b, "order", None)
            w = round(_order_total_weight_kg(o), 3) if o else 0.0
            baskets_out.append({
                "id": b.id,
                "name": b.name,
                "row": b.row,
                "column": b.column,
                "length": b.inner_length,
                "width": b.inner_width,
                "height": b.inner_height,
                "order_id": b.order_id,
                "order_number": o.number if o else None,
                "used_volume_dm3": round(getattr(b, "used_volume", None) or 0, 2),
                "total_weight_kg": w,
            })

        return {
            "id": cart.id,
            "name": cart.name,
            "type": clean_type,
            "tenant_id": cart.tenant_id,
            "warehouse_id": cart.warehouse_id,
            "group_id": cart.group_id,
            "image_url": cart.image_url,
            "length": cart.length or 0,
            "width": cart.width or 0,
            "height": cart.height or 0,
            "baskets": baskets_out,
            "used_volume": used_volume,
            "total_volume_dm3": round(cart.total_volume or 0, 2),
            "order_numbers": order_numbers,
            "total_weight_kg": total_weight_kg,
        }

    def clear_cart(self, cart_id: int) -> dict:
        """Unassign ALL orders from this cart and all its baskets: order.cart_id/basket_id = NULL,
        basket.order_id = None, basket.used_volume = 0, cart.used_volume = 0."""
        cart = self.db.query(Cart).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")
        orders_updated = (
            self.db.query(Order)
            .filter(Order.cart_id == cart_id)
            .update(
                {Order.cart_id: None, Order.basket_id: None, Order.total_volume_dm3: None, Order.status: "NEW"},
                synchronize_session="fetch",
            )
        )
        self.db.query(CartBasket).filter(CartBasket.cart_id == cart_id).update(
            {CartBasket.used_volume: 0, CartBasket.order_id: None},
            synchronize_session="fetch",
        )
        cart.used_volume = 0
        cart.status = CartStatus.AVAILABLE
        self.db.add(cart)
        self.db.commit()
        return {"status": "OK", "orders_cleared": orders_updated}

    def clear_basket(self, basket_id: int) -> dict:
        """Unassign only the order from this specific basket; update that order's cart_id/basket_id to NULL;
        recalc parent cart.used_volume from remaining assigned orders."""
        basket = self.db.query(CartBasket).filter(CartBasket.id == basket_id).first()
        if not basket:
            raise HTTPException(status_code=404, detail="Koszyk nie istnieje")
        order_id = basket.order_id
        cart_id = basket.cart_id
        basket.order_id = None
        basket.used_volume = 0
        self.db.add(basket)
        if order_id:
            self.db.query(Order).filter(Order.id == order_id).update(
                {Order.cart_id: None, Order.basket_id: None, Order.total_volume_dm3: None, Order.status: "NEW"},
                synchronize_session="fetch",
            )
        orders_on_cart = self.db.query(Order).filter(Order.cart_id == cart_id).all()
        cart = self.db.query(Cart).filter(Cart.id == cart_id).first()
        if cart:
            cart.used_volume = round(sum(getattr(o, "total_volume_dm3", 0) or 0 for o in orders_on_cart), 2)
            cart.status = CartStatus.IN_PROGRESS if cart.used_volume and cart.used_volume > 0 else CartStatus.AVAILABLE
            self.db.add(cart)
        self.db.commit()
        return {"status": "OK", "order_cleared": order_id}

    def reset_cart(self, cart_id: int) -> dict:
        """Alias for clear_cart: clear assignments for this cart."""
        return self.clear_cart(cart_id)

    def delete_cart(self, cart_id: int):
        cart = self.db.query(Cart).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")
        
        self.db.delete(cart)
        self.db.commit()
        return {"status": "deleted"}

    def create_group(self, tenant_id: int, cart_type, name: str, description: str = None):
        # cart_type can be a Pydantic Enum (value/name like "MULTI") or a plain string.
        if hasattr(cart_type, "name") and str(cart_type.name).upper() in ("MULTI", "BULK"):
            ct = CartType[str(cart_type.name).upper()]
        elif hasattr(cart_type, "value") and str(cart_type.value).upper() in ("MULTI", "BULK"):
            ct = CartType[str(cart_type.value).upper()]
        else:
            ct = CartType[str(cart_type).upper()]
        new_group = CartGroup(
            tenant_id=tenant_id,
            cart_type=ct,
            name=name.upper(),
            description=description
        )
        self.db.add(new_group)
        self.db.commit()
        self.db.refresh(new_group)
        return new_group

    def update_group(self, group_id: int, name: str | None = None, description: str | None = None):
        group = self.db.query(CartGroup).filter(CartGroup.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Grupa nie istnieje")

        changed = False
        if name is not None and group.name != name.upper():
            logger.info("[update_group] name: %s -> %s", group.name, name.upper())
            group.name = name.upper()
            changed = True
        if description is not None and group.description != description:
            logger.info("[update_group] description: %s -> %s", group.description, description)
            group.description = description
            changed = True

        if changed:
            self.db.commit()
            self.db.refresh(group)

        return group

    def delete_group(self, group_id: int):
        group = self.db.query(CartGroup).filter(CartGroup.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Grupa nie istnieje")

        # Odczepiamy wózki od grupy zamiast je usuwać
        carts = self.db.query(Cart).filter(Cart.group_id == group_id).all()
        for cart in carts:
            logger.info("[delete_group] odpinam wózek %s od grupy %s", cart.id, group_id)
            cart.group_id = None

        self.db.delete(group)
        self.db.commit()
        return {"status": "deleted"}

    def update_cart(self, cart_id: int, data: CartUpdate):
        """
        Update cart from Pydantic CartUpdate model.
        - Explicitly updates group_id
        - Updates scalar fields (name, warehouse_id, length, width, height, total_volume)
        - Replaces basket structure when `baskets` is provided (for MULTI carts)
        """
        cart = self.db.query(Cart).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")

        # Normalize to dict (Pydantic v1 or v2)
        if hasattr(data, "model_dump"):
            update_data = data.model_dump(exclude_unset=True)
        else:
            update_data = data.dict(exclude_unset=True)

        logger.info("[update_cart] cart_id=%s payload_keys=%s", cart_id, list(update_data.keys()))

        changes = []

        # --- group_id: explicit update (frontend sends null to unassign) ---
        if "group_id" in update_data:
            new_group_id = update_data["group_id"]
            if new_group_id == 999:
                new_group_id = None
            old_group_id = cart.group_id
            if old_group_id != new_group_id:
                logger.info("[update_cart] group_id: %s -> %s", old_group_id, new_group_id)
                cart.group_id = new_group_id
                changes.append(("group_id", old_group_id, new_group_id))

        # --- Scalar fields allowed on Cart model (both BULK and MULTI) ---
        scalar_updates = {
            "name": ("name", lambda v: (v or "").upper() if v else v),
            "warehouse_id": ("warehouse_id", lambda v: v),
            "image_url": ("image_url", lambda v: v),
            "length": ("length", float),
            "width": ("width", float),
            "height": ("height", float),
        }
        for payload_key, (model_attr, normalize) in scalar_updates.items():
            if payload_key not in update_data:
                continue
            if not hasattr(cart, model_attr):
                continue
            raw_val = update_data[payload_key]
            if raw_val is None:
                continue
            try:
                new_val = normalize(raw_val)
            except (TypeError, ValueError):
                logger.warning("[update_cart] cannot normalize %s=%r", payload_key, raw_val)
                continue
            old_val = getattr(cart, model_attr)
            if old_val != new_val:
                logger.info("[update_cart] %s: %s -> %s", model_attr, old_val, new_val)
                setattr(cart, model_attr, new_val)
                changes.append((model_attr, old_val, new_val))

        # total_volume_dm3 from payload -> cart.total_volume
        if "total_volume_dm3" in update_data:
            new_vol = update_data["total_volume_dm3"]
            if new_vol is not None:
                try:
                    new_vol = float(new_vol)
                except (TypeError, ValueError):
                    logger.warning("[update_cart] cannot parse total_volume_dm3=%r", new_vol)
                else:
                    old_vol = cart.total_volume
                    if old_vol != new_vol:
                        logger.info("[update_cart] total_volume: %s -> %s", old_vol, new_vol)
                        cart.total_volume = new_vol
                        changes.append(("total_volume", old_vol, new_vol))

        # --- Replace basket structure when provided (MULTI carts) ---
        if "baskets" in update_data and update_data["baskets"] is not None:
            new_baskets = update_data["baskets"]
            logger.info("[update_cart] replacing baskets for cart_id=%s, count=%s", cart_id, len(new_baskets))

            # Remove existing baskets
            self.db.query(CartBasket).filter(CartBasket.cart_id == cart_id).delete(synchronize_session=False)

            # Add new baskets
            for b in new_baskets:
                # b can be Pydantic model or dict
                if hasattr(b, "model_dump"):
                    b_data = b.model_dump()
                elif hasattr(b, "dict"):
                    b_data = b.dict()
                else:
                    b_data = dict(b)

                length = float(b_data.get("length", 0) or 0)
                width = float(b_data.get("width", 0) or 0)
                height = float(b_data.get("height", 0) or 0)
                vol_cm3 = length * width * height

                basket = CartBasket(
                    cart_id=cart.id,
                    name=b_data.get(
                        "name",
                        f"S-{b_data.get('row', 0)}/{b_data.get('column', 0)}",
                    ),
                    row=int(b_data.get("row", 0) or 0),
                    column=int(b_data.get("column", 0) or 0),
                    inner_length=length,
                    inner_width=width,
                    inner_height=height,
                    usable_volume=vol_cm3,
                )
                self.db.add(basket)

            self.db.flush()
            cart.recalculate_total_volume()
            changes.append(("baskets", "replaced", f"{len(new_baskets)} items"))

        if changes:
            self.db.commit()
            self.db.refresh(cart)
            logger.info("[update_cart] cart_id=%s saved %s change(s)", cart_id, len(changes))
        else:
            logger.info("[update_cart] cart_id=%s no changes", cart_id)

        return cart