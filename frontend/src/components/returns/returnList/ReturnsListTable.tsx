import { memo, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Eye, ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";

import {
  OperationalActionButton,
  OperationalActionColumn,
  OperationalActionLink,
  panelListDenseCheckboxInputClass,
  panelListDenseRowClass,
  panelListDenseRowSelectedClass,
} from "../../operational";
import { PanelListDenseProductCell } from "../../panelList/PanelListDenseProductCell";
import { firstProductImageUrl } from "../../panelList/ProductListItem";
import { listSellasistInputClass } from "../../listPage/listSellasistTokens";
import { ORDERS_PANEL_GROUP_LABELS } from "../../orders/OrderStatusSidebar";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import { resolveDamageMediaUrl } from "../../../utils/resolveDamageMediaUrl";
import { displayWarehouseDocumentNumber } from "../../../utils/warehouseDocumentNumberDisplay";
import { panelSidebarSubRowStyleRich } from "../../../utils/panelSidebarHierarchy";
import type { PanelConfigurableUiStatusBrief } from "../../../utils/panelListStatusBriefMappers";
import { returnUiStatusBriefToPanelBrief, returnWorkflowStatusToPanelBrief } from "../../../utils/panelListStatusBriefMappers";
import type { ReturnUiStatusPanelSummary, WmsReturnListItem } from "../../../types/wmsReturn";
import type { PanelBulkSelectionMode } from "../../../hooks/usePanelListBulkSelection";

const TH = "px-4 py-3 text-left text-xs font-medium text-slate-400";
const TD = "px-4 py-4 align-top text-sm text-slate-800";

const RETURNS_LIST_ROW_ARCHIVED_CLASS =
  "bg-emerald-50/40 [&_.returns-list-row-actions]:opacity-[0.72] [&_.returns-list-row-actions]:saturate-[0.88]";

const KNOWN_SOURCE_LABEL: Record<string, string> = {
  allegro: "Allegro",
  ebay: "eBay",
  amazon: "Amazon",
  empik: "Empik",
  shoper: "Shoper",
  woocommerce: "WooCommerce",
  prestashop: "PrestaShop",
  bricklink: "Bricklink",
};

function normalizeOrderSourceDisplay(raw?: string | null): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "—";
  const low = s.toLowerCase();
  if (KNOWN_SOURCE_LABEL[low]) return KNOWN_SOURCE_LABEL[low];
  const spaced = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  if (spaced !== s) {
    return spaced
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  if (/[\s_\-]+/.test(s)) {
    return s
      .split(/[\s_\-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return s.length > 1 ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s.toUpperCase();
}

function formatReturnDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return "—";
  }
}

function returnTypeBadgeLabel(t?: WmsReturnListItem["return_type"]): string {
  if (t === "UNCLAIMED") return "Nieodebrana";
  return "RMA";
}

function formatPlnAlways(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(n);
  } catch {
    return `${n.toFixed(2)} PLN`;
  }
}

function panelListRefundTotalPln(r: WmsReturnListItem): string {
  const pre = r.total_refund_amount;
  if (pre != null && Number.isFinite(Number(pre))) {
    return formatPlnAlways(Number(pre));
  }
  const ref = r.refund;
  let total = 0;
  if (ref?.refund_amount != null && Number.isFinite(Number(ref.refund_amount))) {
    total += Number(ref.refund_amount);
  }
  if (ref?.refund_shipping) {
    const sa = ref.refund_shipping_amount;
    if (sa != null && Number.isFinite(Number(sa))) {
      total += Number(sa);
    } else if (r.shipping_cost != null && Number.isFinite(Number(r.shipping_cost))) {
      total += Number(r.shipping_cost);
    }
  }
  return formatPlnAlways(total);
}

function firstImageUrl(imageUrl: string | null | undefined): string | null {
  const raw = firstProductImageUrl(imageUrl);
  return raw ? resolveDamageMediaUrl(raw) : null;
}

function returnListRowStatusPillStyle(brief: PanelConfigurableUiStatusBrief): CSSProperties {
  const base = panelSidebarSubRowStyleRich(brief, brief.main_group, false, {
    barWidthPx: 0,
    inlineLabel: true,
  });
  return { ...base, borderLeft: "none" };
}

function isReturnsListRowArchivedTone(r: WmsReturnListItem): boolean {
  const wfDone = r.status.type === "done_success" || r.status.type === "done_rejected";
  const panelDone = r.ui_status?.main_group === "DONE";
  return wfDone || panelDone;
}

const ReturnsListRowStatusBadges = memo(function ReturnsListRowStatusBadges({ r }: { r: WmsReturnListItem }) {
  const wfBrief = returnWorkflowStatusToPanelBrief(r.status);
  const uiBrief = r.ui_status ? returnUiStatusBriefToPanelBrief(r.ui_status) : null;
  const uiTerminal = r.ui_status?.main_group === "DONE";
  const wfTerminal = r.status.type === "done_success" || r.status.type === "done_rejected";
  const wfPositive = r.status.type === "done_success";
  const labelUpper = (name: string) => name.trim().toUpperCase();

  return (
    <div className="flex flex-col gap-1" aria-label="Status zwrotu">
      {uiBrief ? (
        <span
          className="inline-flex max-w-[min(100%,14rem)] items-center gap-0.5 rounded-full border px-2.5 py-1 text-xs font-medium"
          style={returnListRowStatusPillStyle(uiBrief)}
          title={uiBrief.name}
        >
          {uiTerminal ? (
            <span className="shrink-0 text-emerald-800/80" aria-hidden>
              ✓
            </span>
          ) : null}
          <span className="min-w-0 truncate">{labelUpper(uiBrief.name)}</span>
        </span>
      ) : (
        <span className="inline-flex rounded-full border border-dashed border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400">
          Bez etykiety
        </span>
      )}
      <span
        className="inline-flex max-w-[min(100%,14rem)] items-center gap-0.5 rounded-full border px-2.5 py-1 text-xs font-medium"
        style={returnListRowStatusPillStyle(wfBrief)}
        title={wfBrief.name}
      >
        {wfTerminal ? (
          <span className={`shrink-0 ${wfPositive ? "text-emerald-800/80" : "text-slate-600/85"}`} aria-hidden>
            ✓
          </span>
        ) : null}
        <span className="min-w-0 truncate">{labelUpper(wfBrief.name)}</span>
      </span>
    </div>
  );
});

type RowProps = {
  r: WmsReturnListItem;
  selected: boolean;
  rowBusy: boolean;
  onOpenDetail: (id: number) => void;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onDelete: (id: number) => void;
};

const ReturnsListTableRow = memo(function ReturnsListTableRow({
  r,
  selected,
  rowBusy,
  onOpenDetail,
  onToggleSelect,
  onDelete,
}: RowProps) {
  const lineCount = r.lines?.length ?? 0;
  const previews = r.lines_preview ?? [];
  const more = Math.max(0, lineCount - previews.length);
  const custParts = [(r.first_name || "").trim(), (r.last_name || "").trim()].filter(Boolean);
  const cust = custParts.length ? custParts.join(" ") : "—";
  const srcDisp = normalizeOrderSourceDisplay(r.source);
  const srcIsEmpty = srcDisp === "—";
  const rowArchived = isReturnsListRowArchivedTone(r);
  const displayLines = previews.map((pv) => ({
    quantity: pv.quantity,
    name: pv.name,
    ean: pv.ean,
    sku: pv.sku,
    image_url: firstImageUrl(pv.image_url) ?? undefined,
  }));

  return (
    <tr
      className={`group border-b border-slate-50 transition-colors hover:bg-slate-50/50 ${rowArchived ? RETURNS_LIST_ROW_ARCHIVED_CLASS : ""} ${selected ? panelListDenseRowSelectedClass : panelListDenseRowClass}`}
      onClick={() => onOpenDetail(r.id)}
    >
      <td className={`${TD} w-12 text-center`} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          disabled={rowBusy}
          onChange={(e) => onToggleSelect(String(r.id), (e.nativeEvent as MouseEvent).shiftKey ?? false)}
          className={panelListDenseCheckboxInputClass}
          aria-label={`Zaznacz zwrot ${displayWarehouseDocumentNumber(r.rmz_number) || r.rmz_number}`}
        />
      </td>
      <td className={`${TD} min-w-[11rem]`}>
        <div className="font-medium text-slate-900 hover:underline">
          #{displayWarehouseDocumentNumber(r.rmz_number) || r.rmz_number}
        </div>
        <div className="mt-1 text-xs text-slate-400">{formatReturnDate(r.created_at)}</div>
        {r.warehouse_document_id != null && r.warehouse_document_number ? (
          <Link
            to={`/wms/putaway/${r.warehouse_document_id}`}
            className="mt-1 block text-xs font-medium text-slate-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {displayWarehouseDocumentNumber(r.warehouse_document_number)}
          </Link>
        ) : null}
      </td>
      <td className={`${TD} min-w-[10rem]`}>
        <ReturnsListRowStatusBadges r={r} />
      </td>
      <td className={`${TD} min-w-[12rem] whitespace-normal`}>
        <PanelListDenseProductCell lines={displayLines} more={more} />
      </td>
      <td className={`${TD} min-w-[10rem] whitespace-normal break-words text-slate-600`}>{cust}</td>
      <td className={TD}>
        <span
          className={`inline-flex items-center rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-xs font-medium ${srcIsEmpty ? "text-slate-400" : "text-slate-500"}`}
        >
          {srcIsEmpty ? "—" : srcDisp}
        </span>
      </td>
      <td className={`${TD} text-right`}>
        <div className="font-medium tabular-nums text-slate-900">{panelListRefundTotalPln(r)}</div>
        <div className="mt-1 text-xs text-slate-400">{returnTypeBadgeLabel(r.return_type)}</div>
      </td>
      <td className={`${TD} text-center`} onClick={(e) => e.stopPropagation()}>
        <div className="returns-list-row-actions opacity-0 transition-opacity group-hover:opacity-100">
          <OperationalActionColumn
            aria-label="Akcje zwrotu"
            slots={[
            <OperationalActionLink
              key="eye"
              to={`/orders/returns/${r.id}`}
              title="Szczegóły"
              aria-label="Szczegóły zwrotu"
              onClick={(e) => e.stopPropagation()}
            >
              <Eye className="text-slate-600" strokeWidth={2} aria-hidden />
            </OperationalActionLink>,
            <OperationalActionLink
              key="wms"
              to={WMS_ROUTES.returnsProcess(r.id)}
              target="_blank"
              rel="noopener noreferrer"
              title="Terminal WMS (nowa karta)"
              aria-label="Obsłuż zwrot w terminalu WMS"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="text-slate-600" strokeWidth={2} aria-hidden />
            </OperationalActionLink>,
            <OperationalActionButton
              key="del"
              variant="danger"
              title="Archiwizuj zwrot"
              aria-label="Archiwizuj zwrot"
              disabled={rowBusy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(r.id);
              }}
            >
              <Trash2 strokeWidth={2} aria-hidden />
            </OperationalActionButton>,
            ]}
          />
        </div>
        <button
          type="button"
          className="ml-1 inline-flex rounded-md p-1.5 text-slate-300 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-900 group-hover:opacity-100 lg:hidden"
          aria-label="Więcej akcji"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
});

export type ReturnsListTableProps = {
  loading: boolean;
  effectiveWarehouseId: number | null;
  panelSummary: ReturnUiStatusPanelSummary | null;
  bulkBusy: boolean;
  bulkToolbarDisabled: boolean;
  bulkSelectMenuKey: number;
  effectiveSelectionCount: number;
  bulkSelectionMode: PanelBulkSelectionMode;
  headerChecked: boolean;
  headerIndeterminate: boolean;
  isRowSelected: (id: string) => boolean;
  selectAllOnPage: () => void;
  toggleOne: (id: string, shiftKey: boolean) => void;
  clearSelection: () => void;
  onBulkSelectMenuKeyBump: () => void;
  onBulkStatusConfirm: (status: string, label: string) => void;
  onBulkDelete: () => void;
  onOpenDetail: (id: number) => void;
  onDeleteSingle: (id: number) => void;
  resolveBulkReturnStatusLabel: (statusVal: string) => string;
};

function ReturnsListTableInner({
  rows,
  loading,
  effectiveWarehouseId,
  panelSummary,
  bulkBusy,
  bulkToolbarDisabled,
  bulkSelectMenuKey,
  effectiveSelectionCount,
  bulkSelectionMode,
  headerChecked,
  headerIndeterminate,
  isRowSelected,
  selectAllOnPage,
  toggleOne,
  clearSelection,
  onBulkSelectMenuKeyBump,
  onBulkStatusConfirm,
  onBulkDelete,
  onOpenDetail,
  onDeleteSingle,
  resolveBulkReturnStatusLabel,
}: ReturnsListTableProps) {
  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Ładowanie…</div>;
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {effectiveWarehouseId != null ? (
        <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
          <select
            key={bulkSelectMenuKey}
            defaultValue=""
            disabled={bulkBusy}
            aria-label="Opcje zaznaczania listy zwrotów"
            className={`${listSellasistInputClass} !h-9 max-w-[11rem] shrink-0 text-sm`}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "page") selectAllOnPage();
              else if (v === "clear") {
                clearSelection();
                onBulkSelectMenuKeyBump();
              }
              e.target.value = "";
            }}
          >
            <option value="">Zaznacz…</option>
            <option value="page">Strona</option>
            <option value="clear">Odznacz</option>
          </select>
          {(headerChecked || headerIndeterminate) && (
            <span className="hidden shrink-0 text-xs text-slate-500 lg:inline" aria-live="polite">
              {bulkSelectionMode === "filtered_all" ? "Pełny zbiór wg filtrów" : headerChecked ? "Strona" : "Częściowo"}
            </span>
          )}
          <span className="shrink-0 text-xs text-slate-500">wykonaj</span>
          <select
            key={`${bulkSelectMenuKey}-st`}
            disabled={bulkToolbarDisabled}
            defaultValue=""
            className={`${listSellasistInputClass} !h-9 max-w-[14rem] shrink-0 text-xs disabled:opacity-40`}
            aria-label="Zmień status panelu dla zaznaczonych zwrotów"
            onChange={(e) => {
              const v = e.target.value;
              e.target.selectedIndex = 0;
              if (!v || effectiveSelectionCount === 0) return;
              if (v === "__clear__") {
                onBulkStatusConfirm("", resolveBulkReturnStatusLabel(""));
                return;
              }
              onBulkStatusConfirm(v, resolveBulkReturnStatusLabel(v));
            }}
          >
            <option value="" disabled>
              Wybierz akcję
            </option>
            <option value="__clear__">Bez etykiety (wyczyść)</option>
            {(panelSummary?.groups ?? []).map((block) => (
              <optgroup key={block.main_group} label={ORDERS_PANEL_GROUP_LABELS[block.main_group]}>
                {block.sub_statuses.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="hidden shrink-0 text-[11px] font-medium tabular-nums text-slate-500 sm:inline">
            ({effectiveSelectionCount})
          </span>
          <button
            type="button"
            onClick={onBulkDelete}
            disabled={bulkToolbarDisabled}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-red-200 bg-red-50 px-2 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-40"
          >
            Usuń
          </button>
          <button
            type="button"
            disabled={bulkToolbarDisabled}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            onClick={() => {
              clearSelection();
              onBulkSelectMenuKeyBump();
            }}
          >
            Odznacz
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-slate-500">Brak zwrotów do wyświetlenia.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm whitespace-nowrap">
            <thead className="border-b border-slate-100 bg-white">
              <tr>
                <th className={`${TH} w-12 text-center`}>
                  <span className="sr-only">Zaznacz</span>
                </th>
                <th className={TH}>Zwrot / ID</th>
                <th className={TH}>Status</th>
                <th className={`${TH} w-1/3`}>Produkty</th>
                <th className={TH}>Klient</th>
                <th className={TH}>Kanał</th>
                <th className={`${TH} text-right`}>Wartość</th>
                <th className={`${TH} text-center`}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <ReturnsListTableRow
                  key={r.id}
                  r={r}
                  selected={isRowSelected(String(r.id))}
                  rowBusy={bulkBusy}
                  onOpenDetail={onOpenDetail}
                  onToggleSelect={toggleOne}
                  onDelete={onDeleteSingle}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm text-slate-400">
          <div>
            Pokazano 1 do {rows.length} z {rows.length} wpisów (limit serwera 500)
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const ReturnsListTable = memo(ReturnsListTableInner);
