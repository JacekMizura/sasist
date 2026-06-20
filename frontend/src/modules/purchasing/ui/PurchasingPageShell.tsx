import { memo, type ReactNode } from "react";

type Props = {
  header: ReactNode;
  quickActions?: ReactNode;
  status?: ReactNode;
  kpis?: ReactNode;
  filters?: ReactNode;
  analysis?: ReactNode;
  table?: ReactNode;
  footer?: ReactNode;
};

/**
 * Kanoniczny układ ekranu modułu Zakupy:
 * Header → (Quick Actions) → Status → KPI → Filtry → Analiza → Tabela
 */
function PurchasingPageShellInner({
  header,
  quickActions,
  status,
  kpis,
  filters,
  analysis,
  table,
  footer,
}: Props) {
  return (
    <div className="space-y-4">
      {header}
      {quickActions}
      {status}
      {kpis}
      {filters}
      {analysis}
      {table}
      {footer}
    </div>
  );
}

export const PurchasingPageShell = memo(PurchasingPageShellInner);
