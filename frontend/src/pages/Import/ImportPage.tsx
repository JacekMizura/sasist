import { useState, useCallback, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Box, Boxes, Factory, Package, ShoppingCart, Tags, Truck, Users } from "lucide-react";
import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";
import { useTranslation } from "../../locales";
import type { Translations } from "../../locales";
import {
  PRODUCT_FIELDS,
  ORDER_ORDER_FIELDS,
  ORDER_CART_FIELDS,
  ADDRESS_FIELDS,
  PAYMENT_FIELDS,
  SET_IMPORT_FIELDS,
  CUSTOMER_IMPORT_FIELDS,
  CUSTOMER_IMPORT_HEADER_ALIASES,
  normalizeHeader,
  PRODUCT_HEADER_ALIASES,
  ORDER_ORDER_HEADER_ALIASES,
  ORDER_CART_HEADER_ALIASES,
  SET_IMPORT_HEADER_ALIASES,
  ADDRESS_HEADER_ALIASES,
  PAYMENT_HEADER_ALIASES,
} from "./importMappingConfig";

/** Normalizacja do porównania podobieństwa etykiet z nagłówkami kolumn (małe litery, bez diakrytyków). */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Zwraca wynik dopasowania etykiety do nazwy kolumny (0–2). */
function matchScore(label: string, column: string): number {
  const a = normalizeForMatch(label);
  const b = normalizeForMatch(column);
  if (a === b) return 2;
  if (a.includes(b) || b.includes(a)) return 1;
  return 0;
}

/** „Użyj wszystkich”: dla każdego pola systemowego wybiera najlepszą pasującą kolumnę pliku (podobieństwo tekstu). */
function autoMap(
  fieldKeys: readonly string[],
  columns: string[],
  getLabel: (key: string) => string
): Record<string, string> {
  const result: Record<string, string> = {};
  const used = new Set<string>();
  for (const key of fieldKeys) {
    const label = getLabel(key);
    let bestCol = "";
    let bestScore = 0;
    for (const col of columns) {
      if (used.has(col)) continue;
      const score = matchScore(label, col);
      if (score > bestScore) {
        bestScore = score;
        bestCol = col;
      }
    }
    if (bestCol) {
      result[key] = bestCol;
      used.add(bestCol);
    }
  }
  return result;
}

const STORAGE_KEY_PRODUCTS = "import_mapping_products";
const STORAGE_KEY_ORDER_ORDER = "import_mapping_order_order";
const STORAGE_KEY_ORDER_CART = "import_mapping_order_cart";
const STORAGE_KEY_SETS = "import_mapping_sets";
const STORAGE_KEY_CUSTOMERS = "import_mapping_customers";

const WIZARD_STEPS = [
  { id: 1, label: "Wybór pliku" },
  { id: 2, label: "Podgląd danych" },
  { id: 3, label: "Mapowanie pól" },
  { id: 4, label: "Walidacja" },
  { id: 5, label: "Import" },
  { id: 6, label: "Podsumowanie" },
] as const;

const IMPORT_KIND_META: Array<{
  kind: ImportPageProps["settingsKind"] | "label_templates";
  label: string;
  href: string;
  icon: typeof Box;
}> = [
  { kind: "orders", label: "Zamówienia", href: "/settings/import?kind=orders", icon: ShoppingCart },
  { kind: "products", label: "Produkty", href: "/settings/import?kind=products", icon: Package },
  { kind: "sets", label: "Zestawy", href: "/settings/import?kind=sets", icon: Boxes },
  { kind: "cartons", label: "Kartony", href: "/settings/import?kind=cartons", icon: Box },
  { kind: "manufacturers", label: "Producenci", href: "/settings/import?kind=manufacturers", icon: Factory },
  { kind: "suppliers", label: "Dostawcy", href: "/settings/import?kind=suppliers", icon: Truck },
  { kind: "customers", label: "Klienci", href: "/settings/import?kind=customers", icon: Users },
  { kind: "label_templates", label: "Szablony etykiet", href: "/settings/import?kind=label_templates", icon: Tags },
];

