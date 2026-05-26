import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchWmsProducts, type WmsProductSearchHit } from "../api/wmsProductApi";
import { getWarehouseLocations, type WarehouseLocationItem } from "../api/warehouseGraphApi";
import { CARRIER_PREFIXES } from "../components/warehouse/carriers/carrierConstants";
import type { DevScannerFavorite } from "../utils/devScannerStorage";
import { classifyWmsScanCode } from "../utils/wmsScanClassify";
import { looksLikeCarrierBarcode, WMS_CARRIER_BARCODE_PREFIXES } from "../utils/carrierBarcode";
import { normalizeScanEan } from "../utils/wmsScanNormalize";

export type DevScannerSuggestionKind = "product" | "location" | "carrier";

export type DevScannerSuggestion = {
  id: string;
  kind: DevScannerSuggestionKind;
  code: string;
  title: string;
  subtitle?: string;
  meta?: string;
  imageUrl?: string | null;
  productId?: number;
};

function needleIncludes(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

function matchLocations(locations: WarehouseLocationItem[], q: string, limit: number): DevScannerSuggestion[] {
  const n = q.trim().toLowerCase();
  if (!n) return [];
  const out: DevScannerSuggestion[] = [];
  for (const loc of locations) {
    const code = (loc.code ?? loc.name ?? "").trim();
    if (!code) continue;
    const zone = (loc.zone ?? "").trim();
    if (!needleIncludes(code, n) && !needleIncludes(zone, n)) continue;
    out.push({
      id: `loc-${loc.id}`,
      kind: "location",
      code,
      title: code,
      subtitle: zone ? `Strefa ${zone}` : loc.type ? String(loc.type) : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function matchCarriers(q: string, favorites: DevScannerFavorite[], limit: number): DevScannerSuggestion[] {
  const raw = q.trim();
  if (!raw) return [];
  const n = raw.toUpperCase();
  const out: DevScannerSuggestion[] = [];
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
      title: fav.label,
      subtitle: fav.code,
    });
    if (out.length >= limit) return out;
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
          title: code,
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
          title: code,
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
        title: normalizeScanEan(n),
        subtitle: "Nośnik",
      });
    }
  }

  return out.slice(0, limit);
}

function productToSuggestion(hit: WmsProductSearchHit): DevScannerSuggestion {
  const code = (hit.product_ean || hit.product_sku || "").trim() || String(hit.product_id);
  const loc = hit.locations[0];
  const meta =
    loc != null
      ? `${loc.location_code} · ${loc.quantity} szt.`
      : hit.total_quantity > 0
        ? `${hit.total_quantity} szt.`
        : undefined;
  return {
    id: `prod-${hit.product_id}`,
    kind: "product",
    code,
    title: hit.product_name,
    subtitle: [
      hit.product_sku ? `SKU: ${hit.product_sku}` : null,
      hit.product_ean ? `EAN: ${hit.product_ean}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    meta,
    imageUrl: hit.product_image_url,
    productId: hit.product_id,
  };
}

function matchFavoriteProducts(favorites: DevScannerFavorite[], q: string, limit: number): DevScannerSuggestion[] {
  const n = q.trim();
  if (!n) return [];
  return favorites
    .filter((f) => f.kind === "product")
    .filter(
      (f) =>
        needleIncludes(f.code, n) ||
        needleIncludes(f.label, n) ||
        needleIncludes(f.sku ?? "", n) ||
        needleIncludes(f.ean ?? "", n),
    )
    .slice(0, limit)
    .map((f) => ({
      id: `fav-prod-${f.id}`,
      kind: "product" as const,
      code: f.ean || f.code,
      title: f.label,
      subtitle: [f.sku ? `SKU: ${f.sku}` : null, f.ean ? `EAN: ${f.ean}` : null].filter(Boolean).join(" · "),
      imageUrl: f.imageUrl,
      productId: f.productId,
    }));
}

export function useDevScannerSuggestions(opts: {
  query: string;
  tenantId: number;
  warehouseId: number | null;
  favorites: DevScannerFavorite[];
}) {
  const { query, tenantId, warehouseId, favorites } = opts;
  const [locations, setLocations] = useState<WarehouseLocationItem[]>([]);
  const [productHits, setProductHits] = useState<WmsProductSearchHit[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    if (!warehouseId) {
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
  }, [warehouseId]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!warehouseId || q.length < 2) {
      setProductHits([]);
      setLoadingProducts(false);
      return;
    }
    setLoadingProducts(true);
    debounceRef.current = setTimeout(() => {
      void searchWmsProducts(tenantId, warehouseId, q, 12)
        .then((list) => setProductHits(list))
        .catch(() => setProductHits([]))
        .finally(() => setLoadingProducts(false));
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tenantId, warehouseId]);

  const suggestions = useMemo(() => {
    const q = query.trim();
    if (!q) return [];

    const products: DevScannerSuggestion[] = [];
    const seenProduct = new Set<number>();

    for (const s of matchFavoriteProducts(favorites, q, 6)) {
      if (s.productId != null) seenProduct.add(s.productId);
      products.push(s);
    }
    for (const hit of productHits) {
      if (seenProduct.has(hit.product_id)) continue;
      seenProduct.add(hit.product_id);
      products.push(productToSuggestion(hit));
    }

    const locs = matchLocations(locations, q, 8);
    const carriers = matchCarriers(q, favorites, 6);

    return [...products, ...locs, ...carriers];
  }, [query, favorites, productHits, locations]);

  const classifyCode = useCallback((code: string) => classifyWmsScanCode(code), []);

  return { suggestions, loadingProducts, locations, classifyCode };
}
