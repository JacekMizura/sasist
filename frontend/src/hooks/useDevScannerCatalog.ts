import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import { searchWmsProducts, type WmsProductSearchHit } from "../api/wmsProductApi";
import { lookupOrdersForWms } from "../api/wmsReturnsApi";
import { getWarehouseLocations, type WarehouseLocationItem } from "../api/warehouseGraphApi";
import { CARRIER_PREFIXES } from "../components/warehouse/carriers/carrierConstants";
import type { DevScannerCatalogItem } from "../components/wms/dev-scanner/types";
import { basketSlotCode, type BasketDetail } from "../modules/carts/cartFleet/cartFleetTypes";
import type { DevScannerFavorite } from "../utils/devScannerStorage";
import { looksLikeCarrierBarcode, WMS_CARRIER_BARCODE_PREFIXES } from "../utils/carrierBarcode";
import { normalizeScanEan } from "../utils/wmsScanNormalize";

const TENANT_ID = 1;

type CartListItem = {
  id: number;
  name: string;
  code?: string | null;
  total_baskets?: number;
  cart_type?: "BULK" | "MULTI";
};

type CartDetailCache = {
  baskets: BasketDetail[];
  name: string;
  code: string;
};

function needleIncludes(hay: string, needle: string): boolean {
  if (!needle) return true;
  return hay.toLowerCase().includes(needle.toLowerCase());
}

function cartScanCode(c: CartListItem): string {
  return (c.code ?? c.name ?? "").trim();
}

function matchText(item: DevScannerCatalogItem, q: string): boolean {
  const n = q.trim();
  if (!n) return true;
  return (
    needleIncludes(item.name, n) ||
    needleIncludes(item.code, n) ||
    needleIncludes(item.sku ?? "", n) ||
    needleIncludes(item.ean ?? "", n) ||
    needleIncludes(item.subtitle ?? "", n) ||
    needleIncludes(item.relationLabel ?? "", n) ||
    needleIncludes(item.parentCartCode ?? "", n) ||
    needleIncludes(item.parentCartName ?? "", n)
  );
}

function productToItem(hit: WmsProductSearchHit): DevScannerCatalogItem {
  const ean = (hit.product_ean ?? "").trim() || null;
  const sku = (hit.product_sku ?? "").trim() || null;
  const code = ean || sku || String(hit.product_id);
  const loc = hit.locations[0];
  return {
    id: `prod-${hit.product_id}`,
    kind: "product",
    code,
    name: hit.product_name,
    subtitle: [sku ? `SKU: ${sku}` : null, ean ? `EAN: ${ean}` : null].filter(Boolean).join(" · "),
    meta:
      loc != null
        ? `${loc.location_code} · ${loc.quantity} szt.`
        : hit.total_quantity > 0
          ? `${hit.total_quantity} szt.`
          : undefined,
    imageUrl: hit.product_image_url,
    productId: hit.product_id,
    sku,
    ean,
  };
}

function locationToItem(loc: WarehouseLocationItem): DevScannerCatalogItem {
  const code = (loc.code ?? loc.name ?? "").trim();
  const zone = (loc.zone ?? "").trim();
  return {
    id: `loc-${loc.id}`,
    kind: "location",
    code,
    name: code,
    subtitle: zone ? `Strefa ${zone}` : loc.type ? String(loc.type) : undefined,
  };
}

function basketToItem(
  b: BasketDetail,
  cart: { id: number; name: string; code: string },
): DevScannerCatalogItem {
  const code = basketSlotCode(b);
  const name = (b.name && String(b.name).trim()) || code;
  return {
    id: `basket-${b.id}`,
    kind: "basket",
    code,
    name,
    subtitle: b.order_number ? `Zam. ${b.order_number}` : `R${b.row}/C${b.column}`,
    relationLabel: `Koszyk • ${cart.code || cart.name}`,
    parentCartCode: cart.code || cart.name,
    parentCartName: cart.name,
    cartId: cart.id,
  };
}