function loadSavedMapping(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function mergeWithColumns(
  suggested: Record<string, string>,
  columns: string[],
  saved: Record<string, string>
): Record<string, string> {
  const merged = { ...suggested };
  const colSet = new Set(columns);
  for (const [k, col] of Object.entries(saved)) {
    if (colSet.has(col)) merged[k] = col;
  }
  return merged;
}

/** Pre-fill mapping from predefined header aliases (e.g. "Kod EAN" -> ean). */
function suggestFromAliases(
  columns: string[],
  aliases: Partial<Record<string, string[]>>
): Record<string, string> {
  const result: Record<string, string> = {};
  const used = new Set<string>();
  for (const [fieldKey, headerList] of Object.entries(aliases)) {
    if (!headerList?.length) continue;
    const normalizedAliases = headerList.map((h) => normalizeHeader(h));
    const col = columns.find((c) => {
      if (used.has(c)) return false;
      const n = normalizeHeader(c);
      return normalizedAliases.some((a) => n === a || n.includes(a) || a.includes(n));
    });
    if (col) {
      result[fieldKey] = col;
      used.add(col);
    }
  }
  return result;
}

function getFieldLabel(t: Translations, key: string): string {
  const k = `import_f_${key}` as keyof Translations;
  const v = t[k];
  return typeof v === "string" ? v : key;
}

/** Ikona akcji „wyczyść mapowanie” przy pojedynczym wierszu. */
function ClearIcon({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600 transition-colors"
      aria-label="Wyczyść mapowanie"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

/** Ikona rozwijania/zwijania sekcji w accordion. */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-5 h-5 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

type OrderImportSectionId = "orderOrder" | "orderCart" | "address" | "payment";

type MappingSectionProps = {
  title: string;
  fieldKeys: readonly string[];
  mapping: Record<string, string>;
  columns: string[];
  onMappingChange: (key: string, column: string) => void;
  onClearSection: () => void;
  onUseAll: () => void;
  getLabel: (key: string) => string;
  t: Translations;
  defaultOpen?: boolean;
  /** Zamówienia: kolumna nie może być użyta w innej sekcji / innym polu (poza bieżącym wyborem). */
  orderCrossMaps?: Record<OrderImportSectionId, Record<string, string>>;
  orderSectionId?: OrderImportSectionId;
};

/** Jedna sekcja mapowania (np. Produkty): nagłówek z pigułką statusu, przycisk „Użyj wszystkich”, lista pól z dropdownem kolumn. */
function MappingSection({
  title,
  fieldKeys,
  mapping,
  columns,
  onMappingChange,
  onClearSection,
  onUseAll,
  getLabel,
  t,
  defaultOpen = false,
  orderCrossMaps,
  orderSectionId,
}: MappingSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const mappedCount = fieldKeys.filter((k) => mapping[k]).length;
  const allMapped = mappedCount === fieldKeys.length;
  const someMapped = mappedCount > 0;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-3"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <ChevronIcon open={open} />
          <span className="text-sm font-bold text-slate-800">{title}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              allMapped ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {allMapped ? t.import_mapped : t.import_unmapped}
          </span>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {someMapped && (
            <button
              type="button"
              onClick={onClearSection}
              className="text-[11px] font-semibold text-slate-500 hover:text-red-600"
            >
              {t.import_clearSection}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onUseAll(); }}
            className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 transition-colors hover:bg-cyan-100 hover:text-cyan-700"
          >
            {t.import_useAll}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {fieldKeys.map((key) => {
              const mappedElsewhere = new Set(
                Object.entries(mapping)
                  .filter(([k]) => k !== key && mapping[k])
                  .map(([, v]) => v)
              );
              const crossOccupied = new Set<string>();
              if (orderCrossMaps && orderSectionId) {
                (Object.keys(orderCrossMaps) as OrderImportSectionId[]).forEach((sid) => {
                  const m = orderCrossMaps[sid];
                  for (const [k, v] of Object.entries(m)) {
                    if (!v) continue;
                    if (sid === orderSectionId && k === key) continue;
                    crossOccupied.add(v);
                  }
                });
              }
              const availableColumns = columns.filter(
                (col) =>
                  mapping[key] === col || (!mappedElsewhere.has(col) && !crossOccupied.has(col))
              );
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-md border border-slate-100 bg-white px-2.5 py-1.5"
                >
                  <span className="w-48 shrink-0 text-sm font-medium text-slate-700">
                    {getLabel(key)}
                  </span>
                  <select
                    className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    value={mapping[key] ?? ""}
                    onChange={(e) => onMappingChange(key, e.target.value)}
                  >
                    <option value="">{t.import_selectColumn}</option>
                    {availableColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                  <ClearIcon onClick={() => onMappingChange(key, "")} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export type ImportPageProps = {
  settingsKind:
  | "products"
  | "orders"
  | "sets"
  | "manufacturers"
  | "suppliers"
  | "cartons"
  | "customers";
  /** Osadzenie w Ustawienia → Import (bez pełnego nagłówka strony). */
  embedded?: boolean;
};

/** Kreator importu CSV (produkty / zamówienia / zestawy) — używany wyłącznie z Ustawienia → Import. */
export default function ImportPage({ settingsKind, embedded = false }: ImportPageProps) {
  const t = useTranslation();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const warehouseId = warehouse?.id ?? null;
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const [productsMapping, setProductsMapping] = useState<Record<string, string>>({});
  const [orderOrderMapping, setOrderOrderMapping] = useState<Record<string, string>>({});
  const [orderCartMapping, setOrderCartMapping] = useState<Record<string, string>>({});
  const [addressMapping, setAddressMapping] = useState<Record<string, string>>({});
  const [paymentMapping, setPaymentMapping] = useState<Record<string, string>>({});
  const [setsMapping, setSetsMapping] = useState<Record<string, string>>({});
  const [customersMapping, setCustomersMapping] = useState<Record<string, string>>({});

  const getLabel = useCallback((key: string) => getFieldLabel(t, key), [t]);

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/import/preview/", formData);
      const cols: string[] = res.data.columns ?? [];
      setColumns(cols);
      setPreview(res.data.preview ?? []);
      if (cols.length > 0) {
        const suggestedProducts = suggestFromAliases(cols, PRODUCT_HEADER_ALIASES);
        const suggestedOrderOrder = suggestFromAliases(cols, ORDER_ORDER_HEADER_ALIASES);
        const suggestedOrderCart = suggestFromAliases(cols, ORDER_CART_HEADER_ALIASES);
        const suggestedSets = suggestFromAliases(cols, SET_IMPORT_HEADER_ALIASES);
        const suggestedAddress = suggestFromAliases(cols, ADDRESS_HEADER_ALIASES);
        const suggestedPayment = suggestFromAliases(cols, PAYMENT_HEADER_ALIASES);
        const savedProducts = loadSavedMapping(STORAGE_KEY_PRODUCTS);
        const savedOrderOrder = loadSavedMapping(STORAGE_KEY_ORDER_ORDER);
        const savedOrderCart = loadSavedMapping(STORAGE_KEY_ORDER_CART);
        const savedSets = loadSavedMapping(STORAGE_KEY_SETS);
        const suggestedCustomers = suggestFromAliases(cols, CUSTOMER_IMPORT_HEADER_ALIASES);
        const autoCustomers = autoMap([...CUSTOMER_IMPORT_FIELDS], cols, getLabel);
        const savedCustomers = loadSavedMapping(STORAGE_KEY_CUSTOMERS);
        setProductsMapping(mergeWithColumns(suggestedProducts, cols, savedProducts));
        setOrderOrderMapping(mergeWithColumns(suggestedOrderOrder, cols, savedOrderOrder));
        setOrderCartMapping(mergeWithColumns(suggestedOrderCart, cols, savedOrderCart));
        setAddressMapping(mergeWithColumns(suggestedAddress, cols, {}));
        setPaymentMapping(mergeWithColumns(suggestedPayment, cols, {}));
        setSetsMapping(mergeWithColumns(suggestedSets, cols, savedSets));
        setCustomersMapping(mergeWithColumns({ ...suggestedCustomers, ...autoCustomers }, cols, savedCustomers));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    const isOrdersImport =
      settingsKind !== "products" &&
      settingsKind !== "manufacturers" &&
      settingsKind !== "suppliers" &&
      settingsKind !== "cartons" &&
      settingsKind !== "customers" &&
      settingsKind !== "sets";
    if (isOrdersImport && !warehouseId) {
      alert("Wybierz magazyn.");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const columnMap =
        settingsKind === "products"
          ? productsMapping
          : settingsKind === "manufacturers"
            ? productsMapping
            : settingsKind === "suppliers"
              ? productsMapping
              : settingsKind === "cartons"
                ? productsMapping
                : settingsKind === "customers"
                  ? customersMapping
                  : settingsKind === "sets"
                    ? setsMapping
                    : {
                        ...orderOrderMapping,
                        ...orderCartMapping,
                        ...addressMapping,
                        ...paymentMapping,
                      };
      formData.append("column_map", JSON.stringify(columnMap));
      const url =
        settingsKind === "products"
          ? `/import/products/?tenant_id=${tenantId}`
          : settingsKind === "manufacturers"
            ? `/import/manufacturers/?tenant_id=${tenantId}`
            : settingsKind === "suppliers"
              ? `/import/suppliers/?tenant_id=${tenantId}`
              : settingsKind === "cartons"
                ? `/import/cartons/?tenant_id=${tenantId}`
                : settingsKind === "customers"
                  ? `/import/customers/?tenant_id=${tenantId}`
                  : settingsKind === "sets"
                    ? `/import/sets/?tenant_id=${tenantId}`
                    : `/import/orders/?tenant_id=${tenantId}&warehouse_id=${warehouseId}`;
      const res = await api.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data as Record<string, unknown>);
      alert(t.import_done);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const setMapping = useCallback(
    (section: "products" | "orderOrder" | "orderCart" | "address" | "payment" | "sets" | "customers") =>
      (key: string, column: string) => {
        const upd = (prev: Record<string, string>) =>
          column ? { ...prev, [key]: column } : (() => { const n = { ...prev }; delete n[key]; return n; })();
        switch (section) {
          case "products":
            setProductsMapping(upd);
            break;
          case "orderOrder":
            setOrderOrderMapping(upd);
            break;
          case "orderCart":
            setOrderCartMapping(upd);
            break;
          case "address":
            setAddressMapping(upd);
            break;
          case "payment":
            setPaymentMapping(upd);
            break;
          case "sets":
            setSetsMapping(upd);
            break;
          case "customers":
            setCustomersMapping(upd);
            break;
        }
      },
    []
  );

  const clearSection = useCallback(
    (section: "products" | "orderOrder" | "orderCart" | "address" | "payment" | "sets" | "customers") => {
      switch (section) {
        case "products":
          setProductsMapping({});
          break;
        case "orderOrder":
          setOrderOrderMapping({});
          break;
        case "orderCart":
          setOrderCartMapping({});
          break;
        case "address":
          setAddressMapping({});
          break;
        case "payment":
          setPaymentMapping({});
          break;
        case "sets":
          setSetsMapping({});
          break;
        case "customers":
          setCustomersMapping({});
          break;
      }
    },
    []
  );

  const useAllProducts = useCallback(() => {
    const m = autoMap(PRODUCT_FIELDS, columns, getLabel);
    setProductsMapping(m);
  }, [columns, getLabel]);

  const useAllOrderOrder = useCallback(() => {
    const sug = suggestFromAliases(columns, ORDER_ORDER_HEADER_ALIASES);
    const auto = autoMap(ORDER_ORDER_FIELDS, columns, getLabel);
    setOrderOrderMapping(mergeWithColumns({ ...sug, ...auto }, columns, {}));
  }, [columns, getLabel]);

  const useAllOrderCart = useCallback(() => {
    setOrderCartMapping(autoMap(ORDER_CART_FIELDS, columns, getLabel));
  }, [columns, getLabel]);

  const useAllSets = useCallback(() => {
    const sug = suggestFromAliases(columns, SET_IMPORT_HEADER_ALIASES);
    const auto = autoMap([...SET_IMPORT_FIELDS], columns, getLabel);
    setSetsMapping(mergeWithColumns({ ...sug, ...auto }, columns, {}));
  }, [columns, getLabel]);

  const useAllAddress = useCallback(() => {
    const sug = suggestFromAliases(columns, ADDRESS_HEADER_ALIASES);
    const auto = autoMap(ADDRESS_FIELDS, columns, getLabel);
    setAddressMapping(mergeWithColumns({ ...sug, ...auto }, columns, {}));
  }, [columns, getLabel]);

  const useAllPayment = useCallback(() => {
    const sug = suggestFromAliases(columns, PAYMENT_HEADER_ALIASES);
    const auto = autoMap(PAYMENT_FIELDS, columns, getLabel);
    setPaymentMapping(mergeWithColumns({ ...sug, ...auto }, columns, {}));
  }, [columns, getLabel]);

  const useAllCustomers = useCallback(() => {
    const sug = suggestFromAliases(columns, CUSTOMER_IMPORT_HEADER_ALIASES);
    const auto = autoMap([...CUSTOMER_IMPORT_FIELDS], columns, getLabel);
    setCustomersMapping(mergeWithColumns({ ...sug, ...auto }, columns, {}));
  }, [columns, getLabel]);

  const orderCrossMaps = useMemo(
    () => ({
      orderOrder: orderOrderMapping,
      orderCart: orderCartMapping,
      address: addressMapping,
      payment: paymentMapping,
    }),
    [orderOrderMapping, orderCartMapping, addressMapping, paymentMapping]
  );

  const isReadyToImport =
    file !== null &&
    (settingsKind === "products" ||
    settingsKind === "manufacturers" ||
    settingsKind === "suppliers" ||
    settingsKind === "cartons"
      ? Object.keys(productsMapping).length > 0
      : settingsKind === "customers"
        ? Object.keys(customersMapping).length > 0
        : settingsKind === "sets"
          ? Boolean(
              setsMapping.set_sku &&
                (setsMapping.child_sku ||
                  setsMapping.child_id ||
                  setsMapping.child_ean ||
                  setsMapping.child_symbol ||
                  setsMapping.child_catalog_number)
            )
          : Object.keys(orderOrderMapping).length > 0 ||
              Object.keys(orderCartMapping).length > 0 ||
              Object.keys(addressMapping).length > 0 ||
              Object.keys(paymentMapping).length > 0);

  useEffect(() => {
    if (Object.keys(productsMapping).length > 0) {
      localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(productsMapping));
    }
  }, [productsMapping]);

  useEffect(() => {
    if (Object.keys(orderOrderMapping).length > 0) {
      localStorage.setItem(STORAGE_KEY_ORDER_ORDER, JSON.stringify(orderOrderMapping));
    }
  }, [orderOrderMapping]);

  useEffect(() => {
    if (Object.keys(orderCartMapping).length > 0) {
      localStorage.setItem(STORAGE_KEY_ORDER_CART, JSON.stringify(orderCartMapping));
    }
  }, [orderCartMapping]);

  useEffect(() => {
    if (Object.keys(setsMapping).length > 0) {
      localStorage.setItem(STORAGE_KEY_SETS, JSON.stringify(setsMapping));
    }
  }, [setsMapping]);

  useEffect(() => {
    if (Object.keys(customersMapping).length > 0) {
      localStorage.setItem(STORAGE_KEY_CUSTOMERS, JSON.stringify(customersMapping));
    }
  }, [customersMapping]);

  const displayWizardStep = useMemo(() => {
    if (result != null) return 6;
    if (loading && file) return 5;
    if (isReadyToImport && columns.length > 0) return 4;
    if (columns.length > 0) return 3;
    if (file) return 2;
    return 1;
  }, [result, loading, file, isReadyToImport, columns.length]);

  const activeWizardStep = useMemo(
    () => WIZARD_STEPS.find((s) => s.id === displayWizardStep),
    [displayWizardStep]
  );

  return (
    <div className={embedded ? "w-full min-w-0" : "min-h-screen bg-slate-50 px-4 py-4"}>
      <div className={embedded ? "w-full" : "mx-auto w-full max-w-[1500px]"}>
        <div
          className={
            embedded
              ? "overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md ring-1 ring-slate-900/5"
              : "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          }
        >
          {/* Nagłówek */}
          {!embedded ? (
            <div className="border-b border-slate-100 px-4 py-3">
              <h1 className="text-lg font-bold text-slate-800">{t.import_title}</h1>
              <p className="mt-0.5 text-sm text-slate-500">{t.import_subtitle}</p>
            </div>
          ) : null}

          {/* Typ importu — jedyny selektor typu na stronie */}
          <div
            className={`border-b border-slate-100 px-4 py-4 ${
              embedded ? "bg-gradient-to-b from-slate-50 via-white to-white" : "bg-slate-50/80 px-3 py-2.5"
            }`}
          >
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Typ danych</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {IMPORT_KIND_META.map((kind) => {
                const Icon = kind.icon;
                const isActive = kind.kind === settingsKind;
                return (
                  <Link
                    key={kind.kind}
                    to={kind.href}
                    className={`group inline-flex min-h-[3rem] items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm transition-all ${
                      isActive
                        ? "border-cyan-600 bg-cyan-50/50 text-cyan-950 shadow-md ring-2 ring-cyan-600/15"
                        : "border-slate-200/90 bg-white text-slate-600 hover:border-cyan-300 hover:bg-slate-50 hover:shadow-sm"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                        isActive
                          ? "border-cyan-200 bg-white text-cyan-700"
                          : "border-slate-200 bg-slate-50 text-slate-500 group-hover:border-cyan-200 group-hover:text-cyan-700"
                      }`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                    </span>
                    <span className={`min-w-0 truncate font-semibold ${isActive ? "text-cyan-950" : ""}`}>{kind.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Stepper */}
          <div className="border-b border-slate-100 bg-slate-50/40 px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Przebieg</p>
            <div className="flex flex-wrap gap-2">
              {WIZARD_STEPS.map((s) => (
                <div
                  key={s.id}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                    displayWizardStep === s.id
                      ? "border-cyan-600 bg-cyan-600 text-white shadow-sm"
                      : displayWizardStep > s.id
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                      displayWizardStep === s.id ? "bg-white/25 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {s.id}
                  </span>
                  {s.label}
                </div>
              ))}
            </div>
          </div>

          {/* Aktywny krok: plik i akcje */}
          <div className="border-b border-slate-100 px-4 py-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">
                {activeWizardStep ? `Krok ${activeWizardStep.id}: ${activeWizardStep.label}` : ""}
              </p>
              {loading ? <span className="text-xs font-medium text-cyan-700">Przetwarzanie…</span> : null}
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-stretch">
              <label className="flex min-h-[5.25rem] cursor-pointer flex-col justify-center gap-1 rounded-xl border-2 border-dashed border-cyan-200/90 bg-gradient-to-br from-cyan-50/40 via-white to-slate-50/30 px-4 py-3 shadow-inner transition hover:border-cyan-400 hover:from-cyan-50/70 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <input
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">{t.import_uploadFile}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-600">
                    {file ? `Wybrano: ${file.name}` : "CSV UTF-8 — przeciągnij plik lub kliknij, aby wybrać"}
                  </p>
                </div>
                <span className="mt-2 inline-flex shrink-0 self-start rounded-lg border border-cyan-100 bg-white px-3 py-1.5 text-xs font-bold text-cyan-900 shadow-sm sm:mt-0 sm:self-center">
                  Wybierz plik
                </span>
              </label>
              <div className="flex flex-wrap items-stretch gap-2 lg:flex-col lg:justify-center">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={!file || loading}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t.import_preview}
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!isReadyToImport || loading}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm ${
                    isReadyToImport ? "bg-emerald-600 text-white hover:bg-emerald-700" : "cursor-not-allowed bg-slate-200 text-slate-500"
                  } disabled:opacity-50`}
                >
                  {loading ? t.import_importing : t.import_import}
                </button>
              </div>
            </div>
          </div>

        {/* Mapowanie – dwie osobne sekcje: A = Produkty, B = Zamówienia (nagłówek + pozycje) */}
        {columns.length > 0 && (
          <div className="space-y-4 border-b border-slate-100 bg-slate-50/60 px-4 py-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.import_mapTitle}</h2>

            {settingsKind === "products" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {t.import_section_a ?? "Sekcja A"}
                  </span>
                  <span className="text-sm font-semibold text-slate-600">{t.import_product_data_mapping ?? "Mapowanie danych produktów"}</span>
                </div>
                <MappingSection
                  title={t.import_products}
                  fieldKeys={PRODUCT_FIELDS}
                  mapping={productsMapping}
                  columns={columns}
                  onMappingChange={setMapping("products")}
                  onClearSection={() => clearSection("products")}
                  onUseAll={useAllProducts}
                  getLabel={getLabel}
                  t={t}
                  defaultOpen={true}
                />
              </div>
            )}

            {settingsKind === "sets" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">Zestawy</span>
                  <span className="text-sm font-semibold text-slate-600">Mapowanie kolumn zestawów (wiersz = jedna pozycja składowa)</span>
                </div>
                <MappingSection
                  title="Zestawy (SKU zestawu + produkty składowe)"
                  fieldKeys={SET_IMPORT_FIELDS}
                  mapping={setsMapping}
                  columns={columns}
                  onMappingChange={setMapping("sets")}
                  onClearSection={() => clearSection("sets")}
                  onUseAll={useAllSets}
                  getLabel={getLabel}
                  t={t}
                  defaultOpen={true}
                />
              </div>
            )}

            {settingsKind === "orders" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {t.import_section_b ?? "Sekcja B"}
                  </span>
                  <span className="text-sm font-semibold text-slate-600">{t.import_order_data_mapping ?? "Mapowanie danych zamówień (nagłówek + pozycje)"}</span>
                </div>
                <p className="text-xs text-slate-500 px-1">
                  {t.import_order_relationship_hint ?? "Jedno zamówienie może zawierać wiele produktów (pozycje koszyka)."}
                </p>
                <MappingSection
                  title={t.import_order_section}
                  fieldKeys={ORDER_ORDER_FIELDS}
                  mapping={orderOrderMapping}
                  columns={columns}
                  onMappingChange={setMapping("orderOrder")}
                  onClearSection={() => clearSection("orderOrder")}
                  onUseAll={useAllOrderOrder}
                  getLabel={getLabel}
                  t={t}
                  defaultOpen={true}
                  orderCrossMaps={orderCrossMaps}
                  orderSectionId="orderOrder"
                />
                <MappingSection
                  title={t.import_cart_section}
                  fieldKeys={ORDER_CART_FIELDS}
                  mapping={orderCartMapping}
                  columns={columns}
                  onMappingChange={setMapping("orderCart")}
                  onClearSection={() => clearSection("orderCart")}
                  onUseAll={useAllOrderCart}
                  getLabel={getLabel}
                  t={t}
                  defaultOpen={false}
                  orderCrossMaps={orderCrossMaps}
                  orderSectionId="orderCart"
                />
                <MappingSection
                  title={t.import_address_section}
                  fieldKeys={ADDRESS_FIELDS}
                  mapping={addressMapping}
                  columns={columns}
                  onMappingChange={setMapping("address")}
                  onClearSection={() => clearSection("address")}
                  onUseAll={useAllAddress}
                  getLabel={getLabel}
                  t={t}
                  defaultOpen={false}
                  orderCrossMaps={orderCrossMaps}
                  orderSectionId="address"
                />
                <MappingSection
                  title={t.import_payment_section}
                  fieldKeys={PAYMENT_FIELDS}
                  mapping={paymentMapping}
                  columns={columns}
                  onMappingChange={setMapping("payment")}
                  onClearSection={() => clearSection("payment")}
                  onUseAll={useAllPayment}
                  getLabel={getLabel}
                  t={t}
                  orderCrossMaps={orderCrossMaps}
                  orderSectionId="payment"
                />
              </div>
            )}
            {settingsKind === "manufacturers" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Producenci
                  </span>
                  <span className="text-sm font-semibold text-slate-600">
                  Mapowanie danych producentów
                  </span>
                </div>

                <MappingSection
                  title="Producenci"
                  fieldKeys={[
                    "name",
                    "code",
                    "full_company_name",
                    "tax_id",
                    "email",
                    "phone",
                    "website",
                    "logo",
                    "description",
                    "address",
                  ]}
                  mapping={productsMapping}
                  columns={columns}
                  onMappingChange={setMapping("products")}
                  onClearSection={() => clearSection("products")}
                  onUseAll={useAllProducts}
                  getLabel={getLabel}
                  t={t}
                  defaultOpen={true}
                />
              </div>
            )}

            {settingsKind === "customers" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 px-1">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">Klienci</span>
                  <span className="text-sm font-semibold text-slate-700">
                    Mapowanie pól klientów (identyfikacja po ID lub e-mailu)
                  </span>
                </div>
                <MappingSection
                  title="Dane klienta i adres domyślny"
                  fieldKeys={[...CUSTOMER_IMPORT_FIELDS]}
                  mapping={customersMapping}
                  columns={columns}
                  onMappingChange={setMapping("customers")}
                  onClearSection={() => clearSection("customers")}
                  onUseAll={useAllCustomers}
                  getLabel={getLabel}
                  t={t}
                  defaultOpen={true}
                />
              </div>
            )}
          </div>
        )}

        {/* Podgląd tabeli */}
        {preview.length > 0 && (
          <div className="border-t border-slate-100 bg-white">
            <div className="border-b border-slate-100 bg-slate-50/70 px-3 py-2">
              <h3 className="text-sm font-bold text-slate-800">{t.import_previewData}</h3>
            </div>
            <div className="max-h-80 overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    {columns.map((col) => (
                      <th key={col} className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      {columns.map((col) => (
                        <td key={col} className="px-3 py-1.5 text-slate-600">
                          {String((row as Record<string, unknown>)[col] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result != null ? (
          <div className="border-t border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-sm text-emerald-900">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}
