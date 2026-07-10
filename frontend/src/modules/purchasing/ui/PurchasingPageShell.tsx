import { memo, type ReactNode } from "react";

type Props = {
  header: ReactNode;
  quickActions?: ReactNode;
  status?: ReactNode;
  kpis?: ReactNode;
  /** Komunikaty informacyjne pod KPI (nie zamiast KPI). */
  info?: ReactNode;
  filters?: ReactNode;
  analysis?: ReactNode;
  table?: ReactNode;
  footer?: ReactNode;
};

/**
 * Kanoniczny układ ekranu modułu Zakupy:
 * Header → Quick Actions → Status → KPI → Info → Filtry → Analiza → Tabela
 */
function PurchasingPageShellInner({
  header,
  quickActions,
  status,
  kpis,
  info,
  filters,
  analysis,
  table,
  footer,
}: Props) {
  return (
    <div className="space-y-3">
      {header}
      {quickActions}
      {status}
      {kpis}
      {info}
      {filters}
      {analysis}
      {table}
      {footer}
    </div>
  );
}

export const PurchasingPageShell = memo(PurchasingPageShellInner);
