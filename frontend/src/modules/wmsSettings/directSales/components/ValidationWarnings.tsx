import type { OrderStatusOption } from "../../../../types/wmsPackingSettings";
import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { WarningBlock } from "./settingsUi";

export function ValidationWarnings({
  config,
  statusOptions = [],
}: {
  config: DirectSalesSettingsConfig;
  statusOptions?: OrderStatusOption[];
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
  if (!config.allow_anonymous && !config.require_customer_for_invoice) {
    warnings.push("Każda sprzedaż będzie wymagała przypisanego klienta.");
  }
  if (config.allow_oversell) {
    warnings.push("Sprzedaż ponad stan może prowadzić do ujemnych stanów magazynowych i rozjazdów inwentaryzacyjnych.");
  }
  if (!config.payment_methods.cash && !config.payment_methods.card && !config.payment_methods.blik) {
    warnings.push("Brak aktywnej metody płatności — terminal nie będzie mógł zakończyć sprzedaży.");
  }
  if (!config.enabled) {
    warnings.push("Sprzedaż bezpośrednia jest wyłączona w konfiguracji biznesowej (niezależnie od flag wdrożeniowych).");
  }
  if (!warnings.length) return null;
  return (
    <div className="space-y-2">
      {warnings.map((w) => (
        <WarningBlock key={w} tone={w.includes("ponad stan") ? "red" : "amber"}>
          {w}
        </WarningBlock>
      ))}
    </div>
  );
}
