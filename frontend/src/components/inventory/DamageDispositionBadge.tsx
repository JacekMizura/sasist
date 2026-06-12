import type { InventoryDamageTrace } from "../../types/inventoryDamageTrace";
import {
  damageBadgeClassName,
  formatDamageTooltip,
  resolveDamageBadgeLabel,
  resolveDamageBadgeVariant,
} from "../../types/inventoryDamageTrace";

type Props = {
  stockDisposition?: string | null;
  damageClass?: string | null;
  dispositionBadge?: string | null;
  damageTrace?: InventoryDamageTrace | null;
  className?: string;
};

export function DamageDispositionBadge({
  stockDisposition,
  damageClass,
  dispositionBadge,
  damageTrace,
  className = "",
}: Props) {
  const label = resolveDamageBadgeLabel(
    stockDisposition ?? damageTrace?.stock_disposition,
    damageClass ?? damageTrace?.damage_class,
    dispositionBadge ?? damageTrace?.disposition_badge,
  );
  if (!label) return null;

  const variant = resolveDamageBadgeVariant(
    stockDisposition ?? damageTrace?.stock_disposition,
    damageClass ?? damageTrace?.damage_class,
    dispositionBadge ?? damageTrace?.disposition_badge,
  );
  const tooltip = formatDamageTooltip(damageTrace ?? null);
  const badgeClass = damageBadgeClassName(variant);

  return (
    <span className={`${badgeClass} ${className}`.trim()} title={tooltip || undefined}>
      {label}
    </span>
  );
}
