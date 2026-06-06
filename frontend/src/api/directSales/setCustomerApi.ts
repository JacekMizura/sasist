import api from "../axios";
import { directSalesQuery } from "../../modules/directSales/api/directSalesQueryParams";
import { normalizeDirectSaleSession, type DirectSaleSession } from "../../utils/normalizeDirectSales";
import type {
  ClearDirectSalesCustomerParams,
  SetDirectSalesCustomerParams,
} from "../../modules/directSales/contracts/directSalesContracts";
import { mapSetDirectSalesCustomerBody } from "../../modules/directSales/mappers/setCustomerRequestMapper";
import { extract422Detail, recordDirectSalesNetwork } from "../../modules/directSales/debug/directSalesNetworkLog";

async function postDirectSalesMutation(
  path: string,
  scope: { tenantId: number; warehouseId: number },
  requestBody: unknown,
): Promise<DirectSaleSession> {
  const query = directSalesQuery(scope);
  try {
    const { data } = await api.post(path, requestBody, { params: query });
    const session = normalizeDirectSaleSession(data);
    recordDirectSalesNetwork({
      method: "POST",
      path,
      requestBody: { body: requestBody, _query: query },
      status: 200,
      responseBody: data,
    });
    return session;
  } catch (err) {
    const res = (err as { response?: { status?: number; data?: unknown } }).response;
    recordDirectSalesNetwork({
      method: "POST",
      path,
      requestBody: { body: requestBody, _query: query },
      status: res?.status,
      responseBody: res?.data,
      validationDetail: res?.status === 422 ? extract422Detail(res.data) : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function setDirectSaleCustomer(params: SetDirectSalesCustomerParams): Promise<DirectSaleSession> {
  const body = mapSetDirectSalesCustomerBody(params.customerId);
  const path = `direct-sales/session/${params.sessionId}/set-customer`;
  return postDirectSalesMutation(path, params, body);
}

export async function clearDirectSaleCustomer(params: ClearDirectSalesCustomerParams): Promise<DirectSaleSession> {
  const path = `direct-sales/session/${params.sessionId}/clear-customer`;
  return postDirectSalesMutation(path, params, {});
}
