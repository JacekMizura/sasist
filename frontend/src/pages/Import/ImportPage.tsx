import { useState, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../../api/axios";
import { useTranslation } from "../../locales";
import type { Translations } from "../../locales";
import {
  PRODUCT_FIELDS,
  ORDER_ORDER_FIELDS,
  ORDER_CART_FIELDS,
  ADDRESS_FIELDS,
  PAYMENT_FIELDS,
  normalizeHeader,
  PRODUCT_HEADER_ALIASES,
  ORDER_ORDER_HEADER_ALIASES,
  ORDER_CART_HEADER_ALIASES,
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
}: MappingSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const mappedCount = fieldKeys.filter((k) => mapping[k]).length;
  const allMapped = mappedCount === fieldKeys.length;
  const someMapped = mappedCount > 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <ChevronIcon open={open} />
          <span className="font-bold text-slate-800">{title}</span>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
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
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 text-[11px] font-bold transition-colors"
          >
            {t.import_useAll}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {fieldKeys.map((key) => {
              const mappedElsewhere = new Set(
                Object.entries(mapping)
                  .filter(([k]) => k !== key && mapping[k])
                  .map(([, v]) => v)
              );
              const availableColumns = columns.filter(
                (col) => mapping[key] === col || !mappedElsewhere.has(col)
              );
              return (
                <div
                  key={key}
                  className="flex items-center gap-4 py-2 px-3 rounded-lg bg-white border border-slate-100"
                >
                  <span className="w-56 text-sm font-medium text-slate-700 shrink-0">
                    {getLabel(key)}
                  </span>
                  <select
                    className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
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

export type ImportPageProps = { defaultType?: "products" | "orders" };

/** Zakładka Import: tło slate-50, karty białe z cieniem; typ importu, plik, podgląd, sekcje mapowania (accordion) i podgląd tabeli. */
export default function ImportPage({ defaultType = "products" }: ImportPageProps = {}) {
  const t = useTranslation();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [type, setType] = useState<"products" | "orders">(defaultType);

  const [productsMapping, setProductsMapping] = useState<Record<string, string>>({});
  const [orderOrderMapping, setOrderOrderMapping] = useState<Record<string, string>>({});
  const [orderCartMapping, setOrderCartMapping] = useState<Record<string, string>>({});
  const [addressMapping, setAddressMapping] = useState<Record<string, string>>({});
  const [paymentMapping, setPaymentMapping] = useState<Record<string, string>>({});


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
        const savedProducts = loadSavedMapping(STORAGE_KEY_PRODUCTS);
        const savedOrderOrder = loadSavedMapping(STORAGE_KEY_ORDER_ORDER);
        const savedOrderCart = loadSavedMapping(STORAGE_KEY_ORDER_CART);
        setProductsMapping(mergeWithColumns(suggestedProducts, cols, savedProducts));
        setOrderOrderMapping(mergeWithColumns(suggestedOrderOrder, cols, savedOrderOrder));
        setOrderCartMapping(mergeWithColumns(suggestedOrderCart, cols, savedOrderCart));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const columnMap =
        type === "products"
          ? productsMapping
          : { ...orderOrderMapping, ...orderCartMapping };
      formData.append("column_map", JSON.stringify(columnMap));
      const url =
        type === "products"
          ? "/import/products/?tenant_id=1"
          : "/import/orders/?tenant_id=1&warehouse_id=1";
      const res = await api.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data as Record<string, unknown>);
      alert(t.import_done);
      if (res.status === 200 || res.status === 201) {
        if (type === "orders") navigate("/orders/list");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const setMapping = useCallback(
    (section: "products" | "orderOrder" | "orderCart" | "address" | "payment") =>
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
        }
      },
    []
  );

  const clearSection = useCallback(
    (section: "products" | "orderOrder" | "orderCart" | "address" | "payment") => {
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
      }
    },
    []
  );

  const useAllProducts = useCallback(() => {
    const m = autoMap(PRODUCT_FIELDS, columns, getLabel);
    setProductsMapping(m);
  }, [columns, getLabel]);

  const useAllOrderOrder = useCallback(() => {
    setOrderOrderMapping(autoMap(ORDER_ORDER_FIELDS, columns, getLabel));
  }, [columns, getLabel]);

  const useAllOrderCart = useCallback(() => {
    setOrderCartMapping(autoMap(ORDER_CART_FIELDS, columns, getLabel));
  }, [columns, getLabel]);

  const useAllAddress = useCallback(() => {
    setAddressMapping(autoMap(ADDRESS_FIELDS, columns, getLabel));
  }, [columns, getLabel]);

  const useAllPayment = useCallback(() => {
    setPaymentMapping(autoMap(PAYMENT_FIELDS, columns, getLabel));
  }, [columns, getLabel]);

  const isReadyToImport = file !== null && (type === "products" ? Object.keys(productsMapping).length > 0 : Object.keys(orderOrderMapping).length > 0 || Object.keys(orderCartMapping).length > 0);

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

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Nagłówek i kroki */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">{t.import_title}</h1>
          <p className="text-sm text-slate-500 mb-6">{t.import_subtitle}</p>

          {/* Typ importu + Historia importów */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button
              type="button"
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                type === "products"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              onClick={() => setType("products")}
            >
              {t.import_products}
            </button>
            <button
              type="button"
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                type === "orders"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              onClick={() => setType("orders")}
            >
              {t.import_orders}
            </button>
            <Link
              to="/import/history"
              className="px-4 py-2 rounded-lg font-semibold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              Historia importów
            </Link>
          </div>

          {/* Plik i przyciski */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors text-sm font-medium text-slate-700">
              <input
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {t.import_uploadFile}
            </label>
            <button
              type="button"
              onClick={handlePreview}
              disabled={!file || loading}
              className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t.import_preview}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!isReadyToImport || loading}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                isReadyToImport ? "bg-green-600 text-white hover:bg-green-700" : "bg-slate-200 text-slate-500 cursor-not-allowed"
              } disabled:opacity-50`}
            >
              {loading ? t.import_importing : t.import_import}
            </button>
          </div>
        </div>

        {/* Mapowanie – dwie osobne sekcje: A = Produkty, B = Zamówienia (nagłówek + pozycje) */}
        {columns.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-800 px-1">{t.import_mapTitle}</h2>

            {type === "products" && (
              <div className="space-y-4">
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

            {type === "orders" && (
              <div className="space-y-4">
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
                />
              </div>
            )}
          </div>
        )}

        {/* Podgląd tabeli */}
        {preview.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{t.import_previewData}</h3>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    {columns.map((col) => (
                      <th key={col} className="text-left px-4 py-2 border-b border-slate-200 font-semibold text-slate-700">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                      {columns.map((col) => (
                        <td key={col} className="px-4 py-2 text-slate-600">
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
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
            <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
