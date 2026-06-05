import { useWarehouseExecution } from "../../../context/WarehouseExecutionContext";
import { ActiveOperationContextBar } from "./ActiveOperationContextBar";

/** Global sticky bar — mounted once in WmsOperationalLayout. */
export function ExecutionGlobalContextBar() {
  const { activeContext, warehouseMode } = useWarehouseExecution();
  if (!warehouseMode || !activeContext) return null;
  return <ActiveOperationContextBar context={activeContext} />;
}
