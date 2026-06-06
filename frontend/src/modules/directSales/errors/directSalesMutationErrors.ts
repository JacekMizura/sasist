import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { DirectSalesAddProductPayloadError } from "../mappers/addProductRequestMapper";
import { DirectSalesSetCustomerPayloadError } from "../mappers/setCustomerRequestMapper";

const FALLBACK: Record<"add-product" | "set-customer", string> = {
  "add-product": "Nie udało się dodać produktu do sesji.",
  "set-customer": "Nie udało się przypisać klienta do sesji.",
};

function validationDetailFrom422(err: unknown): string | null {
  if (!err || typeof err !== "object" || !("response" in err)) return null;
  const res = (err as { response?: { data?: { detail?: unknown }; status?: number } }).response;
  if (res?.status !== 422 || !res.data || typeof res.data !== "object") return null;
  const detail = (res.data as { detail?: unknown }).detail;
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

export function formatDirectSalesMutationError(
  err: unknown,
  operation: "add-product" | "set-customer",
): { message: string; devDetail: string | null } {
  const fallback = FALLBACK[operation];

  if (
    err instanceof DirectSalesAddProductPayloadError ||
    err instanceof DirectSalesSetCustomerPayloadError
  ) {
    return {
      message: fallback,
      devDetail: import.meta.env.DEV ? err.message : null,
    };
  }

  const validation = validationDetailFrom422(err);
  const raw = extractApiErrorMessage(err, fallback);
  const isGenericValidation =
    raw === "Field required" || raw.includes("Field required") || raw.includes("value is not a valid");

  return {
    message: isGenericValidation || raw === "Wystąpił błąd operacji." ? fallback : raw,
    devDetail: import.meta.env.DEV ? (validation ?? (isGenericValidation ? raw : null)) : null,
  };
}
