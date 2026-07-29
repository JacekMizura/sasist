import { useCallback, useEffect, useMemo, useState } from "react";

import { Dialog, PageHeader, PrimaryButton, SecondaryButton, typography } from "@/design-system";
import type { PublishedTemplateOptionDto } from "../../api/documentTemplatesApi";
import type { WorkstationListItem } from "../../types/wmsWorkstations";
import type { PrintConfirmSelection, PrintDestination } from "./printMethodTypes";

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  pending?: boolean;
  templates: PublishedTemplateOptionDto[];
  stations: WorkstationListItem[];
  initialTemplateVersionId?: number | null;
  initialWorkstationId?: number | null;
  /** When false, hide station list and force alternatives. */
  stationPrintAvailable?: boolean;
  stationUnavailableMessage?: string | null;
  onClose: () => void;
  onConfirm: (selection: PrintConfirmSelection) => void | Promise<void>;
};

function isOnline(s: WorkstationListItem): boolean {
  return s.connection_status === "connected" || s.agent?.is_online === true;
}

function templateLabel(t: PublishedTemplateOptionDto): string {
  return (t.label || t.template_name || `Szablon #${t.version_id}`).trim();
}

/**
 * Operator print dialog: template + place (workstation) + PDF/browser alternatives.
 * Never exposes Agent / queue / mapping jargon.
 */
export function PrintDocumentDialog({
  open,
  title = "Drukuj dokument",
  description,
  pending = false,
  templates,
  stations,
  initialTemplateVersionId = null,
  initialWorkstationId = null,
  stationPrintAvailable = true,
  stationUnavailableMessage = null,
  onClose,
  onConfirm,
}: Props) {
  const [templateVersionId, setTemplateVersionId] = useState<number | null>(null);
  const [workstationId, setWorkstationId] = useState<number | null>(null);
  const [destination, setDestination] = useState<PrintDestination>("station");

  const showTemplateDropdown = templates.length > 1;
  const showTemplateStatic = templates.length === 1;
  const onlineStations = useMemo(() => stations.filter(isOnline), [stations]);

  useEffect(() => {
    if (!open) return;

    const preferredTemplate =
      initialTemplateVersionId != null &&
      templates.some((t) => t.version_id === initialTemplateVersionId)
        ? initialTemplateVersionId
        : templates.find((t) => t.is_default_binding)?.version_id ??
          templates[0]?.version_id ??
          null;
    setTemplateVersionId(preferredTemplate);

    const preferredStation =
      initialWorkstationId != null && stations.some((s) => s.id === initialWorkstationId)
        ? initialWorkstationId
        : onlineStations[0]?.id ?? stations[0]?.id ?? null;
    setWorkstationId(preferredStation);

    const canStation =
      stationPrintAvailable &&
      preferredStation != null &&
      stations.some((s) => s.id === preferredStation && isOnline(s));
    setDestination(canStation ? "station" : "download");
  }, [
    open,
    initialTemplateVersionId,
    initialWorkstationId,
    templates,
    stations,
    onlineStations,
    stationPrintAvailable,
  ]);

  const selectedStation = stations.find((s) => s.id === workstationId) ?? null;
  const selectedOnline = selectedStation ? isOnline(selectedStation) : false;

  const canConfirm =
    !pending &&
    (destination !== "station" ||
      (stationPrintAvailable && workstationId != null && selectedOnline));

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    void onConfirm({
      destination,
      workstationId: destination === "station" ? workstationId : null,
      templateVersionId,
    });
  }, [canConfirm, destination, onConfirm, templateVersionId, workstationId]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      size="md"
      panelClassName="overflow-hidden"
      aria-label={title}
      footer={
        <>
          <SecondaryButton type="button" className="mr-auto" disabled={pending} onClick={onClose}>
            Anuluj
          </SecondaryButton>
          <PrimaryButton type="button" disabled={!canConfirm} onClick={handleConfirm}>
            {pending ? "Drukowanie…" : "Drukuj"}
          </PrimaryButton>
        </>
      }
    >
      <PageHeader className="!mt-0" title={<h2 className={typography.h1}>{title}</h2>}>
        {description ? <p className={typography.pageDesc}>{description}</p> : null}

        {showTemplateDropdown || showTemplateStatic ? (
          <section className="mt-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Szablon wydruku
            </h3>
            {showTemplateDropdown ? (
              <select
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                value={templateVersionId ?? ""}
                disabled={pending}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setTemplateVersionId(Number.isFinite(v) && v >= 1 ? v : null);
                }}
              >
                {templates.map((t) => (
                  <option key={t.version_id} value={t.version_id}>
                    {templateLabel(t)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-sm font-medium text-slate-900">
                {templates[0] ? templateLabel(templates[0]) : "—"}
              </p>
            )}
          </section>
        ) : null}

        <section className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Miejsce wydruku
          </h3>
          {!stationPrintAvailable ? (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {stationUnavailableMessage ||
                "Brak dostępnego stanowiska do wydruku. Użyj pobrania PDF lub przeglądarki."}
            </p>
          ) : stations.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">
              Brak przypisanego stanowiska. Poproś administratora o dostęp.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {stations.map((s) => {
                const online = isOnline(s);
                const selected = destination === "station" && workstationId === s.id;
                return (
                  <li key={s.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${
                        !online
                          ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
                          : selected
                            ? "border-orange-300 bg-orange-50/80"
                            : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="print-destination"
                        className="mt-1 h-4 w-4 accent-orange-500"
                        checked={selected}
                        disabled={pending || !online}
                        onChange={() => {
                          setDestination("station");
                          setWorkstationId(s.id);
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{s.name}</span>
                        <span className="mt-0.5 block text-xs text-slate-600">
                          {s.default_printer_name?.trim() || "Brak przypisanej drukarki"}
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
          )}
        </section>

        <section className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Alternatywna metoda
          </h3>
          <ul className="mt-2 space-y-2">
            {(
              [
                { id: "download" as const, title: "Pobierz PDF", desc: "Zapisz dokument jako plik PDF." },
                {
                  id: "browser" as const,
                  title: "Drukuj przez przeglądarkę",
                  desc: "Otwórz okno drukowania przeglądarki.",
                },
              ] as const
            ).map((opt) => {
              const selected = destination === opt.id;
              return (
                <li key={opt.id}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${
                      selected
                        ? "border-orange-300 bg-orange-50/80"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="print-destination"
                      className="mt-1 h-4 w-4 accent-orange-500"
                      checked={selected}
                      disabled={pending}
                      onChange={() => setDestination(opt.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{opt.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-600">{opt.desc}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      </PageHeader>
    </Dialog>
  );
}