function carrierSuggestions(q: string, favorites: DevScannerFavorite[]): DevScannerCatalogItem[] {
  const raw = q.trim();
  if (!raw) {
    return favorites
      .filter((f) => f.kind === "carrier")
      .map((f) => ({
        id: `fav-carrier-${f.id}`,
        kind: "carrier" as const,
        code: f.code,
        name: f.label,
        subtitle: f.code,
      }));
  }
  const n = raw.toUpperCase();
  const out: DevScannerCatalogItem[] = [];
  const seen = new Set<string>();

  for (const fav of favorites) {
    if (fav.kind !== "carrier") continue;
    if (!needleIncludes(fav.code, n) && !needleIncludes(fav.label, n)) continue;
    const key = fav.code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `fav-carrier-${fav.id}`,
      kind: "carrier",
      code: fav.code,
      name: fav.label,
      subtitle: fav.code,
    });
  }

  for (const prefix of WMS_CARRIER_BARCODE_PREFIXES) {
    const p = prefix.toUpperCase();
    if (n.startsWith(p) || p.startsWith(n) || n.includes(p.replace("-", ""))) {
      const code = n.startsWith(p) ? n : `${p}${n.replace(/^PAL-?|^BOX-?|^BIN-?|^CRT-?|^MIX-?/i, "")}`;
      const key = code.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          id: `carrier-${key}`,
          kind: "carrier",
          code,
          name: code,
          subtitle: `Nośnik (${prefix.replace("-", "")})`,
        });
      }
    }
  }

  for (const p of CARRIER_PREFIXES) {
    const sample = `${p}-`;
    if (needleIncludes(sample, n) || needleIncludes(p, n)) {
      const code = n.includes("-") ? n : `${p}-`;
      const key = code.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          id: `carrier-pfx-${p}`,
          kind: "carrier",
          code,
          name: code,
          subtitle: "Prefiks nośnika",
        });
      }
    }
  }

  if (looksLikeCarrierBarcode(n)) {
    const key = normalizeScanEan(n).toUpperCase();
    if (!seen.has(key)) {
      out.push({
        id: `carrier-scan-${key}`,
        kind: "carrier",
        code: normalizeScanEan(n),
        name: normalizeScanEan(n),
        subtitle: "Nośnik / SSCC",
      });
    }
  }

  return out;
}

async function fetchCartGroups(cartType: "BULK" | "MULTI"): Promise<CartListItem[]> {
  const res = await api.get(`/carts/?tenant_id=${TENANT_ID}&cart_type=${cartType}`);
  const raw = res.data;
  if (!Array.isArray(raw)) return [];
  const items: CartListItem[] = [];
  for (const g of raw) {
    const group = g as { items?: unknown[] };
    if (!Array.isArray(group.items)) continue;
    for (const row of group.items) {
      const c = row as CartListItem;
      if (!c?.id) continue;
      items.push({
        id: Number(c.id),
        name: String(c.name ?? ""),
        code: c.code ?? null,
        total_baskets: typeof c.total_baskets === "number" ? c.total_baskets : undefined,
        cart_type: cartType,
      });
    }
  }
  return items;
}

