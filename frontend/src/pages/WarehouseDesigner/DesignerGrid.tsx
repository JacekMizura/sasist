import { WarehouseMainView, type WarehouseMainViewProps } from "../../components/warehouse/WarehouseMainView";

export interface DesignerGridProps {
  mainViewProps: WarehouseMainViewProps;
}

export function DesignerGrid({ mainViewProps }: DesignerGridProps) {
  return <WarehouseMainView {...mainViewProps} />;
}
