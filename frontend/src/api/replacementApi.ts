import api from "./axios";
import { patchOrderItemLine } from "./ordersApi";

export type ReplacementSuggestionProduct = {
  id: number;
  name: string;
  sku?: string | null;
  ean?: string | null;
  image_url?: string | null;
  category?: string | null;
  manufacturer?: string | null;
  stock_qty: number;
  reserved_qty: number;
  available_qty: number;
  location_count: number;
  locations: string[];
  similarity_reasons: string[];
  badge?: string | null;
  usage_count?: number | null;
  last_used_at?: string | null;
  score?: number;
  match_group?: "best_match" | "alternatives" | "others" | null;
  match_flags?: Record<string, boolean>;
};

export type ReplacementSuggestionsResponse = {
  recent: ReplacementSuggestionProduct[];
  popular: ReplacementSuggestionProduct[];
  similar: ReplacementSuggestionProduct[];
  search_results: ReplacementSuggestionProduct[];
  best_match: ReplacementSuggestionProduct[];
  alternatives: ReplacementSuggestionProduct[];
  others: ReplacementSuggestionProduct[];
  debug?: {
    source_product?: {
      id?: number;
      name?: string;
      category_id?: number | null;
      category_name?: string | null;
      manufacturer_id?: number | null;
      manufacturer_name?: string | null;
      normalized_manufacturer?: string | null;
      tokens?: string[];
      primary_token?: string | null;
    };
    candidates_checked?: number;
    stage_results?: Record<string, number>;
    first_10_candidates?: Array<Record<string, unknown>>;
  } | null;
};

export type ReplacementSuggestionsQuery = {
  tenant_id: number;
  warehouse_id?: number | null;
  q?: string;
  same_manufacturer?: boolean;
  same_size?: boolean;
  same_category?: boolean;
  available_only?: boolean;
  show_similar?: boolean;
  show_all_products?: boolean;
  debug?: boolean;
  limit?: number;
};

export async function getReplacementSuggestions(
  productId: number,
  params: ReplacementSuggestionsQuery,
): Promise<ReplacementSuggestionsResponse> {
  const res = await api.get<ReplacementSuggestionsResponse>(`/products/${productId}/replacement-suggestions`, { params });
  return {
    recent: Array.isArray(res.data?.recent) ? res.data.recent : [],
    popular: Array.isArray(res.data?.popular) ? res.data.popular : [],
    similar: Array.isArray(res.data?.similar) ? res.data.similar : [],
    search_results: Array.isArray(res.data?.search_results) ? res.data.search_results : [],
    best_match: Array.isArray(res.data?.best_match) ? res.data.best_match : [],
    alternatives: Array.isArray(res.data?.alternatives) ? res.data.alternatives : [],
    others: Array.isArray(res.data?.others) ? res.data.others : [],
    debug: res.data?.debug ?? null,
  };
}

/** Zamiana produktu na linii z brakiem — PATCH ``/orders/{orderId}/items/{itemId}``. */
export async function replaceOrderLineProduct(
  orderId: number,
  lineId: number,
  body: { new_product_id: number; remember_substitution: boolean },
): Promise<void> {
  await patchOrderItemLine(orderId, lineId, {
    replace_product_id: body.new_product_id,
  });
  // ``remember_substitution`` — UI zapisuje intencję; trwały zapis sugestii w osobnym API (ProductSubstitution).
  void body.remember_substitution;
}
