import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { WmsPackingOrderLineApi } from "../../api/wmsPackingApi";
import { WMS_ROUTES } from "../../pages/wms/wmsRoutes";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

function plProduktyWord(n: number): string {
  const abs = Math.abs(Math.floor(n));
  if (abs === 1) return "produkt";
  const mod100 = abs % 100;
  if (mod100 >= 12 && mod100 <= 14) return "produktów";
  const mod10 = abs % 10;
  if (mod10 >= 2 && mod10 <= 4) return "produkty";
  return "produktów";
}

type Props = {
  tenantId: number;
  orderId: number;
  lines: WmsPackingOrderLineApi[];
  /** order_item_id → flaga z GET /orders (metadata) — zarezerwowane na przyszłe skróty. */
  itemWaitingById: Map<number, boolean>;
  onRefreshOrder: () => void | Promise<void>;
  onRefreshWms: () => void | Promise<void>;
  /** Kotwica do przewinięcia z tabeli „Kompletacja”. */
  sectionDomId?: string;
};

/**
 * Kompaktowe podsumowanie braków + skróty do WMS; szczegóły i akcje tylko w tabeli poniżej.
 */
export default function OrderMissingProductsSection({
  tenantId: _tenantId,
  orderId,
  lines,
  itemWaitingById: _itemWaitingById,
  onRefreshOrder,
  onRefreshWms,
  sectionDomId,
}: Props) {
  void _tenantId;
  void _itemWaitingById;
  void onRefreshOrder;
  void onRefreshWms;
  const shortageLines = useMemo(
    () => lines.filter((l) => (Number(l.missing_quantity ?? 0) || 0) > 1e-6),
    [lines],
  );

  const totals = useMemo(() => {
    let totalMissing = 0;
    for (const l of shortageLines) totalMissing += Number(l.missing_quantity ?? 0) || 0;
    return { totalMissing, lineCount: shortageLines.length };
  }, [shortageLines]);

  if (shortageLines.length === 0) return null;

  return (
    <section
      id={sectionDomId}
      className="mb-6 rounded-xl border border-red-200/90 bg-red-50/35 px-4 py-3 shadow-sm sm:px-5 sm:py-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-red-950/90">Braki z WMS</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            BRAKI: {totals.lineCount} {plProduktyWord(totals.lineCount)} / {fmtQty(totals.totalMissing)} szt.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={WMS_ROUTES.braki(orderId)}
            className="inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Przejdź do WMS
          </Link>
        </div>
      </div>
    </section>
  );
}
