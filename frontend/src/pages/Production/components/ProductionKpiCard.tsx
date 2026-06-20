import { memo } from "react";

import { PurchasingKpiCard, type PurchasingKpiTone, type PurchasingKpiTrendSentiment } from "../../../modules/purchasing/ui";
import type { ReactNode } from "react";

type Props = {
  title: string;
  value: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  tone?: PurchasingKpiTone;
  className?: string;
  trend?: {
    label: string;
    sentiment?: PurchasingKpiTrendSentiment;
  };
  to?: string;
};

/** KPI modułu Produkcja — kompaktowa gęstość, spójna z pulpitami ERP. */
function ProductionKpiCardInner(props: Props) {
  return <PurchasingKpiCard {...props} density="compact" />;
}

export const ProductionKpiCard = memo(ProductionKpiCardInner);
