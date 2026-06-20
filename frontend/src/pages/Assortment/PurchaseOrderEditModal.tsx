import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDeliveryItem,
  downloadSupplierOrderPdf,
  getDelivery,
  removeDeliveryItem,
  updateDelivery,
  deleteDelivery,
  patchDeliveryItem,
  type DeliveryItemRead,
  type DeliveryRead,
  type DeliveryStatus,
} from "../../api/inboundDeliveriesApi";
import type { SupplierRead } from "../../api/inboundSuppliersApi";
import { type ManufacturerRead } from "../../api/manufacturersApi";
import {
  listSupplierLinkedManufacturers,
  listSupplierProducts,
  listSupplierTopProducts,
  type SupplierCatalogPriceTier,
  type SupplierCatalogScope,
  type SupplierProductCatalogItem,
} from "../../api/supplierProductsApi";
import { fetchPurchasingSupplierAnalytics, type SupplierAnalyticsRow } from "../../api/purchasingSupplierAnalyticsApi";
import { supplierScoreTier } from "../../utils/supplierScoreBadge";

type Props = {
  open: boolean;
  tenantId: number;
  orderId: number;
  suppliers: SupplierRead[];
  onClose: () => void;
  onSaved: () => void;
};

function catalogRowKey(row: SupplierProductCatalogItem): string {
  return row.row_uid || `legacy-p:${row.product_id ?? 0}`;
}

function orderLineKeyFromCatalogRow(row: SupplierProductCatalogItem): string {
  if (row.catalog_kind === "product" && row.product_id != null) return `p:${row.product_id}`;
  if (row.wm_kind && row.wm_id) return `wm:${row.wm_kind}:${row.wm_id}`;
  return catalogRowKey(row);
}

function orderLineKeyFromItem(it: DeliveryItemRead): string {
  if (it.product_id != null && Number.isFinite(Number(it.product_id))) return `p:${it.product_id}`;
  if (it.wm_kind && it.wm_id) return `wm:${it.wm_kind}:${it.wm_id}`;
  return `item:${it.id}`;
}

type Tab = "basic" | "products";

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  draft: "Szkic",
  ordered: "Zamówione",
  in_transit: "W drodze",
  received: "Dostarczone",
  cancelled: "Anulowane",
};

