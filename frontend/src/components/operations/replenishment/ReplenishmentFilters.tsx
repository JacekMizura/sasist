import { PrimaryButton } from "../../../design-system/PrimaryButton";

type Props = {
  statusFilter: string;
  onStatusChange: (v: string) => void;
  onScanRules: () => void;
  scanning: boolean;
  runtimeAvailable: boolean;
};

export function ReplenishmentFilters({
  statusFilter,
  onStatusChange,
  onScanRules,
  scanning,
  runtimeAvailable,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded border border-slate-300 px-2 py-1 text-xs"
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        <option value="all">Wszystkie</option>
        <option value="open">Otwarte</option>
        <option value="active">Aktywne</option>
        <option value="blocked">Zablokowane</option>
      </select>
      <PrimaryButton type="button" disabled={!runtimeAvailable || scanning} onClick={onScanRules}>
        {scanning ? "Szukam…" : "Wykryj uzupełnienia"}
      </PrimaryButton>
    </div>
  );
}
