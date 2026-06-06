import { DirectSalesLayout } from "../../../components/directSales/DirectSalesLayout";
import { useDirectSalesTerminal } from "../../../hooks/directSales/useDirectSalesTerminal";
import { ResolvedDirectSalesSettingsProvider } from "../../../modules/directSales/settings/resolvedDirectSalesSettings";

export default function DirectSalesPage() {
  const terminal = useDirectSalesTerminal();

  if (terminal.settingsLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
        Wczytywanie ustawień terminala…
      </div>
    );
  }

  if (terminal.settingsError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-sm text-red-800">
        <p>{terminal.settingsError}</p>
        <button
          type="button"
          className="rounded border border-red-200 px-3 py-1.5 text-red-700"
          onClick={() => void terminal.reloadSettings()}
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  return (
    <ResolvedDirectSalesSettingsProvider value={terminal.resolvedDirectSalesSettings}>
      <DirectSalesLayout terminal={terminal} />
    </ResolvedDirectSalesSettingsProvider>
  );
}
