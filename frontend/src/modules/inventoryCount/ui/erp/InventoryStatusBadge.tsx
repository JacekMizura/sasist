import { StatusBadge } from "@/design-system";
import {
  inventoryDocumentStatusLabel,
  inventoryDocumentStatusTone,
  inventoryReportStatusLabel,
  inventoryReportStatusTone,
} from "../../inventoryCountUiLabels";

type Props = {
  /** Backend document status code or Polish label / report status */
  status: string;
  variant?: "document" | "report";
  className?: string;
};

/** Status badge — design-system StatusBadge + inventory tone mapping. */
export default function InventoryStatusBadge({ status, variant = "document", className = "" }: Props) {
  const label =
    variant === "report" ? inventoryReportStatusLabel(status) : inventoryDocumentStatusLabel(status);
  const tone =
    variant === "report" ? inventoryReportStatusTone(status) : inventoryDocumentStatusTone(status);

  return (
    <StatusBadge tone={tone} density="default" className={className}>
      {label}
    </StatusBadge>
  );
}
