import type { ShippingMethodDto } from "../api/shippingMethodsApi";

/** Soft refresh must keep an existing list mounted so <img> are not aborted. */
export function shippingMethodsShouldUnmountList(loading: boolean, rowCount: number): boolean {
  return loading && rowCount === 0;
}

/**
 * Fields that affect list-row identity / logo <img> src.
 * Aliases / updated_at changes must NOT remount logos.
 */
export function shippingMethodLogoMountKey(row: Pick<ShippingMethodDto, "id" | "logo_url" | "name">): string {
  return `${row.id}\0${(row.logo_url ?? "").trim()}\0${(row.name ?? "").trim()}`;
}

/** True when applying `next` would not change logo mount keys. */
export function shippingMethodsLogoMountStable(
  prev: Pick<ShippingMethodDto, "id" | "logo_url" | "name">[],
  next: Pick<ShippingMethodDto, "id" | "logo_url" | "name">[],
): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (shippingMethodLogoMountKey(prev[i]!) !== shippingMethodLogoMountKey(next[i]!)) {
      return false;
    }
  }
  return true;
}

function aliasesEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}

function rowMetaEqual(a: ShippingMethodDto, b: ShippingMethodDto): boolean {
  return (
    a.id === b.id &&
    (a.logo_url ?? "") === (b.logo_url ?? "") &&
    a.name === b.name &&
    a.code === b.code &&
    a.is_active === b.is_active &&
    aliasesEqual(a.aliases, b.aliases)
  );
}

/**
 * Merge API refresh into list state without churning logo mounts.
 * Returns the previous array reference when nothing visible changed (React bails out of setState).
 */
export function mergeShippingMethodsRows(
  prev: ShippingMethodDto[],
  next: ShippingMethodDto[],
): ShippingMethodDto[] {
  if (prev.length === next.length && prev.every((row, i) => rowMetaEqual(row, next[i]!))) {
    return prev;
  }
  if (!shippingMethodsLogoMountStable(prev, next)) {
    return next;
  }
  // Same logo mount keys — patch non-logo fields, keep stable id/logo_url/name on each row object
  // when possible so memoized logo children keep the same prop references.
  return prev.map((row, i) => {
    const n = next[i]!;
    if (rowMetaEqual(row, n)) return row;
    return {
      ...row,
      code: n.code,
      aliases: n.aliases,
      is_active: n.is_active,
      updated_at: n.updated_at,
      created_at: n.created_at,
    };
  });
}
