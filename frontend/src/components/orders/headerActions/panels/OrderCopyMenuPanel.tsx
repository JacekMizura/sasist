import { GitBranch, Package, PackageOpen } from "lucide-react";

import { OrderHeaderMenuItem } from "../OrderHeaderMenuItem";
import { odHeaderActionMenuDividerClass } from "../orderHeaderActionTokens";

export type OrderCopyMenuChoice = "without_products" | "with_products" | "split";

type Props = {
  onChoose: (choice: OrderCopyMenuChoice) => void;
};

/** Copy / split quick menu — forms open only after a choice. */
export function OrderCopyMenuPanel({ onChoose }: Props) {
  return (
    <div>
      <OrderHeaderMenuItem
        icon={<PackageOpen className="h-full w-full" strokeWidth={2} />}
        label="Skopiuj zamówienie bez produktów"
        onClick={() => onChoose("without_products")}
      />
      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <OrderHeaderMenuItem
        icon={<Package className="h-full w-full" strokeWidth={2} />}
        label="Skopiuj zamówienie z produktami"
        onClick={() => onChoose("with_products")}
      />
      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <OrderHeaderMenuItem
        icon={<GitBranch className="h-full w-full" strokeWidth={2} />}
        label="Podziel zamówienie"
        onClick={() => onChoose("split")}
      />
    </div>
  );
}