function statusBadgeClass(s: DeliveryStatus): string {
  switch (s) {
    case "draft":
      return "bg-slate-100 text-slate-800 ring-1 ring-slate-200";
    case "ordered":
      return "bg-sky-100 text-sky-900 ring-1 ring-sky-200";
    case "in_transit":
      return "bg-amber-100 text-amber-950 ring-1 ring-amber-200";
    case "received":
      return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200";
    case "cancelled":
      return "bg-red-50 text-red-800 ring-1 ring-red-100";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

type LineDraft = { qty: string; price: string; gross: string };

function lineAmountsFromDraft(it: DeliveryItemRead, draft: LineDraft): { net: number; vat: number; gross: number } {
  const vatPct = it.vat_rate ?? 23;
  const qn = Number(draft.qty.replace(",", "."));
  const pr = draft.price.trim();
  const pp = pr === "" ? null : Number(pr.replace(",", "."));
  const gr = draft.gross.trim();
  const unitGross = gr === "" ? null : Number(gr.replace(",", "."));
  let unitNet: number | null = null;
  if (unitGross != null && Number.isFinite(unitGross) && unitGross >= 0) {
    unitNet = roundMoney2(unitGross / (1 + vatPct / 100));
  } else if (pp != null && Number.isFinite(pp)) {
    unitNet = pp;
  }
  if (!Number.isFinite(qn) || qn <= 0 || unitNet == null) {
    return {
      net: it.line_total_net ?? it.line_total_value,
      vat: it.line_vat_amount ?? 0,
      gross: it.line_total_gross ?? it.line_total_value,
    };
  }
  const net = roundMoney2(qn * unitNet);
  const vatAmt = roundMoney2(net * (vatPct / 100));
  const gross = roundMoney2(net + vatAmt);
  return { net, vat: vatAmt, gross };
}

function unitGrossFromNet(net: number | null | undefined, vatPct: number): string {
  if (net == null || !Number.isFinite(net)) return "";
  return String(roundMoney2(net * (1 + vatPct / 100)));
}

function draftFromItem(it: DeliveryItemRead): LineDraft {
  const vat = it.vat_rate ?? 23;
  const pn = it.purchase_price;
  return {
    qty: String(it.quantity_ordered),
    price: pn != null ? String(pn) : "",
    gross: unitGrossFromNet(pn != null ? Number(pn) : null, vat),
  };
}

/** Inline "add to order" row in supplier catalog — local-only until "Dodaj" posts to API. */
type InlineCatalogDraft = { qty: string; net: string; gross: string; disc: string; priceTouched: boolean };

function defaultInlineDraft(row: SupplierProductCatalogItem): InlineCatalogDraft {
  const vat = row.vat_rate ?? 23;
  const q1 = 1;
  const tier1 = pickUnitNetFromTiers(q1, row.price_tiers);
  const listN = tier1 ?? row.purchase_price;
  if (listN != null && Number.isFinite(listN)) {
    return {
      qty: "1",
      net: String(roundMoney2(listN)),
      gross: unitGrossFromNet(listN, vat),
      disc: "0",
      priceTouched: false,
    };
  }
  return { qty: "1", net: "", gross: "", disc: "0", priceTouched: false };
}

function parseDec(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Rabat % do pola (0–100); nigdy ujemny — powyżej katalogu → 0. */
function discountInputFromListAndUnitNet(listNet: number | null | undefined, unitNet: number | null): string {
  if (listNet == null || unitNet == null || !Number.isFinite(listNet) || listNet < 1e-9) return "0";
  if (!Number.isFinite(unitNet)) return "0";
  if (unitNet >= listNet - 1e-9) return "0";
  const d = roundMoney2(100 * (1 - unitNet / listNet));
  return String(Math.max(0, Math.min(100, d)));
}

function formatPriceVsCatalog(listNet: number | null, unitNet: number | null): string | null {
  if (listNet == null || unitNet == null || !Number.isFinite(listNet) || listNet < 1e-9 || !Number.isFinite(unitNet)) {
    return null;
  }
  if (unitNet < listNet - 1e-9) {
    const disc = roundMoney2(100 * (1 - unitNet / listNet));
    return `Rabat ${disc.toFixed(1)}%`;
  }
  if (unitNet > listNet + 1e-9) {
    const above = roundMoney2(100 * ((unitNet - listNet) / listNet));
    return `Powyżej katalogu +${above.toFixed(1)}%`;
  }
  return "Zgodnie z katalogiem";
}

/** Highest tier with qty_from ≤ qty (aligned with server ``pick_unit_net_from_steps``). */
function pickUnitNetFromTiers(qty: number, tiers: SupplierCatalogPriceTier[] | undefined | null): number | null {
  if (!tiers?.length || !Number.isFinite(qty) || qty <= 0) return null;
  const sorted = [...tiers].sort((a, b) => a.qty_from - b.qty_from);
  let best: number | null = null;
  for (const t of sorted) {
    if (t.qty_from <= qty + 1e-9 && Number.isFinite(t.unit_net) && t.unit_net >= 0) best = t.unit_net;
  }
  return best != null ? roundMoney2(best) : null;
}

function tierPricingHint(qty: number, tiers: SupplierCatalogPriceTier[] | undefined | null): string | null {
  const tiersArr = tiers ?? [];
  if (!tiersArr.length || !Number.isFinite(qty) || qty <= 0) return null;
  const sorted = [...tiersArr].sort((a, b) => a.qty_from - b.qty_from);
  let bestQf: number | null = null;
  for (const t of sorted) {
    if (t.qty_from <= qty + 1e-9) bestQf = t.qty_from;
  }
  if (bestQf == null) return null;
  if (bestQf <= 1 + 1e-9) return "Cena bazowa";
  const disp = Math.abs(bestQf - Math.round(bestQf)) < 1e-6 ? Math.round(bestQf) : bestQf;
  return `Próg cenowy: od ${disp} szt.`;
}

export function PurchaseOrderEditModal({ open, tenantId, orderId, suppliers, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>("basic");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [order, setOrder] = useState<DeliveryRead | null>(null);
  const [savingHeader, setSavingHeader] = useState(false);
  const [busyItem, setBusyItem] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const [supplierId, setSupplierId] = useState<number>(0);
  const [orderName, setOrderName] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");

  const [productSearch, setProductSearch] = useState("");
  const [catalogScope, setCatalogScope] = useState<SupplierCatalogScope>("all");
  const [inlineCatalogDrafts, setInlineCatalogDrafts] = useState<Record<string, InlineCatalogDraft>>({});
  const [addFlashCatalogKey, setAddFlashCatalogKey] = useState<string | null>(null);
  const addFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [supplierCatalog, setSupplierCatalog] = useState<SupplierProductCatalogItem[]>([]);
  const [topProducts, setTopProducts] = useState<SupplierProductCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [hideAlreadyAdded, setHideAlreadyAdded] = useState(true);
  const [manufacturersCatalog, setManufacturersCatalog] = useState<ManufacturerRead[]>([]);
  const [manufacturerFilterId, setManufacturerFilterId] = useState(0);

  const [lineDrafts, setLineDrafts] = useState<Record<number, LineDraft>>({});
  const [supplierInsight, setSupplierInsight] = useState<SupplierAnalyticsRow | null>(null);
  const [insightCatalog, setInsightCatalog] = useState<SupplierProductCatalogItem[]>([]);

  const fieldLabel = "mb-1 block text-sm font-medium text-slate-700";
  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-violet-400 focus:ring-2 focus:ring-violet-500";
  const inputTableClass =
    "w-full min-w-[4rem] rounded border border-slate-200 px-2 py-1 text-right text-sm tabular-nums focus:border-violet-400 focus:ring-1 focus:ring-violet-500";

  const reload = useCallback(async () => {
    const d = await getDelivery(tenantId, orderId);
    setOrder(d);
    setSupplierId(d.supplier_id);
    setOrderName((d.name ?? "").trim());
    setExpectedDate(d.expected_date ? d.expected_date.slice(0, 16) : "");
    setNotes(d.notes ?? "");
    return d;
  }, [tenantId, orderId]);

  useEffect(() => {
    if (!open) return;
    setTab("basic");
    setLoadErr(null);
    setProductSearch("");
    setCatalogScope("all");
    setInlineCatalogDrafts({});
    setAddFlashCatalogKey(null);
    setSupplierCatalog([]);
    setTopProducts([]);
    setHideAlreadyAdded(true);
    setManufacturerFilterId(0);
    let cancelled = false;
    void (async () => {
      try {
        await reload();
      } catch {
        if (!cancelled) setLoadErr("Nie udało się wczytać zamówienia.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, reload]);

  useEffect(() => {
    if (!open) return;
    if (supplierId >= 1) {
      void listSupplierLinkedManufacturers(tenantId, supplierId)
        .then((rows) =>
          setManufacturersCatalog(
            rows.map((r) => ({
              id: r.id,
              tenant_id: tenantId,
              name: r.name,
              active: r.active,
              product_count: 0,
            })),
          ),
        )
        .catch(() => setManufacturersCatalog([]));
    } else {
      setManufacturersCatalog([]);
    }
  }, [open, tenantId, supplierId]);

  useEffect(() => {
    setManufacturerFilterId(0);
  }, [supplierId]);

  useEffect(() => {
    if (manufacturerFilterId < 1) return;
    if (!manufacturersCatalog.some((m) => m.id === manufacturerFilterId)) setManufacturerFilterId(0);
  }, [manufacturersCatalog, manufacturerFilterId]);

  useEffect(() => {
    if (!order) {
      setLineDrafts({});
      return;
    }
    setLineDrafts(Object.fromEntries(order.items.map((it) => [it.id, draftFromItem(it)])));
  }, [order]);

  useEffect(() => {
    if (!open || supplierId < 1) {
      setSupplierInsight(null);
      setInsightCatalog([]);
      return;
    }
    let cancelled = false;
    void listSupplierProducts(tenantId, supplierId, { catalog_scope: "all" })
      .then((rows) => {
        if (!cancelled) setInsightCatalog(rows);
      })
      .catch(() => {
        if (!cancelled) setInsightCatalog([]);
      });
    void fetchPurchasingSupplierAnalytics({ tenantId, supplierId, rangeDays: 90 })
      .then((p) => {
        if (cancelled) return;
        const row = (p.rows ?? []).find((r) => r.supplier_id === supplierId);
        setSupplierInsight(row ?? null);
      })
      .catch(() => {
        if (!cancelled) setSupplierInsight(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, supplierId]);

  useEffect(() => {
    if (!open || tab !== "products" || supplierId < 1) {
      setSupplierCatalog([]);
      setTopProducts([]);
      setCatalogLoading(false);
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    const mid = manufacturerFilterId >= 1 ? manufacturerFilterId : undefined;
    const loadTop = catalogScope === "products" || catalogScope === "all";
    void Promise.all([
      listSupplierProducts(tenantId, supplierId, { manufacturer_id: mid, catalog_scope: catalogScope }),
      loadTop
        ? listSupplierTopProducts(tenantId, supplierId, { manufacturer_id: mid })
        : Promise.resolve([] as SupplierProductCatalogItem[]),
    ])
      .then(([rows, tops]) => {
        if (!cancelled) {
          setSupplierCatalog(rows);
          setTopProducts(tops);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSupplierCatalog([]);
          setTopProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, tenantId, supplierId, manufacturerFilterId, catalogScope]);

  useEffect(() => {
    setInlineCatalogDrafts({});
  }, [supplierId, manufacturerFilterId, catalogScope]);

  const filteredCatalog = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return supplierCatalog;
    return supplierCatalog.filter((r) => {
      const name = (r.name || "").toLowerCase();
      const sku = (r.sku || "").toLowerCase();
      const ean = (r.ean || "").toLowerCase();
      return name.includes(q) || sku.includes(q) || ean.includes(q);
    });
  }, [supplierCatalog, productSearch]);

  const orderedLineKeys = useMemo(() => {
    if (!order?.items.length) return new Set<string>();
    return new Set(order.items.map(orderLineKeyFromItem));
  }, [order]);

  const topRowKeySet = useMemo(() => new Set(topProducts.map((r) => catalogRowKey(r))), [topProducts]);

  const mainSelectableCatalog = useMemo(() => {
    const base = filteredCatalog.filter((r) => !topRowKeySet.has(catalogRowKey(r)));
    if (!hideAlreadyAdded) return base;
    return base.filter((r) => !orderedLineKeys.has(orderLineKeyFromCatalogRow(r)));
  }, [filteredCatalog, topRowKeySet, hideAlreadyAdded, orderedLineKeys]);

  const visibleTopProducts = useMemo(() => {
    if (topProducts.length === 0) return [];
    if (!hideAlreadyAdded) return topProducts;
    return topProducts.filter((r) => !orderedLineKeys.has(orderLineKeyFromCatalogRow(r)));
  }, [topProducts, hideAlreadyAdded, orderedLineKeys]);

  const catalogRowQtyInOrder = useCallback(
    (row: SupplierProductCatalogItem) => {
      const k = orderLineKeyFromCatalogRow(row);
      if (!order?.items.length) return 0;
      return order.items
        .filter((it) => orderLineKeyFromItem(it) === k)
        .reduce((sum, it) => sum + Number(it.quantity_ordered || 0), 0);
    },
    [order],
  );

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId),
    [suppliers, supplierId],
  );

  const catalogByLineKey = useMemo(() => {
    const m = new Map<string, SupplierProductCatalogItem>();
    for (const r of [...insightCatalog, ...supplierCatalog, ...topProducts]) {
      m.set(orderLineKeyFromCatalogRow(r), r);
    }
    return m;
  }, [insightCatalog, supplierCatalog, topProducts]);

  const savingsVsCatalog = useMemo(() => {
    if (!order) return 0;
    let s = 0;
    for (const it of order.items) {
      const cat = catalogByLineKey.get(orderLineKeyFromItem(it));
      const listNet =
        it.catalog_compare_unit_net != null && Number.isFinite(Number(it.catalog_compare_unit_net))
          ? Number(it.catalog_compare_unit_net)
          : cat?.purchase_price != null && Number.isFinite(Number(cat.purchase_price))
            ? Number(cat.purchase_price)
            : null;
      const lineNet = it.purchase_price;
      if (listNet == null || lineNet == null || !Number.isFinite(listNet) || !Number.isFinite(lineNet)) continue;
      if (listNet > lineNet + 1e-9) {
        s += (listNet - lineNet) * Number(it.quantity_ordered);
      }
    }
    return roundMoney2(s);
  }, [order, catalogByLineKey]);

  const minOrderValue = selectedSupplier?.minimum_order_value;
  const supplierRequiresMoq = selectedSupplier?.requires_moq !== false;
  const orderNetTotal = order != null ? (order.total_net ?? order.total_value) : 0;
  const orderVatTotal = order != null ? (order.total_vat ?? 0) : 0;
  const orderGrossTotal = order != null ? (order.total_gross ?? roundMoney2(orderNetTotal + orderVatTotal)) : 0;
  const belowMinimum =
    supplierRequiresMoq &&
    minOrderValue != null &&
    Number.isFinite(minOrderValue) &&
    minOrderValue > 0 &&
    order != null &&
    orderNetTotal < minOrderValue;

  const fmtMoney = (n: number) =>
    n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDt = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  const headerPayload = useMemo(
    () => ({
      supplier_id: supplierId,
      name: orderName.trim() || null,
      expected_date: expectedDate ? new Date(expectedDate).toISOString() : null,
      notes: notes.trim() || null,
    }),
    [supplierId, orderName, expectedDate, notes],
  );

  const saveHeaderData = async () => {
    setSavingHeader(true);
    try {
      await updateDelivery(tenantId, orderId, headerPayload);
      await reload();
      onSaved();
    } catch {
      /* */
    } finally {
      setSavingHeader(false);
    }
  };

  const setOrderStatus = async (next: DeliveryStatus) => {
    setSavingHeader(true);
    try {
      await updateDelivery(tenantId, orderId, { ...headerPayload, status: next });
      await reload();
      onSaved();
    } catch {
      /* */
    } finally {
      setSavingHeader(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!order || order.status !== "draft") return;
    if (order.items.length === 0) {
      window.alert("Dodaj co najmniej jedną pozycję, zanim złożysz zamówienie u dostawcy.");
      return;
    }
    if (belowMinimum) {
      const ok = window.confirm(
        `Suma netto (${fmtMoney(orderNetTotal)} zł) jest poniżej minimum u tego dostawcy (${fmtMoney(minOrderValue!)} zł). Czy na pewno kontynuować?`,
      );
      if (!ok) return;
    }
    await setOrderStatus("ordered");
  };

  const handleMarkDelivered = async () => {
    if (!order || (order.status !== "ordered" && order.status !== "in_transit")) return;
    if (!window.confirm("Oznaczyć to zamówienie jako dostarczone (zamknięcie u dostawcy, bez magazynu)?")) return;
    await setOrderStatus("received");
  };

  const handleSetInTransit = async () => {
    if (!order || order.status !== "ordered") return;
    await setOrderStatus("in_transit");
  };

  const handleCancelOrder = async () => {
    if (!order || order.status === "received" || order.status === "cancelled" || order.status === "draft") return;
    if (!window.confirm("Anulować to zamówienie?")) return;
    await setOrderStatus("cancelled");
  };

  const handleDeleteDraft = async () => {
    if (order?.status !== "draft") return;
    if (!window.confirm("Usunąć szkic zamówienia?")) return;
    try {
      await deleteDelivery(tenantId, orderId);
      onSaved();
      onClose();
    } catch {
      /* */
    }
  };

  const addLineForCatalogRow = async (row: SupplierProductCatalogItem) => {
    const rk = catalogRowKey(row);
    const draft = inlineCatalogDrafts[rk] ?? defaultInlineDraft(row);
    const qn = parseDec(draft.qty);
    const vatR = row.vat_rate ?? 23;
    const listNet = pickUnitNetFromTiers(1, row.price_tiers) ?? row.purchase_price;
    const manual = draft.priceTouched;
    let unitNet = parseDec(draft.net);
    const unitGrossIn = parseDec(draft.gross);
    if (unitNet == null && unitGrossIn != null && Number.isFinite(unitGrossIn) && unitGrossIn >= 0) {
      unitNet = roundMoney2(unitGrossIn / (1 + vatR / 100));
    }
    if (manual) {
      if (listNet == null && (unitNet == null || !Number.isFinite(unitNet)) && unitGrossIn == null) {
        window.alert("Uzupełnij cenę netto lub brutto (brak ceny w ofercie).");
        return;
      }
      if (unitNet == null && listNet != null) {
        const d0 = parseDec(draft.disc) ?? 0;
        unitNet = roundMoney2(listNet * (1 - Math.max(0, d0) / 100));
      }
    }
    if (qn == null || !Number.isFinite(qn) || qn <= 0) {
      window.alert("Ilość musi być > 0.");
      return;
    }
    if (manual && (unitNet == null || !Number.isFinite(unitNet) || unitNet < 0)) {
      window.alert("Cena zakupu (netto) jest nieprawidłowa.");
      return;
    }
    setBusyItem(true);
    try {
      if (row.catalog_kind === "product" && row.product_id != null) {
        await addDeliveryItem(
          tenantId,
          orderId,
          manual
            ? {
                product_id: row.product_id,
                quantity_ordered: qn,
                purchase_price: unitNet!,
                purchase_price_manual: true,
              }
            : {
                product_id: row.product_id,
                quantity_ordered: qn,
                purchase_price_manual: false,
              },
        );
      } else if (row.wm_kind && row.wm_id) {
        await addDeliveryItem(
          tenantId,
          orderId,
          manual
            ? {
                wm_kind: row.wm_kind,
                wm_id: row.wm_id,
                quantity_ordered: qn,
                purchase_price: unitNet!,
                purchase_price_manual: true,
              }
            : {
                wm_kind: row.wm_kind,
                wm_id: row.wm_id,
                quantity_ordered: qn,
                purchase_price_manual: false,
              },
        );
      } else {
        window.alert("Nieprawidłowy wiersz oferty.");
        return;
      }
      if (addFlashTimerRef.current) {
        clearTimeout(addFlashTimerRef.current);
        addFlashTimerRef.current = null;
      }
      setAddFlashCatalogKey(rk);
      addFlashTimerRef.current = setTimeout(() => {
        setAddFlashCatalogKey(null);
        addFlashTimerRef.current = null;
      }, 1600);
      await reload();
      onSaved();
      setInlineCatalogDrafts((prev) => {
        const next = { ...prev, [rk]: defaultInlineDraft(row) };
        return next;
      });
    } catch (e: unknown) {
      const d =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      window.alert(d != null ? String(d) : "Nie udało się dodać pozycji.");
    } finally {
      setBusyItem(false);
    }
  };

  const commitLinePatch = async (itemId: number) => {
    if (!order) return;
    const it = order.items.find((i) => i.id === itemId);
    const draft = lineDrafts[itemId];
    if (!it || !draft) return;
    const q = Number(draft.qty.replace(",", "."));
    const vatPct = it.vat_rate ?? 23;
    const gr = draft.gross.trim();
    const unitGross = gr === "" ? null : Number(gr.replace(",", "."));
    let pp: number | null = null;
    if (unitGross != null && Number.isFinite(unitGross) && unitGross >= 0) {
      pp = roundMoney2(unitGross / (1 + vatPct / 100));
    } else {
      const pr = draft.price.trim();
      pp = pr === "" ? null : Number(pr.replace(",", "."));
    }
    if (!Number.isFinite(q) || q <= 0) {
      window.alert("Ilość musi być > 0.");
      setLineDrafts((prev) => ({ ...prev, [itemId]: draftFromItem(it) }));
      return;
    }
    if (pp != null && (!Number.isFinite(pp) || pp < 0)) {
      window.alert("Cena zakupu nieprawidłowa.");
      setLineDrafts((prev) => ({ ...prev, [itemId]: draftFromItem(it) }));
      return;
    }
    const sameQty = Math.abs(q - Number(it.quantity_ordered)) < 1e-9;
    const samePrice =
      (pp == null && it.purchase_price == null) ||
      (pp != null && it.purchase_price != null && Math.abs(pp - it.purchase_price) < 1e-9);
    if (sameQty && samePrice) return;

    setBusyItem(true);
    try {
      await patchDeliveryItem(tenantId, orderId, itemId, {
        quantity_ordered: q,
        purchase_price: pp,
      });
      await reload();
      onSaved();
    } catch (e: unknown) {
      const d =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      window.alert(d != null ? String(d) : "Nie udało się zapisać pozycji.");
      setLineDrafts((prev) => ({ ...prev, [itemId]: draftFromItem(it) }));
    } finally {
      setBusyItem(false);
    }
  };

  const restoreLineCatalogPrice = async (itemId: number) => {
    setBusyItem(true);
    try {
      await patchDeliveryItem(tenantId, orderId, itemId, { restore_catalog_price: true });
      await reload();
      onSaved();
    } catch (e: unknown) {
      const d =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      window.alert(d != null ? String(d) : "Nie udało się przywrócić ceny z cennika.");
    } finally {
      setBusyItem(false);
    }
  };

  const removeLine = async (itemId: number) => {
    if (!window.confirm("Usunąć pozycję?")) return;
    setBusyItem(true);
    try {
      await removeDeliveryItem(tenantId, orderId, itemId);
      await reload();
      onSaved();
    } catch {
      /* */
    } finally {
      setBusyItem(false);
    }
  };

  const patchInlineCatalogDraft = useCallback(
    (row: SupplierProductCatalogItem, field: "qty" | "net" | "gross" | "disc", value: string) => {
      const vatR = row.vat_rate ?? 23;
      const listBase = pickUnitNetFromTiers(1, row.price_tiers) ?? row.purchase_price;
      const rk = catalogRowKey(row);
      setInlineCatalogDrafts((prev) => {
        const cur = prev[rk] ?? defaultInlineDraft(row);
        if (field === "qty") {
          const qn = parseDec(value) ?? 0;
          let next: InlineCatalogDraft = { ...cur, qty: value };
          if (!cur.priceTouched) {
            const tn = pickUnitNetFromTiers(qn, row.price_tiers) ?? row.purchase_price;
            if (tn != null && Number.isFinite(tn)) {
              next = {
                ...next,
                net: String(roundMoney2(tn)),
                gross: unitGrossFromNet(tn, vatR),
                disc: "0",
              };
            }
          }
          return { ...prev, [rk]: next };
        }
        if (field === "disc") {
          const d = Math.max(0, parseDec(value) ?? 0);
          if (listBase != null && Number.isFinite(listBase) && listBase > 0) {
            const n = roundMoney2(listBase * (1 - Math.min(100, d) / 100));
            return {
              ...prev,
              [rk]: { ...cur, disc: value, net: String(n), gross: unitGrossFromNet(n, vatR), priceTouched: true },
            };
          }
          return { ...prev, [rk]: { ...cur, disc: value, priceTouched: true } };
        }
        if (field === "net") {
          const n = parseDec(value);
          const g = n != null && Number.isFinite(n) ? unitGrossFromNet(n, vatR) : "";
          return {
            ...prev,
            [rk]: {
              ...cur,
              net: value,
              gross: g,
              disc: discountInputFromListAndUnitNet(listBase, n),
              priceTouched: true,
            },
          };
        }
        if (field === "gross") {
          const g0 = parseDec(value);
          const n =
            g0 != null && Number.isFinite(g0) && g0 >= 0 ? roundMoney2(g0 / (1 + vatR / 100)) : null;
          return {
            ...prev,
            [rk]: {
              ...cur,
              gross: value,
              net: n != null ? String(n) : cur.net,
              disc: n != null ? discountInputFromListAndUnitNet(listBase, n) : cur.disc,
              priceTouched: true,
            },
          };
        }
        return prev;
      });
    },
    [],
  );

  if (!open) return null;

  const tabCls = (t: Tab) =>
    `border-b-2 px-2 pb-2 text-sm font-medium ${
      tab === t ? "border-violet-600 text-violet-800" : "border-transparent text-slate-500 hover:text-slate-800"
    }`;

  const st = order?.status;
  const linesLocked = st === "received" || st === "cancelled";

  const scoreTier = supplierScoreTier(supplierInsight?.score ?? null);

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/50 p-3 sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[min(92vh,calc(100dvh-1.5rem))] w-[min(96vw,1700px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 bg-slate-50/90 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Zamówienie towaru</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-xl font-bold text-slate-900">
                {order?.name?.trim() ? order.name.trim() : `#${orderId}`}
              </h2>
              {order?.name?.trim() ? (
                <span className="font-mono text-sm font-semibold text-slate-500">#{orderId}</span>
              ) : null}
            </div>
            {order ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
                <span className="font-semibold">{order.supplier_name}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(order.status)}`}
                >
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
                <span className="text-slate-400">·</span>
                <span className="tabular-nums text-slate-600">Utworzono {formatDt(order.created_at)}</span>
              </div>
            ) : null}
            {order ? (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
                <span>
                  <span className="text-slate-500">Netto</span>{" "}
                  <span className="font-semibold text-slate-900">{fmtMoney(orderNetTotal)} zł</span>
                </span>
                <span>
                  <span className="text-slate-500">VAT</span>{" "}
                  <span className="font-semibold text-slate-900">{fmtMoney(orderVatTotal)} zł</span>
                </span>
                <span>
                  <span className="text-slate-500">Brutto</span>{" "}
                  <span className="font-semibold text-slate-900">{fmtMoney(orderGrossTotal)} zł</span>
                </span>
                <span>
                  <span className="text-slate-500">Oszczędność vs katalog</span>{" "}
                  <span className="font-semibold text-emerald-800">
                    {savingsVsCatalog > 0 ? `${fmtMoney(savingsVsCatalog)} zł` : "—"}
                  </span>
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:max-w-sm sm:items-end">
            {order && supplierInsight ? (
              <div className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm sm:min-w-[220px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dostawca</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-500">Punktacja</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreTier.badgeClass}`}
                      title={
                        supplierInsight.score != null
                          ? `Punktacja dostawcy: ${supplierInsight.score}`
                          : "Brak danych punktacji"
                      }
                    >
                      {scoreTier.label}
                    </span>
                  </div>
                </div>
                <dl className="mt-2 space-y-1 text-xs text-slate-700">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Suma zakupów</dt>
                    <dd className="font-medium tabular-nums">{fmtMoney(supplierInsight.total_value)} zł</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Liczba zam.</dt>
                    <dd className="font-medium tabular-nums">{supplierInsight.total_orders}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Śr. realizacja</dt>
                    <dd className="font-medium tabular-nums">
                      {supplierInsight.avg_lead_time_days != null
                        ? `${supplierInsight.avg_lead_time_days.toFixed(0)} d`
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Ostatnie zam.</dt>
                    <dd className="max-w-[10rem] truncate text-right font-medium">
                      {supplierInsight.last_delivery_date
                        ? new Date(supplierInsight.last_delivery_date).toLocaleDateString("pl-PL")
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : order ? (
              <p className="text-xs text-slate-500">Brak danych punktacji dla tego dostawcy.</p>
            ) : null}
            {order ? (
              <button
                type="button"
                disabled={pdfBusy}
                onClick={() => {
                  setPdfBusy(true);
                  void downloadSupplierOrderPdf(tenantId, orderId)
                    .catch(() =>
                      window.alert(
                        "Nie udało się pobrać PDF. Sprawdź, czy backend ma zainstalowany silnik PDF (Node w backend/scripts/structure_report_pdf).",
                      ),
                    )
                    .finally(() => setPdfBusy(false));
                }}
                className="w-full shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
              >
                {pdfBusy ? "PDF…" : "Pobierz PDF"}
              </button>
            ) : null}
          </div>
        </div>
        {loadErr ? <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-800">{loadErr}</div> : null}

        <div className="flex gap-4 border-b border-slate-100 px-5 pt-2">
          <button type="button" className={tabCls("basic")} onClick={() => setTab("basic")}>
            Podstawowe
          </button>
          <button type="button" className={tabCls("products")} onClick={() => setTab("products")}>
            Produkty
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === "basic" && order && (
            <div className="space-y-4">
              <div>
                <label className={fieldLabel}>Nazwa zamówienia</label>
                <input
                  type="text"
                  className={inputClass}
                  value={orderName}
                  onChange={(e) => setOrderName(e.target.value)}
                  placeholder="np. Dostawa Adidas 06.04"
                  maxLength={512}
                />
              </div>
              <div>
                <label className={fieldLabel}>Dostawca</label>
                <select
                  className={inputClass}
                  value={supplierId || ""}
                  onChange={(e) => setSupplierId(Number(e.target.value))}
                  disabled={linesLocked}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {!s.active ? " (nieaktywny)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Oczekiwana data</label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  disabled={linesLocked}
                />
              </div>
              <div>
                <label className={fieldLabel}>Notatki</label>
                <textarea className={`${inputClass} min-h-[80px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {belowMinimum ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <span className="font-medium">Poniżej minimum zamówienia u dostawcy.</span> Wartość netto: {fmtMoney(orderNetTotal)} zł,
                  minimum: {fmtMoney(minOrderValue!)} zł. Przy składaniu zamówienia pojawi się potwierdzenie.
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={savingHeader}
                  onClick={() => void saveHeaderData()}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {savingHeader ? "Zapisywanie…" : "Zapisz dane"}
                </button>

                {order.status === "draft" ? (
                  <button
                    type="button"
                    disabled={savingHeader}
                    onClick={() => void handlePlaceOrder()}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    Zamów u dostawcy
                  </button>
                ) : null}

                {order.status === "ordered" || order.status === "in_transit" ? (
                  <button
                    type="button"
                    disabled={savingHeader}
                    onClick={() => void handleMarkDelivered()}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Oznacz jako dostarczone
                  </button>
                ) : null}

                {order.status === "ordered" ? (
                  <button
                    type="button"
                    disabled={savingHeader}
                    onClick={() => void handleSetInTransit()}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                  >
                    W drodze
                  </button>
                ) : null}

                {order.status === "draft" ? (
                  <button
                    type="button"
                    onClick={() => void handleDeleteDraft()}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Usuń szkic
                  </button>
                ) : null}

                {order.status === "ordered" || order.status === "in_transit" ? (
                  <button
                    type="button"
                    disabled={savingHeader}
                    onClick={() => void handleCancelOrder()}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Anuluj zamówienie
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {tab === "products" && order && (
            <div className="space-y-4">
              {belowMinimum ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Wartość netto {fmtMoney(orderNetTotal)} zł jest poniżej minimum {fmtMoney(minOrderValue!)} zł u tego dostawcy.
                </div>
              ) : null}

              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dodaj pozycję</p>
                
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-600">Producent (opcjonalnie)</span>
                    <select
                      className={inputClass}
                      value={manufacturerFilterId || ""}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setManufacturerFilterId(Number.isFinite(v) && v >= 1 ? v : 0);
                        setProductSearch("");
                      }}
                      disabled={linesLocked || supplierId < 1}
                    >
                      <option value="">Wszyscy producenci</option>
                      {manufacturersCatalog.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {!m.active ? " (nieaktywny)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-xs text-slate-600">Zakres oferty</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ["all", "Wszystko"],
                          ["products", "Produkty"],
                          ["cartons", "Kartony i opakowania"],
                          ["packaging", "Materiały pakowe"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          disabled={linesLocked || supplierId < 1}
                          onClick={() => setCatalogScope(val)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
                            catalogScope === val
                              ? "border-violet-500 bg-violet-50 text-violet-900"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-xs text-slate-600">Szukaj w ofercie (nazwa, SKU, EAN)</span>
                    <input
                      className={inputClass}
                      placeholder="Filtruj ofertę: nazwa, SKU lub EAN…"
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                      }}
                      autoComplete="off"
                      disabled={linesLocked || supplierId < 1}
                    />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={hideAlreadyAdded}
                      onChange={(e) => {
                        setHideAlreadyAdded(e.target.checked);
                      }}
                      className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      disabled={linesLocked || supplierId < 1}
                    />
                    Ukryj już dodane pozycje
                  </label>
                </div>
                {catalogLoading ? (
                  <p className="text-xs text-slate-500">Wczytywanie oferty dostawcy…</p>
                ) : null}
                {linesLocked ? (
                  <p className="text-xs text-slate-600">Zamówienie zakończone — dodawanie pozycji z oferty jest wyłączone.</p>
                ) : null}
                {supplierId >= 1 && !catalogLoading && !linesLocked && (visibleTopProducts.length > 0 || mainSelectableCatalog.length > 0) ? (
                  <div className="max-h-[min(60vh,36rem)] overflow-y-auto overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full min-w-[1040px] text-left text-sm">
                      <thead className="sticky top-0 z-[1] bg-slate-100 text-xs font-semibold text-slate-700">
                        <tr>
                          <th className="min-w-[220px] px-2 py-2">Produkt</th>
                          <th className="w-24 px-1 py-2 text-right">Stan</th>
                          <th className="w-16 px-1 py-2 text-right">Ilość</th>
                          <th className="w-[5.5rem] px-1 py-2 text-right">Netto j.</th>
                          <th className="w-[5.5rem] px-1 py-2 text-right">Brutto j.</th>
                          <th className="w-14 px-1 py-2 text-right">Rabat</th>
                          <th className="w-24 px-1 py-2 text-right">W. net</th>
                          <th className="w-24 px-1 py-2 text-right">W. brut</th>
                          <th className="w-32 px-1 py-2 pr-2 text-right">Akcja</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleTopProducts.length > 0 ? (
                          <tr className="bg-violet-50/90">
                            <td colSpan={9} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-800">
                              Najczęściej kupowane
                            </td>
                          </tr>
                        ) : null}
                        {visibleTopProducts.map((row) => (
                          <CatalogOfferAddRow
                            key={`top-${catalogRowKey(row)}`}
                            row={row}
                            draft={inlineCatalogDrafts[catalogRowKey(row)] ?? defaultInlineDraft(row)}
                            orderQtyInDoc={catalogRowQtyInOrder(row)}
                            patchInlineCatalogDraft={patchInlineCatalogDraft}
                            onAdd={() => void addLineForCatalogRow(row)}
                            addFlash={addFlashCatalogKey === catalogRowKey(row)}
                            busyItem={busyItem}
                            inputTableClass={inputTableClass}
                            fmtMoney={fmtMoney}
                            popularTag
                          />
                        ))}
                        {mainSelectableCatalog.length > 0 && visibleTopProducts.length > 0 ? (
                          <tr className="bg-slate-50/90">
                            <td colSpan={9} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                              Pozostała oferta
                            </td>
                          </tr>
                        ) : null}
                        {mainSelectableCatalog.map((row) => (
                          <CatalogOfferAddRow
                            key={catalogRowKey(row)}
                            row={row}
                            draft={inlineCatalogDrafts[catalogRowKey(row)] ?? defaultInlineDraft(row)}
                            orderQtyInDoc={catalogRowQtyInOrder(row)}
                            patchInlineCatalogDraft={patchInlineCatalogDraft}
                            onAdd={() => void addLineForCatalogRow(row)}
                            addFlash={addFlashCatalogKey === catalogRowKey(row)}
                            busyItem={busyItem}
                            inputTableClass={inputTableClass}
                            fmtMoney={fmtMoney}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {supplierId >= 1 && !catalogLoading && supplierCatalog.length > 0 && !linesLocked && mainSelectableCatalog.length === 0 && visibleTopProducts.length === 0 ? (
                  <p className="text-xs text-amber-900">Brak wyników w bieżącym filtrze — wyczyść wyszukiwanie, zmień producenta odznacz „ukryj dodane”.</p>
                ) : null}
                {supplierId >= 1 && !catalogLoading && supplierCatalog.length === 0 ? (
                  <p className="text-xs text-slate-600">
                    Brak pozycji w wybranym zakresie oferty — dla produktów powiąż je z dostawcą; dla kartonów i
                    materiałów pakowych przypisz głównego dostawcę na karcie magazynu (zakładka Dostawca).
                  </p>
                ) : null}
              </div>

              {order.items.length > 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 tabular-nums text-slate-800">
                    <span>
                      <span className="text-slate-500">Razem netto:</span>{" "}
                      <span className="font-semibold">{fmtMoney(orderNetTotal)} zł</span>
                    </span>
                    <span>
                      <span className="text-slate-500">VAT:</span>{" "}
                      <span className="font-semibold">{fmtMoney(orderVatTotal)} zł</span>
                    </span>
                    <span>
                      <span className="text-slate-500">Brutto:</span>{" "}
                      <span className="font-semibold">{fmtMoney(orderGrossTotal)} zł</span>
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[1280px] text-sm">
                  <thead className="sticky top-0 z-[1] bg-slate-50 text-left shadow-sm">
                    <tr>
                      <th className="px-2 py-2" aria-label="Zdjęcie" />
                      <th className="px-3 py-2">Produkt</th>
                      <th className="px-3 py-2 text-right">VAT %</th>
                      <th className="px-3 py-2 text-right">Ilość</th>
                      <th className="px-3 py-2 text-right">Jedn. net (kat.)</th>
                      <th className="px-3 py-2 text-right">Jedn. brut (kat.)</th>
                      <th className="px-3 py-2 text-right">Rabat / vs katalog</th>
                      <th className="px-3 py-2 text-right">Netto po rab.</th>
                      <th className="px-3 py-2 text-right">Brutto po rab.</th>
                      <th className="px-3 py-2 text-right">Wartość netto</th>
                      <th className="px-3 py-2 text-right">Wartość brutto</th>
                      <th className="w-14 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-3 py-6 text-center text-slate-500">
                          Brak pozycji.
                        </td>
                      </tr>
                    ) : (
                      order.items.map((it) => {
                        const draft = lineDrafts[it.id] ?? draftFromItem(it);
                        const { net: lineNet, gross: lineGross } = linesLocked
                          ? {
                              net: it.line_total_net ?? it.line_total_value,
                              gross: it.line_total_gross ?? it.line_total_value,
                            }
                          : lineAmountsFromDraft(it, draft);
                        const cat = catalogByLineKey.get(orderLineKeyFromItem(it));
                        const listNet =
                          it.catalog_compare_unit_net != null && Number.isFinite(Number(it.catalog_compare_unit_net))
                            ? Number(it.catalog_compare_unit_net)
                            : cat?.purchase_price != null && Number.isFinite(Number(cat.purchase_price))
                              ? Number(cat.purchase_price)
                              : null;
                        const vatR = it.vat_rate ?? 23;
                        const listGross = listNet != null ? roundMoney2(listNet * (1 + vatR / 100)) : null;
                        const unitNetEff =
                          draft.price.trim() === "" ? null : Number(draft.price.replace(",", "."));
                        const vsCatalog =
                          listNet != null &&
                          unitNetEff != null &&
                          Number.isFinite(listNet) &&
                          Number.isFinite(unitNetEff) &&
                          listNet > 1e-9
                            ? formatPriceVsCatalog(listNet, unitNetEff)
                            : null;
                        return (
                          <tr key={it.id} className="border-t border-slate-100">
                            <td className="px-2 py-2 align-middle">
                              <PoProductThumb
                                url={it.product_image_url}
                                boxClass="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                              />
                            </td>
                            <td className="px-3 py-2 align-middle">
                              <div className="font-medium leading-tight">
                                {(it.display_name ?? "").trim() ||
                                  (it.product_name ?? "").trim() ||
                                  (it.wm_name ?? "").trim() ||
                                  "Pozycja usunięta"}
                              </div>
                              <div className="text-xs text-slate-500">
                                EAN: {it.product_id != null ? (it.product_ean ?? "").trim() || "—" : "—"}
                              </div>
                              <div className="text-xs text-slate-500">
                                SKU:{" "}
                                {it.product_id != null
                                  ? (it.product_symbol ?? "").trim() || "—"
                                  : [it.wm_kind, it.wm_id].filter(Boolean).join(" · ") || "—"}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right align-middle tabular-nums text-slate-600">{vatR}%</td>
                            <td className="px-3 py-2 text-right align-middle">
                              {linesLocked ? (
                                <span className="tabular-nums">{it.quantity_ordered}</span>
                              ) : (
                                <input
                                  className={inputTableClass}
                                  value={draft.qty}
                                  onChange={(e) => {
                                    const qty = e.target.value;
                                    setLineDrafts((prev) => {
                                      const d0 = prev[it.id] ?? draftFromItem(it);
                                      let next: LineDraft = { ...d0, qty };
                                      if (!it.purchase_price_manual) {
                                        const qn = Number(qty.replace(",", "."));
                                        const tierNet = pickUnitNetFromTiers(
                                          Number.isFinite(qn) ? qn : 0,
                                          cat?.price_tiers,
                                        );
                                        const base =
                                          tierNet ??
                                          (cat?.purchase_price != null && Number.isFinite(Number(cat.purchase_price))
                                            ? Number(cat.purchase_price)
                                            : null);
                                        if (base != null && Number.isFinite(base)) {
                                          next = {
                                            ...next,
                                            price: String(roundMoney2(base)),
                                            gross: unitGrossFromNet(base, vatR),
                                          };
                                        }
                                      }
                                      return { ...prev, [it.id]: next };
                                    });
                                  }}
                                  onBlur={() => void commitLinePatch(it.id)}
                                />
                              )}
                            </td>
                            <td className="px-3 py-2 text-right align-middle tabular-nums text-slate-600">
                              {listNet != null ? fmtMoney(listNet) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right align-middle tabular-nums text-slate-600">
                              {listGross != null ? fmtMoney(listGross) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right align-middle text-slate-600">
                              {vsCatalog ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-right align-middle">
                              {linesLocked ? (
                                <span className="tabular-nums">{it.purchase_price != null ? fmtMoney(it.purchase_price) : "—"}</span>
                              ) : (
                                <input
                                  className={inputTableClass}
                                  value={draft.price}
                                  placeholder="—"
                                  onChange={(e) => {
                                    const price = e.target.value;
                                    const pn = price.trim() === "" ? null : Number(price.replace(",", "."));
                                    const gross =
                                      pn != null && Number.isFinite(pn) ? unitGrossFromNet(pn, vatR) : "";
                                    setLineDrafts((prev) => ({
                                      ...prev,
                                      [it.id]: { ...draft, price, gross },
                                    }));
                                  }}
                                  onBlur={() => void commitLinePatch(it.id)}
                                />
                              )}
                              {!linesLocked ? (
                                <div className="mt-1 max-w-[11rem] text-left text-[10px] leading-snug text-slate-500">
                                  {it.purchase_price_manual ? (
                                    <span className="inline-block rounded bg-amber-100 px-1 font-medium text-amber-950">
                                      Cena ręczna
                                    </span>
                                  ) : it.pricing_hint ? (
                                    <span>{it.pricing_hint}</span>
                                  ) : null}
                                  {it.purchase_price == null && it.pricing_warning ? (
                                    <span className="mt-0.5 block text-amber-800">{it.pricing_warning}</span>
                                  ) : null}
                                  {it.purchase_price_manual ? (
                                    <button
                                      type="button"
                                      className="mt-1 block text-left text-[10px] font-medium text-violet-700 hover:underline"
                                      disabled={busyItem}
                                      onClick={() => void restoreLineCatalogPrice(it.id)}
                                    >
                                      Przywróć cenę z cennika
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right align-middle">
                              {linesLocked ? (
                                <span className="tabular-nums">
                                  {it.purchase_price != null
                                    ? fmtMoney(it.purchase_price * (1 + vatR / 100))
                                    : "—"}
                                </span>
                              ) : (
                                <input
                                  className={inputTableClass}
                                  value={draft.gross}
                                  placeholder="—"
                                  onChange={(e) => {
                                    const gross = e.target.value;
                                    const gn = gross.trim() === "" ? null : Number(gross.replace(",", "."));
                                    const price =
                                      gn != null && Number.isFinite(gn)
                                        ? String(roundMoney2(gn / (1 + vatR / 100)))
                                        : "";
                                    setLineDrafts((prev) => ({
                                      ...prev,
                                      [it.id]: { ...draft, gross, price },
                                    }));
                                  }}
                                  onBlur={() => void commitLinePatch(it.id)}
                                />
                              )}
                            </td>
                            <td className="px-3 py-2 text-right align-middle tabular-nums font-medium">{fmtMoney(lineNet)}</td>
                            <td className="px-3 py-2 text-right align-middle tabular-nums font-medium text-slate-900">
                              {fmtMoney(lineGross)}
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <button
                                type="button"
                                disabled={busyItem || linesLocked}
                                onClick={() => void removeLine(it.id)}
                                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40"
                              >
                                Usuń
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {order.items.length > 0 ? (
                    <tfoot>
                      <tr className="sticky bottom-0 border-t-2 border-slate-300 bg-slate-100 font-semibold shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
                        <td colSpan={9} className="px-3 py-2.5 text-right text-slate-700">
                          Razem <span className="ml-2 font-normal text-slate-500">(w tym VAT {fmtMoney(orderVatTotal)})</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(orderNetTotal)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(orderGrossTotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50">
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtCatalogStock(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.abs(n - Math.round(n)) < 1e-4 ? Math.round(n) : Math.round(n * 100) / 100);
}

type CatalogOfferAddRowProps = {
  row: SupplierProductCatalogItem;
  draft: InlineCatalogDraft;
  orderQtyInDoc: number;
  patchInlineCatalogDraft: (
    row: SupplierProductCatalogItem,
    field: "qty" | "net" | "gross" | "disc",
    value: string,
  ) => void;
  onAdd: () => void;
  addFlash: boolean;
  busyItem: boolean;
  inputTableClass: string;
  fmtMoney: (n: number) => string;
  popularTag?: boolean;
};

function CatalogOfferAddRow({
  row,
  draft,
  orderQtyInDoc,
  patchInlineCatalogDraft,
  onAdd,
  addFlash,
  busyItem,
  inputTableClass,
  fmtMoney,
  popularTag,
}: CatalogOfferAddRowProps) {
  const vatR = row.vat_rate ?? 23;
  let unitNet = parseDec(draft.net);
  const unitGross = parseDec(draft.gross);
  if (unitNet == null && unitGross != null && Number.isFinite(unitGross) && unitGross >= 0) {
    unitNet = roundMoney2(unitGross / (1 + vatR / 100));
  }
  const qn = parseDec(draft.qty) ?? 0;
  const lineValNet = unitNet != null && qn > 0 && Number.isFinite(unitNet) ? roundMoney2(qn * unitNet) : 0;
  const lineValGross =
    unitNet != null && qn > 0 && Number.isFinite(unitNet)
      ? roundMoney2(qn * unitNet * (1 + vatR / 100))
      : 0;
  const tierHint = tierPricingHint(qn, row.price_tiers);
  const stockOn = row.stock_on_hand;
  const resv = row.stock_reserved;
  return (
    <tr
      className={`align-middle transition-colors ${addFlash ? "bg-emerald-50" : "bg-white"} ${popularTag ? "ring-1 ring-inset ring-violet-100/60" : ""}`}
    >
      <td className="px-2 py-2">
        {popularTag ? (
          <span className="mb-1 inline-block rounded bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
            Top
          </span>
        ) : null}
        <div className="flex items-start gap-2">
          <PoProductThumb
            url={row.image_url}
            boxClass="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
          />
          <div className="min-w-0 flex-1 text-xs">
            {orderQtyInDoc > 0 ? (
              <div className="mb-0.5 inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                już dodany: {fmtCatalogStock(orderQtyInDoc)} szt.
              </div>
            ) : null}
            <div className="font-medium leading-snug text-slate-900">{(row.name || "").trim() || "—"}</div>
            {row.catalog_kind === "carton" ? (
              <span className="mb-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                Karton
              </span>
            ) : row.catalog_kind === "packaging" ? (
              <span className="mb-0.5 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-950">
                Materiał pakowy
              </span>
            ) : null}
            {row.warehouse_id != null ? (
              <div className="text-[10px] text-slate-500">Magazyn #{row.warehouse_id}</div>
            ) : null}
            {row.manufacturer_name ? <div className="text-slate-600">Producent: {row.manufacturer_name}</div> : null}
            <div className="text-slate-500">EAN: {(row.ean || "").trim() || "—"}</div>
            <div className="text-slate-500">SKU: {(row.sku || "").trim() || "—"}</div>
            <div className="text-slate-600">VAT: {row.vat_rate ?? 23}%</div>
          </div>
        </div>
      </td>
      <td className="px-1 py-2 text-right text-xs text-slate-700">
        <div className="whitespace-nowrap">Stan: {fmtCatalogStock(stockOn)} szt.</div>
        {resv != null && resv > 0.0001 ? <div className="text-slate-500">Rez. {fmtCatalogStock(resv)}</div> : null}
      </td>
      <td className="px-1 py-2 text-right">
        <input
          className={inputTableClass}
          value={draft.qty}
          onChange={(e) => patchInlineCatalogDraft(row, "qty", e.target.value)}
          inputMode="decimal"
          disabled={busyItem}
        />
      </td>
      <td className="px-1 py-2 text-right align-top">
        <input
          className={inputTableClass}
          value={draft.net}
          placeholder="—"
          onChange={(e) => patchInlineCatalogDraft(row, "net", e.target.value)}
          inputMode="decimal"
          disabled={busyItem}
        />
        {!draft.priceTouched && tierHint ? (
          <div className="mt-0.5 max-w-[7rem] pl-0.5 text-left text-[9px] leading-tight text-slate-500">{tierHint}</div>
        ) : draft.priceTouched ? (
          <div className="mt-0.5 pl-0.5 text-left text-[9px] font-medium text-amber-900">Cena ręczna</div>
        ) : null}
      </td>
      <td className="px-1 py-2 text-right">
        <input
          className={inputTableClass}
          value={draft.gross}
          placeholder="—"
          onChange={(e) => patchInlineCatalogDraft(row, "gross", e.target.value)}
          inputMode="decimal"
          disabled={busyItem}
        />
      </td>
      <td className="px-1 py-2 text-right">
        <input
          className={`${inputTableClass} w-[3.4rem] min-w-0 pl-0.5 pr-0.5`}
          value={draft.disc}
          onChange={(e) => patchInlineCatalogDraft(row, "disc", e.target.value)}
          inputMode="decimal"
          disabled={busyItem}
        />
        <span className="ml-0.5 text-slate-500">%</span>
      </td>
      <td className="px-1 py-2 text-right text-xs font-medium tabular-nums text-slate-800">{fmtMoney(lineValNet)}</td>
      <td className="px-1 py-2 text-right text-xs font-medium tabular-nums text-slate-900">{fmtMoney(lineValGross)}</td>
      <td className="px-1 py-2 pr-2 text-right">
        <button
          type="button"
          disabled={busyItem}
          onClick={onAdd}
          className={`w-full min-w-[7.5rem] rounded-lg px-2 py-1.5 text-xs font-semibold text-white transition-colors ${
            addFlash ? "bg-emerald-600" : "bg-slate-800 hover:bg-slate-900"
          } disabled:opacity-50`}
        >
          {addFlash ? "✓ Dodano" : orderQtyInDoc > 0 ? "Dodaj kolejne" : "Dodaj"}
        </button>
      </td>
    </tr>
  );
}

function PoProductThumb({ url, boxClass }: { url?: string | null; boxClass?: string }) {
  const [bad, setBad] = useState(false);
  const box =
    boxClass ??
    "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50";
  if (!url || bad) return <div className={box} aria-hidden />;
  return (
    <div className={box}>
      <img src={url} alt="" className="max-h-full max-w-full object-contain" onError={() => setBad(true)} />
    </div>
  );
}
