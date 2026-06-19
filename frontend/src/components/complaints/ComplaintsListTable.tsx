import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Mail, Phone, Trash2 } from "lucide-react";

import type { ComplaintListItem } from "../../types/complaint";
import { complaintDefectLabel } from "../../constants/complaintDefectTags";
import { ReturnsListProductCell } from "../returns/returnList/ReturnsListProductCell";
import {
  ModuleListRowActionsCell,
  ModuleListStatusPill,
} from "../listPage/moduleList/ModuleListTableParts";
import {
  moduleListEmptyStateClass,
  moduleListRowClass,
  moduleListRowSelectedClass,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
} from "../listPage/moduleList/moduleListTableTokens";
import {
  OperationalActionButton,
  OperationalActionColumn,
  panelListDenseCheckboxInputClass,
} from "../operational";
import ComplaintResponseDeadlineBanner from "../../pages/Complaints/ComplaintResponseDeadlineBanner";
import ComplaintAutoAcceptBadge from "../../pages/Complaints/ComplaintAutoAcceptBadge";
import { complaintRawStatusToPanelBrief } from "../../utils/panelListStatusBriefMappers";

const TD = moduleListTdClass;
const TH = moduleListThClass;

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
    <div className="flex flex-wrap items-center gap-1.5">
      {showIds.map((id) => (
        <span
          key={id}
          className="inline-flex max-w-[12rem] truncate rounded-md bg-slate-100/90 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/80"
        >
          {complaintDefectLabel(id)}
        </span>
      ))}
      {extra > 0 ? (
        <span className="rounded-md bg-slate-200/90 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-800">
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
        <button
          type="button"
          onClick={onNewComplaint}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
        >
          Nowa reklamacja
        </button>
      </div>
    );
  }

  return (
    <div className={moduleListTableScrollClass}>
      <table className={moduleListTableClass}>
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
            const orderLabel =
              r.order_number != null && String(r.order_number).trim()
                ? `Zamówienie #${String(r.order_number).trim()}`
                : r.order_id != null
                  ? `Zamówienie · ID ${r.order_id}`
                  : null;
            const goDetail = () => navigate(`/complaints/${r.id}`);
            const legalAuto = Boolean(r.accepted_by_law || r.auto_accepted);
            const selected = isRowSelected(String(r.id));
            const uiTerminal = statusBrief.main_group === "DONE";

            const productTrailing = (
              <>
                {defectIds.length > 0 ? (
                  <div className="mt-2">
                    <ComplaintListDefectTags ids={defectIds} />
                  </div>
                ) : null}
                {reasonFull ? (
                  <p className="mt-2 line-clamp-2 break-words text-xs leading-snug text-slate-600" title={reasonFull}>
                    <span className="font-semibold text-slate-700">Powód:</span> {reasonFull}
                  </p>
                ) : null}
              </>
            );

            return (
              <tr
                key={r.id}
                className={`${moduleListRowClass} ${selected ? moduleListRowSelectedClass : ""}`}
                onClick={goDetail}
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
                  <div className="font-medium text-slate-900">#{r.id}</div>
                  <div className="mt-1 text-xs text-slate-400">{formatWhen(r.created_at)}</div>
                  {r.reference_code ? (
                    <div className="mt-1 text-xs tabular-nums text-slate-500">{r.reference_code}</div>
                  ) : null}
                  {orderLabel ? <div className="mt-1 text-xs text-slate-500">{orderLabel}</div> : null}
                </td>
                <td className={`${TD} min-w-[10rem]`}>
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
                    more={0}
                    trailing={productTrailing}
                  />
                </td>
                <td className={`${TD} min-w-[10rem] whitespace-normal break-words text-slate-600`}>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span title={customerDisp || undefined}>{customerDisp || "—"}</span>
                    {phoneDisp ? (
                      <p className="flex items-start gap-2 text-xs text-slate-500">
                        <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                        <span className="break-all tabular-nums leading-snug">{phoneDisp}</span>
                      </p>
                    ) : null}
                    {emailDisp ? (
                      <p className="flex items-start gap-2 text-xs text-slate-500">
                        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                        <span className="break-all leading-snug">{emailDisp}</span>
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className={`${TD} text-right`} onClick={(e) => e.stopPropagation()}>
                  <div className="flex min-w-0 flex-col items-end gap-1.5">
                    {legalAuto ? <ComplaintAutoAcceptBadge compact /> : null}
                    <ComplaintResponseDeadlineBanner
                      compact
                      responseDeadline={r.response_deadline}
                      status={r.status}
                      autoAccepted={r.auto_accepted}
                      acceptedByLaw={r.accepted_by_law}
                      daysRemainingServer={r.response_deadline_days_remaining ?? undefined}
                      isOverdueServer={r.response_deadline_is_overdue ?? undefined}
                    />
                    {r.lines_count != null && Number(r.lines_count) > 0 ? (
                      <div className="text-xs text-slate-400">{r.lines_count} poz.</div>
                    ) : null}
                  </div>
                </td>
                <ModuleListRowActionsCell ariaLabel="Akcje reklamacji">
                  <OperationalActionColumn
                    slots={[
                      <OperationalActionButton
                        key="eye"
                        title="Szczegóły"
                        aria-label="Szczegóły reklamacji"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/complaints/${r.id}`);
                        }}
                      >
                        <Eye className="text-slate-600" strokeWidth={2} aria-hidden />
                      </OperationalActionButton>,
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
