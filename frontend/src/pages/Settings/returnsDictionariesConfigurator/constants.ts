import type { ReturnCustomerReturnTypeDto, ReturnOrderSourceDto } from "../../../types/returnModuleConfig";

/** Ikony wizualne dla kart słownika (tylko UI). */
export const RETURN_TYPE_ICONS = ["📄", "📋", "🔄", "📦"] as const;
export const ORDER_SOURCE_ICONS = ["🛒", "🏪", "📦", "🛍", "🌐", "📱"] as const;

export type DictionaryKind = "return_type" | "source";

export type DictionaryEntry = ReturnCustomerReturnTypeDto | ReturnOrderSourceDto;

export function isReturnTypeEntry(entry: DictionaryEntry, kind: DictionaryKind): entry is ReturnCustomerReturnTypeDto {
  return kind === "return_type";
}

export function renumberDictionary<T extends { sort_order: number }>(rows: T[], start = 10, step = 10): T[] {
  return rows.map((r, i) => ({ ...r, sort_order: start + i * step }));
}
