import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  listIncompleteReceivingProducts,
  resolveIncompleteProductScan,
  type WmsProductIncompleteRow,
} from "../../api/wmsProductApi";
import { ProductDataCompletionCard } from "../../components/wms/productData/ProductDataCompletionCard";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { WMS_ROUTES } from "./wmsRoutes";

const NO_LOCATION_GROUP = "Brak lokalizacji";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(n);
}

type LocationSection = {
  key: string;
  title: string;
  products: WmsProductIncompleteRow[];
};

function groupByLocation(items: WmsProductIncompleteRow[]): LocationSection[] {
  const withLoc = new Map<string, WmsProductIncompleteRow[]>();
  const noLoc: WmsProductIncompleteRow[] = [];

  for (const row of items) {
    if (!row.location_label) {
      noLoc.push(row);
      continue;
    }
    const key = row.location_zone || row.location_label;
    const list = withLoc.get(key) ?? [];
    list.push(row);
    withLoc.set(key, list);
  }

  const sections: LocationSection[] = [];
  for (const [key, products] of withLoc) {
    const title = products[0]?.location_label ?? key;
    sections.push({ key, title, products });
  }
  if (noLoc.length) {
    sections.push({ key: NO_LOCATION_GROUP, title: NO_LOCATION_GROUP, products: noLoc });
  }
  return sections;
}

