type Props = {
  compact?: boolean;
};

export function OperationalLiveUnavailable({ compact }: Props) {
  if (compact) {
    return (
      <p className="text-xs text-slate-500">Operacje live są obecnie niedostępne.</p>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      Połączenie live niedostępne — wyświetlamy dane w trybie podglądu.
    </div>
  );
}
