import { useParams } from "react-router-dom";

import { TabsContainer } from "../../components/layout/TabsContainer";
import { TabsNav } from "../../components/layout/TabsNav";
import { customerDetailTabs } from "../../modules/customers/customerDetailTabs";

export function CustomerDetailTabs() {
  const { id } = useParams<{ id: string }>();
  if (!id || !/^\d+$/.test(id)) return null;

  return (
    <TabsContainer className="mb-0 w-full pb-0 pt-0 [-webkit-overflow-scrolling:touch]">
      <TabsNav items={customerDetailTabs(Number(id))} aria-label="Sekcje klienta" />
    </TabsContainer>
  );
}
