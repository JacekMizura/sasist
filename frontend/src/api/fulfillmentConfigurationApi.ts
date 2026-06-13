import api from "./axios";

export type FulfillmentAssignmentMode =
  | "MANUAL"
  | "DEFAULT_WAREHOUSE"
  | "FULFILLMENT_PRIORITY"
  | "AUTO_ATP_FUTURE";

export type FulfillmentConfigurationDto = {
  tenant_id: number;
  fulfillment_assignment_mode: FulfillmentAssignmentMode;
  consolidation_warehouse_id: number | null;
};

export type FulfillmentConfigurationUpdatePayload = {
  fulfillment_assignment_mode?: FulfillmentAssignmentMode;
  consolidation_warehouse_id?: number | null;
};

export async function fetchFulfillmentConfiguration(tenantId: number): Promise<FulfillmentConfigurationDto> {
  const { data } = await api.get<FulfillmentConfigurationDto>("/company/fulfillment-configuration", {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function patchFulfillmentConfiguration(
  tenantId: number,
  payload: FulfillmentConfigurationUpdatePayload,
): Promise<FulfillmentConfigurationDto> {
  const { data } = await api.patch<FulfillmentConfigurationDto>("/company/fulfillment-configuration", payload, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export const FULFILLMENT_ASSIGNMENT_MODE_OPTIONS: {
  value: FulfillmentAssignmentMode;
  label: string;
  description: string;
  disabled?: boolean;
}[] = [
  {
    value: "MANUAL",
    label: "Ręczna",
    description: "Operator zawsze wybiera magazyn realizacji zamówienia.",
  },
  {
    value: "DEFAULT_WAREHOUSE",
    label: "Domyślny magazyn",
    description: "Automatycznie przypisuj magazyn domyślny firmy.",
  },
  {
    value: "FULFILLMENT_PRIORITY",
    label: "Priorytet magazynów",
    description: "Wybierz magazyn z flagą realizacji i najniższym priorytetem (niższa liczba = wyższy priorytet).",
  },
  {
    value: "AUTO_ATP_FUTURE",
    label: "Automatyczna (ATP)",
    description:
      "Funkcja zostanie aktywowana w późniejszym etapie wdrożenia. Obecnie działa jak priorytet magazynów.",
    disabled: false,
  },
];
