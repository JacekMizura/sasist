import { memo } from "react";
import { Eye, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import type { ComplaintListItem } from "../../types/complaint";
import { complaintDefectLabel } from "../../constants/complaintDefectTags";
import { ReturnsListProductCell } from "../returns/returnList/ReturnsListProductCell";
import {
  ModuleListRowActionsCell,
  ModuleListStatusPill,
  moduleListEmptyStateClass,
  moduleListRowClass,
  moduleListRowSelectedClass,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
} from "../listPage/moduleList";
import {
  OperationalActionButton,
  OperationalActionColumn,
  OperationalActionLink,
  panelListDenseCheckboxInputClass,
} from "../operational";
import ComplaintResponseDeadlineBanner from "../../pages/Complaints/ComplaintResponseDeadlineBanner";
import { complaintRawStatusToPanelBrief } from "../../utils/panelListStatusBriefMappers";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";

const TD = moduleListTdClass;
const TH = moduleListThClass;

/** Jak Zwroty: lekki ton dla zamkniętych / terminalnych pozycji (DONE). */
const COMPLAINTS_LIST_ROW_DONE_CLASS =
  "bg-emerald-50/40 [&_.module-list-row-actions]:opacity-[0.72] [&_.module-list-row-actions]:saturate-[0.88]";

const DEFECT_TAGS_MAX = 3;

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return "—";
  }
}

