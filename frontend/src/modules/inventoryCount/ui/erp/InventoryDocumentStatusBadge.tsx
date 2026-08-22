import { StatusBadge } from "@/design-system";
import {
  inventoryDocumentStatusLabel,
  inventoryDocumentStatusTone,
} from "../../inventoryCountUiLabels";

type Props = {
  status: string;
  className?: string;
};

/** Document status — design-system StatusBadge (same geometry as other ERP lists). */
export function InventoryDocumentStatusBadge({ status, className = "" }: Props) {
  return (
    <StatusBadge tone={inventoryDocumentStatusTone(status)} density="default" className={className}>
      {inventoryDocumentStatusLabel(status)}
    </StatusBadge>
  );
}
