import type { ExecutionActiveContext, RelocationTargetType } from "../../../context/WarehouseExecutionContext";
import { relocationTargetRowLabel } from "../../../pages/wms/wmsTerminology";

/** Sticky offset for page headers when the global context bar is visible (~5.75rem). */
export const ACTIVE_OPERATION_CONTEXT_BAR_OFFSET = "5.75rem";

export type NormalizedOperationContext = {
  operationType: string;
  orderNumber?: string | null;
  pickingToolLabel?: string | null;
  sourceLocation?: string | null;
  relocationTargetType?: RelocationTargetType | null;
  relocationTargetLabel?: string | null;
  packagingLabel?: string | null;
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

  const pickingToolLabel = (ctx.pickingToolLabel ?? ctx.cartLabel ?? "").trim() || null;
  const sourceLocation = (ctx.sourceLocation ?? ctx.locationLabel ?? "").trim() || null;
  const relocationTargetType = ctx.relocationTargetType ?? null;
  const relocationTargetLabel =
    relocationTargetType != null
      ? (ctx.targetLocation ?? ctx.carrierLabel ?? "").trim() || null
      : null;
  const packagingLabel = (ctx.packagingLabel ?? "").trim() || null;

  return {
    operationType,
    orderNumber: ctx.orderNumber ?? null,
    pickingToolLabel,
    sourceLocation,
    relocationTargetType,
    relocationTargetLabel,
    packagingLabel,
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

/** Etykieta wózka/koszyka z sesji zbierania — nie nośnik magazynowy. */
export function formatPickingToolLabel(code?: string | null, name?: string | null): string | null {
  const c = (code ?? "").trim();
  const n = (name ?? "").trim();
  if (c && n) return `${n} (${c})`;
  if (c) return c;
  if (n) return n;
  return null;
}

/** @deprecated Use formatPickingToolLabel */
export const formatCartLabel = formatPickingToolLabel;

export function formatRelocationTargetDisplay(
  type: RelocationTargetType,
  label: string | null | undefined,
): string | null {
  const value = (label ?? "").trim();
  if (!value) return null;
  return `${relocationTargetRowLabel(type)} ${value}`;
}
