import { useCallback, useEffect, useState } from "react";

import { Dialog, PageHeader, PrimaryButton, SecondaryButton, typography } from "@/design-system";
import type { WorkstationListItem } from "../../types/wmsWorkstations";

type Props = {
  open: boolean;
  stations: WorkstationListItem[];
  pending?: boolean;
  /** Preselected workstation id (e.g. last-used). */
  initialSelectedId?: number | null;
  onClose: () => void;
  onConfirm: (workstationId: number) => void | Promise<void>;
  onChooseAlternative?: () => void;
};

function isOnline(s: WorkstationListItem): boolean {
  return s.connection_status === "connected" || s.agent?.is_online === true;
}

/**
 * Primary print UX outside packing: pick a workstation, then Agent prints.
 * Browser/PDF are secondary via "Inna metoda wydruku".
 */
export function PrintWorkstationDialog({
  open,
  stations,
  pending = false,
  initialSelectedId = null,
  onClose,
  onConfirm,
  onChooseAlternative,
}: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const preferred =
      initialSelectedId != null && stations.some((s) => s.id === initialSelectedId)
        ? initialSelectedId
        : stations.find((s) => isOnline(s))?.id ?? stations[0]?.id ?? null;
    setSelectedId(preferred);
  }, [open, initialSelectedId, stations]);

  const handleConfirm = useCallback(() => {
    if (selectedId == null) return;
    void onConfirm(selectedId);
  }, [onConfirm, selectedId]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      size="md"
      panelClassName="overflow-hidden"
      aria-label="Wybierz stanowisko"
      footer={
        <>
          <SecondaryButton type="button" className="mr-auto" disabled={pending} onClick={onClose}>
            Anuluj
          </SecondaryButton>
          {onChooseAlternative ? (
            <SecondaryButton type="button" disabled={pending} onClick={onChooseAlternative}>
              Inna metoda wydruku
            </SecondaryButton>
          ) : null}
          <PrimaryButton
            type="button"
            disabled={pending || selectedId == null}
            onClick={handleConfirm}
          >
            {pending ? "Wysyłanie…" : "Drukuj"}
          </PrimaryButton>
        </>
      }
    >
      <PageHeader
        className="!mt-0"
        title={<h2 className={typography.h1}>Wybierz stanowisko</h2>}
      >
        <p className={typography.pageDesc}>
          Dokument zostanie wydrukowany na drukarce wybranego stanowiska.
        </p>
        <ul className="mt-4 space-y-2">
          {stations.map((s) => {
            const online = isOnline(s);
            const selected = selectedId === s.id;
            return (
              <li key={s.id}>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${
                    selected
                      ? "border-orange-300 bg-orange-50/80"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="print-workstation"
                    className="h-4 w-4 accent-orange-500"
                    checked={selected}
                    disabled={pending}
                    onChange={() => setSelectedId(s.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{s.name}</span>
                    <span className="block text-xs text-slate-500">
                      {s.station_type_label}
                      {s.warehouse_name ? ` · ${s.warehouse_name}` : ""}
                      {s.computer_name ? ` · ${s.computer_name}` : ""}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      online ? "text-emerald-700" : "text-slate-500"
                    }`}
                  >
                    {online ? "🟢 Online" : "❌ Offline"}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </PageHeader>
    </Dialog>
  );
}
