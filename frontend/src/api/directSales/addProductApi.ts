import api from "../axios";
import type { DirectSaleScanResult } from "../../utils/normalizeDirectSales";
import { directSalesQuery } from "../../modules/directSales/api/directSalesQueryParams";
import type { AddDirectSalesProductParams } from "../../modules/directSales/contracts/directSalesContracts";
import { mapAddDirectSalesProductBody } from "../../modules/directSales/mappers/addProductRequestMapper";
import { extract422Detail, recordDirectSalesNetwork } from "../../modules/directSales/debug/directSalesNetworkLog";

export async function addProductToDirectSaleSession(
  params: AddDirectSalesProductParams,
): Promise<DirectSaleScanResult> {
  const body = mapAddDirectSalesProductBody(params);
  const path = `direct-sales/session/${params.sessionId}/add-product`;
  const query = directSalesQuery(params);

  try {
    const { data } = await api.post<DirectSaleScanResult>(path, body, { params: query });
    recordDirectSalesNetwork({
      method: "POST",
      path,
      requestBody: { ...body, _query: query },
      status: 200,
      responseBody: data,
    });
    return data;
  } catch (err) {
    const res = (err as { response?: { status?: number; data?: unknown } }).response;
    recordDirectSalesNetwork({
      method: "POST",
      path,
      requestBody: { ...body, _query: query },
      status: res?.status,
      responseBody: res?.data,
      validationDetail: res?.status === 422 ? extract422Detail(res.data) : undefined,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
