import { extractApiErrorMessage } from "../apiErrorMessage";

const ADD_PRODUCT_FALLBACK = "Nie udało się dodać produktu do sesji.";

function validationDetailFrom422(err: unknown): string | null {
  if (!err || typeof err !== "object" || !("response" in err)) return null;
  const data = (err as { response?: { data?: { detail?: unknown }; status?: number } }).response?.data;
  const status = (err as { response?: { status?: number } }).response?.status;
  if (status !== 422 || !data || typeof data !== "object") return null;
  const detail = (data as { detail?: unknown }).detail;
  if (!Array.isArray(detail)) return null;
  const parts = detail
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as { loc?: unknown[]; msg?: unknown; type?: unknown };
      const field = Array.isArray(row.loc) ? row.loc[row.loc.length - 1] : "?";
      const msg = String(row.msg ?? row.type ?? "");
      return msg ? `${String(field)}: ${msg}` : "";
    })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function formatDirectSalesAddProductError(err: unknown): {
  message: string;
  devDetail: string | null;
} {
  if (err instanceof Error && err.name === "DirectSalesAddProductPayloadError") {
    return {
      message: ADD_PRODUCT_FALLBACK,
      devDetail: import.meta.env.DEV ? err.message : null,
    };
  }

  const validation = validationDetailFrom422(err);
  const raw = extractApiErrorMessage(err, ADD_PRODUCT_FALLBACK);
  const isGenericValidation =
    raw === "Field required" || raw.includes("Field required") || raw.includes("value is not a valid");

  return {
    message: isGenericValidation || raw === "Wystąpił błąd operacji." ? ADD_PRODUCT_FALLBACK : raw,
    devDetail: import.meta.env.DEV ? (validation ?? (isGenericValidation ? raw : null)) : null,
  };
}