export default function WmsProductDataCompletionPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const {
    registerScanHandler,
    showScannerError,
    showScannerToast,
    setScannerInputPlaceholder,
    setActiveDocument,
    refocusScannerInput,
  } = useWmsScanner();

  const [items, setItems] = useState<WmsProductIncompleteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [withoutLocation, setWithoutLocation] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await listIncompleteReceivingProducts(DAMAGE_TENANT_ID, {
        warehouseId,
        limit: 500,
      });
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === "number" ? data.total : data.items?.length ?? 0);
      setWithoutLocation(data.without_location_count ?? 0);
    } catch {
      setItems([]);
      setTotal(0);
      setWithoutLocation(0);
      setErr("Nie udało się wczytać listy produktów.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Uzupełnianie danych produktów" });
    setScannerInputPlaceholder("Skanuj EAN / SKU produktu");
    return () => setActiveDocument(null);
  }, [setActiveDocument, setScannerInputPlaceholder]);

  const sections = useMemo(() => groupByLocation(items), [items]);
  const remaining = items.length;

  const scrollToProduct = useCallback((productId: number, expand = true) => {
    if (expand) setExpandedId(productId);
    requestAnimationFrame(() => {
      const el = cardRefs.current[productId] ?? document.getElementById(`incomplete-product-${productId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const handleScan = useCallback(
    async (raw: string) => {
      if (warehouseId == null) return;
      const code = normalizeScanEan(raw);
      if (!code) return;

      const local = items.find((r) => {
        const ean = normalizeScanEan(r.ean ?? r.product_ean ?? "");
        const sku = normalizeScanEan(r.sku ?? r.product_sku ?? "");
        return code === ean || code === sku;
      });
      if (local) {
        scrollToProduct(local.product_id, true);
        showScannerToast(`Produkt: ${local.name || local.product_name}`);
        return;
      }

      try {
        const hit = await resolveIncompleteProductScan(DAMAGE_TENANT_ID, warehouseId, code);
        scrollToProduct(hit.product_id, true);
        showScannerToast(hit.location_label ? `Lokalizacja ${hit.location_label}` : "Znaleziono produkt");
      } catch {
        showScannerError("Produkt nie jest na liście uzupełniania danych");
      }
    },
    [warehouseId, items, scrollToProduct, showScannerToast, showScannerError],
  );

  useEffect(() => {
    return registerScanHandler((code) => {
      void handleScan(code);
    });
  }, [registerScanHandler, handleScan]);

  const handleCompleted = useCallback(
    (productId: number) => {
      setItems((prev) => {
        const removed = prev.find((r) => r.product_id === productId);
        if (removed && !removed.location_label) {
          setWithoutLocation((n) => Math.max(0, n - 1));
        }
        const next = prev.filter((r) => r.product_id !== productId);
        const nextId = next[0]?.product_id ?? null;
        setExpandedId(nextId);
        if (nextId != null) {
          window.setTimeout(() => scrollToProduct(nextId, true), 120);
        }
        return next;
      });
      setCompletedCount((c) => c + 1);
      setTotal((t) => Math.max(0, t - 1));
      refocusScannerInput();
    },
    [scrollToProduct, refocusScannerInput],
  );

  if (warehouseId == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <p className="text-slate-500 font-bold tracking-widest uppercase">Wybierz magazyn w nagłówku WMS.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50/50 font-sans text-slate-900 items-center p-4 sm:p-6 lg:p-8">
      
      <div className="w-full max-w-[1400px] flex flex-col flex-1 gap-8 animate-in fade-in duration-500">
        
        {/* HEADER */}
        <header className="flex flex-col gap-6">
          
          <div className="flex items-center gap-4">
            <Link
              to={WMS_ROUTES.productPreviewRoot}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-600 transition-all hover:bg-slate-50 hover:shadow-sm active:scale-95"
            >
              <ArrowLeft size={24} strokeWidth={2.5} />
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Uzupełnianie danych</h1>
            </div>
          </div>

          {/* KAFELKI STATYSTYK */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
            <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-indigo-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
              <span className="mb-1 text-[10px] sm:text-xs font-black uppercase tracking-widest text-indigo-500">Pozostało</span>
              <span className="text-3xl sm:text-4xl font-black tabular-nums text-[#5a4fcf]">{fmtQty(remaining)}</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-emerald-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
              <span className="mb-1 text-[10px] sm:text-xs font-black uppercase tracking-widest text-emerald-500">Ukończono</span>
              <span className="text-3xl sm:text-4xl font-black tabular-nums text-emerald-600">{fmtQty(completedCount)}</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-amber-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
              <span className="mb-1 text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-500">Bez lok.</span>
              <span className="text-3xl sm:text-4xl font-black tabular-nums text-amber-600">{fmtQty(withoutLocation)}</span>
            </div>
          </div>

        </header>

        {/* MAIN CONTENT */}
        <main className="flex-1 w-full pb-16">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 text-slate-400">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#5a4fcf] border-t-transparent mb-6" />
              <p className="font-black uppercase tracking-widest text-[11px]">Wczytywanie listy...</p>
            </div>
          ) : err ? (
            <div className="rounded-[2rem] border border-red-200 bg-red-50 p-8 text-center shadow-sm">
              <p className="text-base font-bold text-red-800">{err}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-in zoom-in-95 duration-300">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] border border-emerald-100 bg-emerald-50 text-emerald-500 shadow-sm">
                <CheckCircle2 size={40} strokeWidth={2.5} />
              </div>
              <h3 className="mb-3 text-2xl font-black text-slate-900">Wszystko gotowe</h3>
              <p className="text-sm font-bold text-slate-500 max-w-md">
                {completedCount > 0
                  ? "Wszystkie produkty z tej sesji zostały poprawnie uzupełnione."
                  : "W tej chwili nie ma żadnych produktów wymagających uzupełnienia danych."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-10">
              {sections.map((section) => (
                <section key={section.key} className="flex flex-col gap-4">
                  
                  {/* Nagłówek lokalizacji */}
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] border border-slate-200 bg-white text-slate-500 shadow-sm">
                      {section.key === NO_LOCATION_GROUP ? (
                        <AlertTriangle size={24} strokeWidth={2.5} />
                      ) : (
                        <MapPin size={24} strokeWidth={2.5} />
                      )}
                    </div>
                    <h2 className="text-lg sm:text-xl font-black uppercase tracking-wide text-slate-800">
                      {section.title}
                    </h2>
                    <span className="ml-auto rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 px-4 py-2 text-sm font-black shadow-sm">
                      {section.products.length} szt.
                    </span>
                  </div>
                  
                  {/* Lista produktów w danej lokalizacji */}
                  <div className="flex flex-col gap-4">
                    {section.products.map((row) => (
                      <div key={row.product_id} id={`incomplete-product-${row.product_id}`}>
                        <ProductDataCompletionCard
                          row={row}
                          tenantId={DAMAGE_TENANT_ID}
                          expanded={expandedId === row.product_id}
                          onToggleExpand={() =>
                            setExpandedId((id) => (id === row.product_id ? null : row.product_id))
                          }
                          onCompleted={handleCompleted}
                          cardRef={(el) => {
                            cardRefs.current[row.product_id] = el;
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  
                </section>
              ))}
            </div>
          )}
        </main>

      </div>
    </div>
  );
}