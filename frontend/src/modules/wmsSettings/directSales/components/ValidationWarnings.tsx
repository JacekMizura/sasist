import type { OrderStatusOption } from "../../../../types/wmsPackingSettings";
import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { WarningBlock } from "./settingsUi";

export function ValidationWarnings({
  config,
  statusOptions = [],
  enabledEnforced,
}: {
  config: DirectSalesSettingsConfig;
  statusOptions?: OrderStatusOption[];
  enabledEnforced?: boolean;
}) {
  const warnings: string[] = [];
  if (config.enabled && config.default_order_status_id == null) {
    warnings.push("Brak statusu po zakończeniu sprzedaży — wybierz status z listy panelu zamówień.");
  }
  if (
    config.default_order_status_id != null &&
    statusOptions.length > 0 &&
    !statusOptions.some((o) => o.id === config.default_order_status_id)
  ) {
    warnings.push("Zapisany status po sprzedaży nie istnieje lub jest nieaktywny — zostanie użyty domyślny po zapisie.");
  }
  if (!config.payment_methods.cash && !config.payment_methods.card && !config.payment_methods.blik && !config.payment_methods.transfer) {
    warnings.push("Brak aktywnej metody płatności — terminal nie będzie mógł zakończyć sprzedaży.");
  }
  if (!config.enabled) {
    if (enabledEnforced) {
      warnings.push(
        "Sprzedaż bezpośrednia jest wyłączona dla tego zakresu — terminal i API nie pozwolą otworzyć nowej sesji (istniejące sesje można dokończyć).",
      );
    } else {
      warnings.push(
        "Przełącznik zapisany jako wyłączony, ale obowiązuje tryb legacy — sprzedaż działa do pierwszego zapisu ustawień z tym polem.",
      );
    }
  }
  if (!warnings.length) return null;
  return (
    <div className="space-y-2">
      {warnings.map((w) => (
        <WarningBlock key={w} tone="amber">
          {w}
        </WarningBlock>
      ))}
    </div>
  );
}
