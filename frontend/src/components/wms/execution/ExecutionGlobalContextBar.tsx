import { useLocation } from "react-router-dom";
import { useWarehouseExecution } from "../../../context/WarehouseExecutionContext";
import { ActiveOperationContextBar } from "./ActiveOperationContextBar";
import { defaultExecutionContextForPath } from "./syncExecutionContext";

/** Global sticky bar — mounted once in WmsOperationalLayout. */
export function ExecutionGlobalContextBar() {
  const { pathname } = useLocation();
  const { activeContext, warehouseMode } = useWarehouseExecution();
  if (!warehouseMode) return null;
  const ctx = activeContext ?? defaultExecutionContextForPath(pathname);
  return <ActiveOperationContextBar context={ctx} />;
}
