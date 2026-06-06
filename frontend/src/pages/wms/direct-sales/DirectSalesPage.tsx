import { DirectSalesLayout } from "../../../components/directSales/DirectSalesLayout";
import { useDirectSalesTerminal } from "../../../hooks/directSales/useDirectSalesTerminal";

export default function DirectSalesPage() {
  const terminal = useDirectSalesTerminal();
  return <DirectSalesLayout terminal={terminal} />;
}
