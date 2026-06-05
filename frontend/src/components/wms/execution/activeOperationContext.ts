import type { ExecutionActiveContext } from "../../../context/WarehouseExecutionContext";

/** Sticky offset for page headers when the global context bar is visible (~5.75rem). */
export const ACTIVE_OPERATION_CONTEXT_BAR_OFFSET = "5.75rem";

export type NormalizedOperationContext = {
  operationType: string;
  orderNumber?: string | null;
  cartLabel?: string | null;
  sourceLocation?: string | null;
  targetLocation?: string | null;
  remainingQty?: number | null;
  currentStep?: string | null;
  operatorName?: string | null;
  scanHint?: string | null;
};

export function normalizeOperationContext(
  ctx: ExecutionActiveContext | null | undefined,
): NormalizedOperationContext | null {
  if (!ctx) return null;

  const operationType =
    (ctx.operationType ?? ctx.taskLabel ?? "").trim() ||
    (ctx.productName ? "Operacja magazynowa" : "");

  if (!operationType) return null;

  return {
    operationType,
    orderNumber: ctx.orderNumber ?? null,
    cartLabel: ctx.cartLabel ?? null,
    sourceLocation: ctx.sourceLocation ?? ctx.locationLabel ?? null,
    targetLocation: ctx.targetLocation ?? ctx.carrierLabel ?? null,
    remainingQty: ctx.remainingQty ?? null,
    currentStep: ctx.currentStep ?? ctx.stepLabel ?? null,
    operatorName: ctx.operatorName ?? null,
    scanHint: ctx.scanHint ?? null,
  };
}

export function formatOrderNumberLabel(orderNumber?: string | null, orderId?: number | null): string | null {
  const raw = (orderNumber ?? "").trim();
  if (raw) {
    if (raw.startsWith("#")) return raw;
    return `#${raw}`;
  }
  if (orderId != null && Number.isFinite(orderId) && orderId > 0) {
    return `#${orderId}`;
  }
  return null;
}

export function formatOperatorDisplayName(
  user:
    | {
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        login?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!user) return null;
  const fn = (user.first_name ?? "").trim();
  const ln = (user.last_name ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  const em = (user.email ?? "").trim();
  if (em) return em;
  const login = (user.login ?? "").trim();
  if (login) return login;
  return null;
}

export function formatCartLabel(code?: string | null, name?: string | null): string | null {
  const c = (code ?? "").trim();
  const n = (name ?? "").trim();
  if (c && n) return `${n} (${c})`;
  if (c) return c;
  if (n) return n;
  return null;
}
