import type { ReactNode } from "react";

import { productLikeSectionTitleClass } from "./productLikeTokens";

type ProductLikeSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function ProductLikeSection({ title, children, className }: ProductLikeSectionProps) {
  return (
    <section className={className}>
      <h3 className={productLikeSectionTitleClass}>{title}</h3>
      {children}
    </section>
  );
}
