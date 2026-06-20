import {
  inventoryDocumentStatusBadgeClass,
  inventoryDocumentStatusLabel,
  inventoryReportStatusBadgeClass,
  inventoryReportStatusLabel,
} from "../../inventoryCountUiLabels";

type Props = {
  /** Backend document status code or Polish label / report status */
  status: string;
  variant?: "document" | "report";
  className?: string;
};

/** Status badge — unified operational semantics (system-wide). */
export default function InventoryStatusBadge({ status, variant = "document", className = "" }: Props) {
  const label =
    variant === "report" ? inventoryReportStatusLabel(status) : inventoryDocumentStatusLabel(status);
  const badgeClass =
    variant === "report" ? inventoryReportStatusBadgeClass(status) : inventoryDocumentStatusBadgeClass(status);

  return <span className={`${badgeClass} ${className}`.trim()}>{label}</span>;
}
