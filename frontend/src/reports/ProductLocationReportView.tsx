import type { ProductLocationReportData } from "../pdf/utils/productLocationReportDataBuilder";
import { getStorageTypeLabel } from "../utils/storageTypeLabels";

export type ProductLocationReportViewProps = {
  data: ProductLocationReportData;
};

function storageBadgeForProduct(product: ProductLocationReportData["productsSorted"][number]) {
  const kinds = new Set(product.locations.map((l) => String(l.storageType || "").toUpperCase()));
  if (kinds.size === 1 && kinds.has("PRIMARY")) {
    return {
      label: getStorageTypeLabel("primary"),
      className: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }
  if (kinds.size === 1 && kinds.has("RESERVE")) {
    return {
      label: getStorageTypeLabel("reserve"),
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  return {
    label: getStorageTypeLabel("mixed"),
    className: "border-violet-200 bg-violet-50 text-violet-700",
  };
}

export function ProductLocationReportView({ data }: ProductLocationReportViewProps) {
  return (
    <div className="w-full bg-white px-4 py-6 text-slate-900 sm:px-6 print:px-4 print:py-4">
      <style>{`
        @media print {
          html, body, #root { background: #fff !important; }
          .report-card { box-shadow: none !important; background: #fff !important; }
          .page-break { page-break-before: always; break-before: page; }
          .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <div className="grid gap-5">
        <header className="space-y-2 border-b border-slate-200 pb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Raport lokalizacji produktów</h1>
          <p className="text-sm text-slate-600">
            {data.warehouseName} <span className="text-slate-300">·</span> {data.exportDate}
          </p>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="report-card break-inside-avoid rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-2xl font-semibold tabular-nums">{data.summary.totalProducts}</p>
            <p className="mt-1 text-xs text-slate-500">Liczba produktów</p>
          </div>
          <div className="report-card break-inside-avoid rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-2xl font-semibold tabular-nums">{data.summary.averageLocationsPerProduct.toFixed(2)}</p>
            <p className="mt-1 text-xs text-slate-500">Średnia lokalizacji / produkt</p>
          </div>
          <div className="report-card break-inside-avoid rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-base font-semibold">
              {data.summary.mostDistributedProduct?.name ?? "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Najbardziej rozproszony ({data.summary.mostDistributedProduct?.locationCount ?? 0} lok.)
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="report-card break-inside-avoid rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <p className="text-2xl font-semibold tabular-nums">{data.summary.filterCounts.multiLocationProducts}</p>
            <p className="mt-1 text-xs text-slate-500">Wielolokalizacyjne</p>
          </div>
          <div className="report-card break-inside-avoid rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <p className="text-2xl font-semibold tabular-nums">{data.summary.filterCounts.productsWithoutLocation}</p>
            <p className="mt-1 text-xs text-slate-500">Bez lokalizacji</p>
          </div>
          <div className="report-card break-inside-avoid rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <p className="text-2xl font-semibold tabular-nums">{data.summary.filterCounts.reserveStorageProducts}</p>
            <p className="mt-1 text-xs text-slate-500">Zapasowe</p>
          </div>
        </section>

        <section className="page-break space-y-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Najbardziej rozproszone</div>
          {data.productsSorted.map((product) => (
            <article key={product.productId} className="report-card break-inside-avoid rounded-xl border border-slate-200 p-3.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Produkt: {product.name}</h2>
                <div className="flex items-center gap-2">
                  {product.sku?.trim() ? <span className="text-xs text-slate-500">SKU: {product.sku}</span> : null}
                  {(() => {
                    const badge = storageBadgeForProduct(product);
                    return (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${badge.className}`}>
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-xs">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-lg font-semibold tabular-nums text-slate-900">{product.locationCount}</p>
                  <p className="text-[11px] text-slate-500">Lokalizacje</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-lg font-semibold tabular-nums text-slate-900">{product.totalQuantity}</p>
                  <p className="text-[11px] text-slate-500">Łącznie szt.</p>
                </div>
              </div>
              {product.locations.length === 0 ? (
                <p className="mt-3 text-sm italic text-slate-500">Brak przypisanej lokalizacji</p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-1.5 overflow-hidden text-xs text-slate-700">
                  {product.locations.map((loc) => (
                    <li
                      key={`${product.productId}-${loc.locationUuid}`}
                      className="max-w-full break-words rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium"
                    >
                      {loc.locationLabel} | {loc.quantity} szt | {getStorageTypeLabel(loc.storageType)}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
