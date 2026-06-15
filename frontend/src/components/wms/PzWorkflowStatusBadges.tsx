import {
  purchaseWorkflowStatusBadgeClass,
  purchaseWorkflowStatusLabelPl,
  resolveWarehouseWorkflowStatus,
  showPurchaseWorkflowStatus,
  warehouseWorkflowStatusBadgeClass,
  warehouseWorkflowStatusLabelPl,
} from "../../utils/pzWorkflowStatusPresentation";

type Props = {
  documentType?: string;
  warehouseWorkflowStatus?: string;
  purchaseWorkflowStatus?: string;
  receiving_status?: string;
  putaway_status?: string;
  relocation_status?: string;
  status?: string;
  compact?: boolean;
  className?: string;
};

/** P2.5A — dual status badges for PZ lists (warehouse + purchase axes). */
export default function PzWorkflowStatusBadges({
  documentType,
  warehouseWorkflowStatus,
  purchaseWorkflowStatus,
  receiving_status,
  putaway_status,
  relocation_status,
  status,
  compact = false,
  className = "",
}: Props) {
  const wh = resolveWarehouseWorkflowStatus(warehouseWorkflowStatus, {
    receiving_status,
    putaway_status,
    relocation_status,
    status,
  });
  const showPurchase = showPurchaseWorkflowStatus(documentType);

  const chip = compact
    ? "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ring-1"
    : "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border ring-1";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      <span
        className={`${chip} ${warehouseWorkflowStatusBadgeClass(wh)}`}
        title="Status magazynowy"
      >
        {warehouseWorkflowStatusLabelPl(wh)}
      </span>
      {showPurchase ? (
        <span
          className={`${chip} ${purchaseWorkflowStatusBadgeClass(purchaseWorkflowStatus)}`}
          title="Status zakupowy"
        >
          {purchaseWorkflowStatusLabelPl(purchaseWorkflowStatus)}
        </span>
      ) : null}
    </div>
  );
}
