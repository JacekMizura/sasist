import { DirectSalesLayout } from "../../../components/directSales/DirectSalesLayout";
import { useDirectSalesTerminal } from "../../../hooks/directSales/useDirectSalesTerminal";
import { ResolvedDirectSalesSettingsProvider } from "../../../modules/directSales/settings/resolvedDirectSalesSettings";

export default function DirectSalesPage() {
  const terminal = useDirectSalesTerminal();

  return (
    <ResolvedDirectSalesSettingsProvider value={terminal.resolvedDirectSalesSettings}>
      {terminal.settingsError && !terminal.settingsRefreshing ? (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          Ustawienia z pamięci podręcznej — {terminal.settingsError}
          <button type="button" className="ml-2 underline" onClick={() => void terminal.reloadSettings()}>
            Odśwież
          </button>
        </div>
      ) : null}
      <DirectSalesLayout terminal={terminal} />
    </ResolvedDirectSalesSettingsProvider>
  );
}
