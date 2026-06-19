import type { ReturnCustomerReturnTypeDto, ReturnOrderSourceDto } from "../../../types/returnModuleConfig";

export type DictionaryKind = "return_type" | "source";

export type DictionaryRow = ReturnCustomerReturnTypeDto | ReturnOrderSourceDto;

export function renumberDictionary<T extends { sort_order: number }>(rows: T[], start = 10, step = 10): T[] {
  return rows.map((r, i) => ({ ...r, sort_order: start + i * step }));
}
