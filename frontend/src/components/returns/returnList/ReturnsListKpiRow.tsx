import { AlertCircle, Clock, Inbox, Tag } from "lucide-react";
import { memo } from "react";

import type { ReturnOperationalQueueKey } from "../../../api/wmsReturnsApi";
import { PurchasingKpiCard, PurchasingKpiGrid } from "../../../modules/purchasing/ui";
import type { ReturnUiStatusPanelSummary } from "../../../types/wmsReturn";

type Props = {
  queueCounts: Partial<Record<ReturnOperationalQueueKey, number>>;
  panelSummary: ReturnUiStatusPanelSummary | null;
  onSelectQueue: (key: ReturnOperationalQueueKey) => void;
  onSelectUnassigned: () => void;
  disabled?: boolean;
};

function kpiValue(n: number | undefined): number | string {
  return typeof n === "number" ? n : "—";
}

function ReturnsListKpiRowInner({ queueCounts, panelSummary, onSelectQueue, onSelectUnassigned, disabled }: Props) {
  const unassigned = panelSummary?.unassigned_count;

  const cards = [
    {
      key: "nowe",
      title: "Nowe",
      value: kpiValue(queueCounts.nowe),
      subtitle: "Kolejka operacyjna",
      tone: "blue" as const,
      icon: <AlertCircle aria-hidden />,
      onClick: () => onSelectQueue("nowe"),
    },
    {
      key: "w_toku",
      title: "W toku",
      value: kpiValue(queueCounts.w_toku),
      subtitle: "Kolejka operacyjna",
      tone: "amber" as const,
      icon: <Clock aria-hidden />,
      onClick: () => onSelectQueue("w_toku"),
    },
    {
      key: "do_decyzji",
      title: "Do decyzji",
      value: kpiValue(queueCounts.do_decyzji),
      subtitle: "Wymagają decyzji",
      tone: "purple" as const,
      icon: <Inbox aria-hidden />,
      onClick: () => onSelectQueue("do_decyzji"),
    },
    {
      key: "unassigned",
      title: "Bez etykiety",
      value: typeof unassigned === "number" ? unassigned : "—",
      subtitle: "Status panelu nieprzypisany",
      tone: "default" as const,
      icon: <Tag aria-hidden />,
      onClick: onSelectUnassigned,
    },
  ];

  return (
    <PurchasingKpiGrid columns={4}>
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          disabled={disabled}
          onClick={c.onClick}
          className="w-full rounded-2xl text-left focus-visible:outline focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-60"
        >
          <PurchasingKpiCard
            title={c.title}
            value={c.value}
            subtitle={c.subtitle}
            tone={c.tone}
            icon={c.icon}
            className="pointer-events-none h-full"
          />
        </button>
      ))}
    </PurchasingKpiGrid>
  );
}

export const ReturnsListKpiRow = memo(ReturnsListKpiRowInner);
