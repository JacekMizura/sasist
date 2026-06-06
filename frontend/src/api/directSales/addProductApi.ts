import api from "../axios";
import type { DirectSaleScanResult } from "../../utils/normalizeDirectSales";
import type { AddDirectSalesProductParams } from "./contracts";
import { mapAddDirectSalesProductBody } from "./mapAddProductBody";

export async function addProductToDirectSaleSession(
  params: AddDirectSalesProductParams,
): Promise<DirectSaleScanResult> {
  const body = mapAddDirectSalesProductBody(params);

  if (import.meta.env.DEV) {
    console.info("[direct-sales.add-product] request", {
      sessionId: params.sessionId,
      body,
    });
  }

  const { data } = await api.post<DirectSaleScanResult>(
    `direct-sales/session/${params.sessionId}/add-product`,
    body,
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}
