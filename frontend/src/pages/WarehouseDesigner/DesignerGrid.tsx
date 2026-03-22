import { WarehouseMainView, type WarehouseMainViewProps } from "../../components/warehouse/WarehouseMainView";

export interface DesignerGridProps {
  mainViewProps: WarehouseMainViewProps;
}

export function DesignerGrid({ mainViewProps }: DesignerGridProps) {
  return (
    <div className="flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col overflow-hidden">
      <WarehouseMainView {...mainViewProps} />
    </div>
  );
}
