import { memo, type ReactNode } from "react";

import {
  PurchasingKpiCard,
  type PurchasingKpiTone,
  type PurchasingKpiTrendSentiment,
} from "../../../modules/purchasing/ui";

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

/** KPI modułu BDO — text-2xl, ikona w prawym górnym rogu. */
function BdoKpiCardInner(props: Props) {
  return <PurchasingKpiCard {...props} density="default" />;
}

export const BdoKpiCard = memo(BdoKpiCardInner);
