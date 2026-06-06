import { DirectSalesLayout } from "../../../components/directSales/DirectSalesLayout";
import { useDirectSalesTerminal } from "../../../hooks/directSales/useDirectSalesTerminal";

/** Terminal page — must render inside ``DirectSalesSettingsLayout`` (route provider). */
export default function DirectSalesPage() {
  const terminal = useDirectSalesTerminal();
  return <DirectSalesLayout terminal={terminal} />;
}
