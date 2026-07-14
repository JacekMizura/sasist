import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { Printer } from "../../../types/printer";
import type { PrinterProfile } from "../../../types/printerProfiles";
import type { AgentPrinterRead } from "../../../types/printing";
import { LabelProfileWizardModal } from "./LabelProfileWizardModal";
import { formatProfileOptionDisplay } from "./labelProfileDisplay";
import {
  formatProfileAgentLinkMessage,
  isProfileAgentLinkBroken,
  resolveProfileAgentLinkStatus,
} from "./labelProfileAgentLink";
import { PrintQueueGhostButton, PrintQueuePrimaryButton } from "./printQueueUi";

type Props = {
  tenantId: number;
  warehouseId: number | null;
  profiles: PrinterProfile[];
  printers: Printer[];
  legacyPrinters: Printer[];
  agentPrinters: AgentPrinterRead[];
  systemPrinters: string[];
  selectedPrinterId: number | null;
  onSelectPrinterId: (id: number | null) => void;
  onProfilesChanged: () => void;
};

export function LabelPrintingProfileField({
  tenantId,
  warehouseId,
  profiles,
  printers,
  legacyPrinters,
  agentPrinters,
  systemPrinters,
  selectedPrinterId,
  onSelectPrinterId,
  onProfilesChanged,
}: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const showEmptyState = profiles.length === 0 && systemPrinters.length > 0;
  const selectedPrinter = printers.find((printer) => printer.id === selectedPrinterId) ?? null;
  const selectedDisplay = selectedPrinter
    ? formatProfileOptionDisplay(selectedPrinter, legacyPrinters)
    : null;
  const selectedAgentLink = resolveProfileAgentLinkStatus(
    selectedPrinter,
    legacyPrinters,
    agentPrinters,
    profiles,
  );
  const selectedAgentLinkMessage = formatProfileAgentLinkMessage(selectedAgentLink);
  const selectedAgentLinkBroken = isProfileAgentLinkBroken(selectedAgentLink);

  useEffect(() => {
    if (printers.length !== 1 || selectedPrinterId != null) return;
    onSelectPrinterId(printers[0].id);
  }, [printers, selectedPrinterId, onSelectPrinterId]);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  const optionRows = useMemo(
    () =>
      printers.map((printer) => ({
        printer,
        display: formatProfileOptionDisplay(printer, legacyPrinters),
      })),
    [printers, legacyPrinters],
  );

  const handleProfileCreated = (printerId: number) => {
    onProfilesChanged();
    onSelectPrinterId(printerId);
  };

  return (
    <div className="md:col-span-2 space-y-3">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Profil drukowania
        </label>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Profil drukowania określa, która drukarka i jakie parametry wydruku będą używane.
        </p>
      </div>

      {showEmptyState ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-4 space-y-3">
          <p className="text-sm text-amber-950">
            Wykryto {systemPrinters.length}{" "}
            {systemPrinters.length === 1 ? "drukarkę" : "drukarki"} z agenta Windows, ale nie skonfigurowano jeszcze
            żadnych profili drukowania.
          </p>
          <div className="flex flex-wrap gap-2">
            <PrintQueuePrimaryButton className="w-auto" onClick={() => setWizardOpen(true)}>
              Utwórz profil
            </PrintQueuePrimaryButton>
            <Link
              to="/settings/printers/devices"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Otwórz ustawienia drukarek
            </Link>
          </div>
        </div>
      ) : (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="mt-1.5 flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-2 text-left text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-300/40"
          >
            <span className="min-w-0">
              {selectedDisplay ? (
                <>
                  <span className="block truncate font-medium">{selectedDisplay.title}</span>
                  {selectedDisplay.subtitle ? (
                    <span className="block truncate text-xs text-slate-500">↳ {selectedDisplay.subtitle}</span>
                  ) : null}
                </>
              ) : (
                <span className="text-slate-500">— Wybierz profil drukowania —</span>
              )}
            </span>
            <span className="shrink-0 text-slate-400">{menuOpen ? "▲" : "▼"}</span>
          </button>

          {menuOpen ? (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <li>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
                  onClick={() => {
                    onSelectPrinterId(null);
                    setMenuOpen(false);
                  }}
                >
                  — Bez profilu drukowania —
                </button>
              </li>
              {optionRows.map(({ printer, display }) => (
                <li key={printer.id}>
                  <button
                    type="button"
                    className={`block w-full px-3 py-2 text-left hover:bg-cyan-50/70 ${
                      selectedPrinterId === printer.id ? "bg-cyan-50/50" : ""
                    }`}
                    onClick={() => {
                      onSelectPrinterId(printer.id);
                      setMenuOpen(false);
                    }}
                  >
                    <span className="block text-sm font-medium text-slate-900">{display.title}</span>
                    {display.subtitle ? (
                      <span className="block text-xs text-slate-500">↳ {display.subtitle}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {selectedAgentLinkMessage ? (
            <p
              className={`mt-2 text-xs leading-relaxed ${
                selectedAgentLinkBroken ? "text-amber-800" : "text-slate-600"
              }`}
            >
              {selectedAgentLinkMessage}
            </p>
          ) : null}

          {selectedAgentLinkBroken ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
              Wydruk może trafić na domyślną drukarkę magazynu, dopóki profil nie wskazuje aktywnej drukarki agenta.
              Zaktualizuj powiązanie w ustawieniach drukarek lub wybierz inną drukarkę systemową.
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-2">
            <PrintQueueGhostButton onClick={() => setWizardOpen(true)}>Utwórz profil</PrintQueueGhostButton>
            <Link
              to="/settings/printers/devices"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Ustawienia drukarek
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
        <p>
          <span className="font-semibold text-slate-800">Drukarka systemowa</span> = fizyczna drukarka wykryta przez
          agenta.
        </p>
        <p className="mt-1">
          <span className="font-semibold text-slate-800">Profil drukowania</span> = zapisane ustawienia wydruku
          korzystające z konkretnej drukarki.
        </p>
      </div>

      <LabelProfileWizardModal
        open={wizardOpen}
        tenantId={tenantId}
        warehouseId={warehouseId}
        systemPrinters={systemPrinters}
        onClose={() => setWizardOpen(false)}
        onCreated={handleProfileCreated}
      />
    </div>
  );
}