function ComplaintListDefectTags({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  const showIds = ids.slice(0, DEFECT_TAGS_MAX);
  const extra = ids.length - DEFECT_TAGS_MAX;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {showIds.map((id) => (
        <span
          key={id}
          className="inline-flex max-w-[12rem] truncate rounded-md bg-slate-100/90 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200/80"
        >
          {complaintDefectLabel(id)}
        </span>
      ))}
      {extra > 0 ? (
        <span className="rounded-md bg-slate-200/90 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-800">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

export type ComplaintsListTableProps = {
  rows: ComplaintListItem[];
  isRowSelected: (id: string) => boolean;
  toggleOne: (id: string, shiftKey: boolean) => void;
  deletingId: number | null;
  onDelete: (row: ComplaintListItem) => void;
  onNewComplaint: () => void;
};

function ComplaintsListTableInner({
  rows,
  isRowSelected,
  toggleOne,
  deletingId,
  onDelete,
  onNewComplaint,
}: ComplaintsListTableProps) {
  const navigate = useNavigate();

  if (rows.length === 0) {
    return (
      <div className={moduleListEmptyStateClass}>
        <p>Brak reklamacji. Zmień filtr lub utwórz pierwszą reklamację.</p>
        <button type="button" onClick={onNewComplaint} className={`${brandPrimaryButtonClass} mt-4`}>
          Nowa reklamacja
        </button>
      </div>
    );
  }

  return (
    <div className={moduleListTableScrollClass}>
      <table className={moduleListTableClass} data-testid="complaints-list-table">
        <thead className={moduleListTheadClass}>
          <tr>
            <th className={`${TH} w-12 text-center`}>
              <span className="sr-only">Zaznacz</span>
            </th>
            <th className={TH}>Reklamacja / ID</th>
            <th className={TH}>Status</th>
            <th className={`${TH} w-1/3`}>Produkty</th>
            <th className={TH}>Klient</th>
            <th className={`${TH} text-right`}>Termin</th>
            <th className={`${TH} text-center`}>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const statusBrief = complaintRawStatusToPanelBrief(r.status);
            const img = (r.product_image_url ?? "").trim() || null;
            const productTitle = (r.product_name ?? "").trim() || (r.title ?? "").trim() || "—";
            const qtyRaw = r.line_quantity;
            const qty =
              qtyRaw != null && Number.isFinite(Number(qtyRaw)) ? Math.max(1, Math.floor(Number(qtyRaw))) : 1;
            const defectIds = Array.isArray(r.defect_ids) ? r.defect_ids : [];
            const reasonFull = (r.customer_reason ?? "").trim();
            const customerDisp = (r.customer_name ?? "").trim();
            const phoneDisp = (r.customer_phone ?? "").trim();
            const emailDisp = (r.customer_email ?? "").trim();
            const orderMeta =
              r.order_number != null && String(r.order_number).trim()
                ? `#${String(r.order_number).trim()}`
                : r.order_id != null
                  ? `ID ${r.order_id}`
                  : null;
            const legalAuto = Boolean(r.accepted_by_law || r.auto_accepted);
            const statusContextTitle = legalAuto ? "Uznana automatycznie" : undefined;
            const selected = isRowSelected(String(r.id));
            const uiTerminal = statusBrief.main_group === "DONE";

            const productTrailing = (
              <>
                {defectIds.length > 0 ? (
                  <div className="mt-1">
                    <ComplaintListDefectTags ids={defectIds} />
                  </div>
                ) : null}
                {reasonFull ? (
                  <p className="mt-1 line-clamp-2 break-words text-[11px] leading-snug text-slate-600" title={reasonFull}>
                    <span className="font-semibold text-slate-700">Powód:</span> {reasonFull}
                  </p>
                ) : null}
              </>
            );

            return (
              <tr
                key={r.id}
                className={`${moduleListRowClass} ${uiTerminal ? COMPLAINTS_LIST_ROW_DONE_CLASS : ""} ${selected ? moduleListRowSelectedClass : ""}`}
                data-testid={`complaints-list-row-${r.id}`}
                onClick={() => navigate(`/complaints/${r.id}`)}
              >
                <td className={`${TD} w-12 text-center`} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => toggleOne(String(r.id), (e.nativeEvent as MouseEvent).shiftKey ?? false)}
                    className={panelListDenseCheckboxInputClass}
                    aria-label={`Zaznacz reklamację ${r.id}`}
                  />
                </td>
                <td className={`${TD} min-w-[11rem]`}>
                  <Link
                    to={`/complaints/${r.id}`}
                    className="font-medium text-slate-900 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    #{r.id}
                  </Link>
                  <div className="mt-1 text-xs text-slate-400">{formatWhen(r.created_at)}</div>
                  {r.reference_code ? (
                    <div className="mt-1 text-xs tabular-nums text-slate-500">{r.reference_code}</div>
                  ) : null}
                  {orderMeta ? (
                    <div className="mt-1 text-xs font-medium text-slate-600">Zam. {orderMeta}</div>
                  ) : null}
                </td>
                <td className={`${TD} min-w-[10rem]`} title={statusContextTitle}>
                  <ModuleListStatusPill status={statusBrief} terminal={uiTerminal} terminalPositive={uiTerminal} />
                </td>
                <td className={`${TD} min-w-[14rem] whitespace-normal !py-3`}>
                  <ReturnsListProductCell
                    lines={[
                      {
                        quantity: qty,
                        name: productTitle,
                        ean: r.product_ean ?? null,
                        sku: r.product_sku ?? null,
                        image_url: img,
                      },
                    ]}
                    trailing={productTrailing}
                  />
                </td>
                <td className={`${TD} min-w-[10rem] whitespace-normal break-words text-slate-600`}>
                  <div className="min-w-0">
                    <div className="truncate" title={customerDisp || undefined}>
                      {customerDisp || "—"}
                    </div>
                    {phoneDisp ? (
                      <div className="mt-0.5 truncate text-xs tabular-nums text-slate-500" title={phoneDisp}>
                        {phoneDisp}
                      </div>
                    ) : null}
                    {emailDisp ? (
                      <div className="mt-0.5 truncate text-xs text-slate-500" title={emailDisp}>
                        {emailDisp}
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className={`${TD} text-right`} onClick={(e) => e.stopPropagation()}>
                  <div className="flex min-w-0 flex-col items-end gap-1">
                    <ComplaintResponseDeadlineBanner
                      compact
                      responseDeadline={r.response_deadline}
                      status={r.status}
                      autoAccepted={r.auto_accepted}
                      acceptedByLaw={r.accepted_by_law}
                      daysRemainingServer={r.response_deadline_days_remaining ?? undefined}
                      isOverdueServer={r.response_deadline_is_overdue ?? undefined}
                    />
                  </div>
                </td>
                <ModuleListRowActionsCell ariaLabel="Akcje reklamacji">
                  <OperationalActionColumn
                    layout="stack"
                    aria-label="Akcje reklamacji"
                    slots={[
                      <OperationalActionLink
                        key="eye"
                        to={`/complaints/${r.id}`}
                        title="Szczegóły"
                        aria-label="Szczegóły reklamacji"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Eye className="text-slate-600" strokeWidth={2} aria-hidden />
                      </OperationalActionLink>,
                      <OperationalActionButton
                        key="del"
                        variant="danger"
                        disabled={deletingId === r.id}
                        title="Usuń reklamację"
                        aria-label="Usuń reklamację"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(r);
                        }}
                      >
                        <Trash2 strokeWidth={2} aria-hidden />
                      </OperationalActionButton>,
                    ]}
                  />
                </ModuleListRowActionsCell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const ComplaintsListTable = memo(ComplaintsListTableInner);
