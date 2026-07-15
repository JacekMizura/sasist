import { memo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/** Biała karta metadanych produktu — drawer / panel boczny (bez szarego tła). */
function PurchasingProductMetaCardInner({ children, className = "" }: Props) {
  return (
    <div className={`flex gap-4 rounded-xl border border-slate-200 bg-white p-3 ${className}`.trim()}>{children}</div>
  );
}

export const PurchasingProductMetaCard = memo(PurchasingProductMetaCardInner);
