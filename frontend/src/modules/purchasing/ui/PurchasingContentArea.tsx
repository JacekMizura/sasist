import { memo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/** Główny obszar treści zakładki — zgodny z prototypem (px-8 / 2xl:px-12). */
function PurchasingContentAreaInner({ children, className = "" }: Props) {
  return (
    <div className={`w-full space-y-5 px-4 pb-6 pt-4 md:px-8 2xl:px-12 ${className}`.trim()}>{children}</div>
  );
}

export const PurchasingContentArea = memo(PurchasingContentAreaInner);
