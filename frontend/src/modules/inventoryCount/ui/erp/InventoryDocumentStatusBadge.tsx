import {
  inventoryDocumentStatusBadgeClass,
  inventoryDocumentStatusLabel,
} from "../../inventoryCountUiLabels";

type Props = {
  status: string;
  className?: string;
};

export function InventoryDocumentStatusBadge({ status, className = "" }: Props) {
  return (
    <span className={`${inventoryDocumentStatusBadgeClass(status)} ${className}`.trim()}>
      {inventoryDocumentStatusLabel(status)}
    </span>
  );
}