export function useDevScannerCatalog(opts: {
  query: string;
  tenantId: number;
  warehouseId: number | null;
  favorites: DevScannerFavorite[];
  enabled: boolean;
}) {
  const { query, tenantId, warehouseId, favorites, enabled } = opts;
  const [locations, setLocations] = useState<WarehouseLocationItem[]>([]);
  const [carts, setCarts] = useState<CartListItem[]>([]);
  const [cartDetails, setCartDetails] = useState<Record<number, CartDetailCache>>({});
  const [productHits, setProductHits] = useState<WmsProductSearchHit[]>([]);
  const [orderHits, setOrderHits] = useState<DevScannerCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [basketsReady, setBasketsReady] = useState(false);
  const detailsLoadingRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!enabled || !warehouseId) {
      setLocations([]);
      return;
    }
    let cancelled = false;
    void getWarehouseLocations(warehouseId)
      .then((list) => {
        if (!cancelled) setLocations(list);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, warehouseId]);

  useEffect(() => {
    if (!enabled) {
      setCarts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchCartGroups("BULK"), fetchCartGroups("MULTI")])
      .then(([bulk, multi]) => {
        if (cancelled) return;
        setCarts([...bulk, ...multi]);
      })
      .catch(() => {
        if (!cancelled) setCarts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const cartsRef = useRef(carts);
  cartsRef.current = carts;
  const cartDetailsRef = useRef(cartDetails);
  cartDetailsRef.current = cartDetails;

  const ensureCartDetail = useCallback(async (cartId: number): Promise<CartDetailCache | null> => {
    const cached = cartDetailsRef.current[cartId];
    if (cached) return cached;
    if (detailsLoadingRef.current.has(cartId)) return null;
    detailsLoadingRef.current.add(cartId);
    try {
      const res = await api.get<{
        name?: string;
        code?: string | null;
        baskets?: BasketDetail[];
      }>(`/carts/${cartId}/`);
      const cartMeta = cartsRef.current.find((c) => c.id === cartId);
      const code = (res.data.code ?? cartMeta?.code ?? res.data.name ?? cartMeta?.name ?? "").trim();
      const name = (res.data.name ?? cartMeta?.name ?? code).trim();
      const entry: CartDetailCache = {
        baskets: Array.isArray(res.data.baskets) ? res.data.baskets : [],
        name,
        code: code || name,
      };
      setCartDetails((prev) => ({ ...prev, [cartId]: entry }));
      return entry;
    } catch {
      return null;
    } finally {
      detailsLoadingRef.current.delete(cartId);
    }
  }, []);

  /** Prefetch baskets for MULTI / carts that advertise baskets. */
  useEffect(() => {
    if (!enabled || carts.length === 0) return;
    let cancelled = false;
    const targets = carts.filter(
      (c) => c.cart_type === "MULTI" || (c.total_baskets != null && c.total_baskets > 0),
    );
    void (async () => {
      for (const c of targets) {
        if (cancelled) return;
        await ensureCartDetail(c.id);
      }
      if (!cancelled) setBasketsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, carts, ensureCartDetail]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!warehouseId || q.length < 2) {
      setProductHits([]);
      setLoadingProducts(false);
      return;
    }
    setLoadingProducts(true);
    debounceRef.current = setTimeout(() => {
      void searchWmsProducts(tenantId, warehouseId, q, 16)
        .then((list) => setProductHits(list))
        .catch(() => setProductHits([]))
        .finally(() => setLoadingProducts(false));
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, query, tenantId, warehouseId]);

  useEffect(() => {
    if (!enabled) return;
    const q = query.trim();
    if (q.length < 2) {
      setOrderHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void lookupOrdersForWms(q, tenantId, warehouseId)
        .then((hits) => {
          if (cancelled) return;
          setOrderHits(
            hits.slice(0, 12).map((h) => {
              const number = (h.number ?? "").trim();
              const barcode = (h.barcode ?? "").trim();
              const code = barcode || number || String(h.id);
              return {
                id: `order-${h.id}`,
                kind: "order" as const,
                code,
                name: number ? `Zam. ${number}` : `Zam. #${h.id}`,
                subtitle: [barcode ? `Kod: ${barcode}` : null, h.status ? String(h.status) : null]
                  .filter(Boolean)
                  .join(" · "),
              };
            }),
          );
        })
        .catch(() => {
          if (!cancelled) setOrderHits([]);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [enabled, query, tenantId, warehouseId]);

  const catalog = useMemo(() => {
    const items: DevScannerCatalogItem[] = [];

    for (const c of carts) {
      const scan = cartScanCode(c);
      if (!scan) continue;
      const detail = cartDetails[c.id];
      const basketCount = detail?.baskets.length ?? c.total_baskets ?? 0;
      const children =
        detail?.baskets.map((b) =>
          basketToItem(b, { id: c.id, name: detail.name || c.name, code: detail.code || scan }),
        ) ?? [];
      items.push({
        id: `cart-${c.id}`,
        kind: "cart",
        code: scan,
        name: c.name || scan,
        subtitle: c.cart_type === "MULTI" ? "Wózek z koszykami" : "Wózek",
        meta: basketCount > 0 ? `${basketCount} koszyk${basketCount === 1 ? "" : "ów"}` : undefined,
        relationLabel:
          basketCount > 0
            ? `Wózek • ${basketCount} koszyk${basketCount === 1 ? "" : "ów"}`
            : undefined,
        cartId: c.id,
        basketCount,
        cartType: c.cart_type,
        children,
      });
      for (const child of children) items.push(child);
    }

    for (const loc of locations) {
      const item = locationToItem(loc);
      if (item.code) items.push(item);
    }

    const seenProd = new Set<number>();
    for (const f of favorites) {
      if (f.kind !== "product") continue;
      if (f.productId != null) seenProd.add(f.productId);
      items.push({
        id: `fav-prod-${f.id}`,
        kind: "product",
        code: f.ean || f.code,
        name: f.label,
        subtitle: [f.sku ? `SKU: ${f.sku}` : null, f.ean ? `EAN: ${f.ean}` : null].filter(Boolean).join(" · "),
        imageUrl: f.imageUrl,
        productId: f.productId,
        sku: f.sku,
        ean: f.ean,
      });
    }
    for (const hit of productHits) {
      if (seenProd.has(hit.product_id)) continue;
      seenProd.add(hit.product_id);
      items.push(productToItem(hit));
    }

    items.push(...carrierSuggestions(query, favorites));
    items.push(...orderHits);

    for (const f of favorites) {
      if (f.kind === "product" || f.kind === "carrier") continue;
      if (items.some((i) => i.kind === f.kind && i.code.toUpperCase() === f.code.toUpperCase())) continue;
      items.push({
        id: `fav-${f.id}`,
        kind: f.kind,
        code: f.code,
        name: f.label,
        subtitle: f.code,
        relationLabel: f.relationLabel,
        parentCartCode: f.parentCartCode,
        parentCartName: f.parentCartName,
        cartId: f.cartId,
      });
    }

    return items;
  }, [carts, cartDetails, locations, favorites, productHits, orderHits, query]);

  const filtered = useMemo(() => catalog.filter((i) => matchText(i, query)), [catalog, query]);

  return {
    catalog: filtered,
    allCatalog: catalog,
    loading: loading || loadingProducts,
    loadingProducts,
    basketsReady,
    ensureCartDetail,
    matchText,
  };
}
