import { useCallback, useEffect, useId, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Cloud, Download, Info, Printer } from "lucide-react";

import {
  Dialog,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  typography,
} from "@/design-system";
import { colors, radius, shadows, spacing } from "@/design-system/tokens";

import type { PrintMethod } from "./printMethodTypes";
import {
  cloudPrintUnavailableMessage,
  type CloudPrintCapability,
} from "./hasDefaultCloudPrinter";

const AGENT_INFO =
  "Sasist Agent drukuje automatycznie na drukarce przypisanej do stanowiska (kolejka / ZPL / PDF), bez okna przeglądarki.";

type MethodOption = {
  id: PrintMethod;
  title: string;
  description: string;
  icon: typeof Printer;
  info?: string;
  legacy?: boolean;
};

const PRIMARY_OPTIONS: MethodOption[] = [
  {
    id: "agent",
    title: "Sasist Agent",
    description: "Automatyczny wydruk przez agenta na drukarce stanowiska.",
    icon: Cloud,
    info: AGENT_INFO,
  },
  {
    id: "browser",
    title: "Przeglądarka",
    description: "Wydruk przez okno drukowania przeglądarki.",
    icon: Printer,
  },
  {
    id: "download",
    title: "Pobierz PDF",
    description: "Pobierz dokument jako plik PDF.",
    icon: Download,
  },
];

/** Legacy QZ — only offered in DEV builds, never to production users. */
const DEV_QZ_OPTION: MethodOption = {
  id: "qz",
  title: "QZ Tray (DEV)",
  description: "Lokalny wydruk przez QZ Tray — tylko w trybie deweloperskim.",
  icon: Printer,
  legacy: true,
};

export type PrintMethodDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (method: PrintMethod) => void | Promise<void>;
  pending?: boolean;
  title?: ReactNode;
  description?: ReactNode;
  /** Sasist Agent readiness for assigned workstation — disables agent tile when not ready. */
  cloudCapability?: CloudPrintCapability | null;
  /**
   * @deprecated Ignored — QZ is gated by DEV only, not warehouse settings.
   */
  preferSasistAgent?: boolean | null;
};

function InfoPopover({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const tipId = useId();

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      setAnchor(null);
      return;
    }
    setAnchor(e.currentTarget.getBoundingClientRect());
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center ${radius.md} text-slate-500 hover:bg-slate-100 hover:text-slate-800`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? tipId : undefined}
        onClick={toggle}
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      {open && anchor && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[520] cursor-default bg-transparent"
                aria-label="Zamknij informację"
                onClick={() => {
                  setOpen(false);
                  setAnchor(null);
                }}
              />
              <div
                id={tipId}
                role="dialog"
                className={`fixed z-[530] w-[min(20rem,calc(100vw-1.5rem))] border ${colors.border.default} ${colors.surface.page} ${radius.lg} ${shadows.md} p-3 ${typography.bodyMuted}`}
                style={{
                  top: Math.min(anchor.bottom + 8, window.innerHeight - 12),
                  left: Math.max(12, Math.min(anchor.right - 320, window.innerWidth - 332)),
                }}
              >
                {text}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * Standard Sasist print-method dialog — Agent / browser / PDF (QZ only in DEV).
 */
export function PrintMethodDialog({
  open,
  onClose,
  onConfirm,
  pending = false,
  title = "Wybierz sposób wydruku",
  description = "Wybierz sposób wydrukowania dokumentu.",
  cloudCapability = null,
}: PrintMethodDialogProps) {
  const [selected, setSelected] = useState<PrintMethod>("agent");
  const agentDisabled = cloudCapability != null && !cloudCapability.ready;
  const agentHint = agentDisabled ? cloudPrintUnavailableMessage(cloudCapability) : null;

  const visibleOptions = useMemo(() => {
    const list = [...PRIMARY_OPTIONS];
    if (import.meta.env.DEV) list.push(DEV_QZ_OPTION);
    return list;
  }, []);

  useEffect(() => {
    if (open) {
      setSelected(agentDisabled ? "browser" : "agent");
    }
  }, [open, agentDisabled]);

  useEffect(() => {
    if ((selected === "agent" || selected === "cloud") && agentDisabled) setSelected("browser");
  }, [agentDisabled, selected]);

  const handleConfirm = useCallback(() => {
    const method = selected === "cloud" ? "agent" : selected;
    void onConfirm(method);
  }, [onConfirm, selected]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      size="md"
      panelClassName="overflow-hidden"
      aria-label={typeof title === "string" ? title : "Wybierz sposób wydruku"}
      footer={
        <>
          <SecondaryButton type="button" className="mr-auto" disabled={pending} onClick={onClose}>
            Anuluj
          </SecondaryButton>
          <PrimaryButton type="button" disabled={pending} onClick={handleConfirm}>
            {pending ? "Trwa…" : "Drukuj"}
          </PrimaryButton>
        </>
      }
    >
      <PageHeader
        className="!mt-0"
        title={<h2 className={typography.h1}>{title}</h2>}
      >
        <p className={typography.pageDesc}>{description}</p>
        {agentDisabled && agentHint ? (
          <p className={`mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 ${typography.bodyMuted} text-amber-950 whitespace-pre-line`}>
            {agentHint}
          </p>
        ) : null}
        <div className={`mt-4 flex flex-col ${spacing.gap2}`}>
          {visibleOptions.map((opt) => {
            const Icon = opt.icon;
            const isAgent = opt.id === "agent" || opt.id === "cloud";
            const disabledOption = pending || (isAgent && agentDisabled);
            const isSelected = selected === opt.id || (opt.id === "agent" && selected === "cloud");
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabledOption}
                aria-pressed={isSelected}
                aria-disabled={disabledOption || undefined}
                onClick={() => {
                  if (!disabledOption) setSelected(opt.id);
                }}
                className={`flex w-full items-start gap-3 border text-left ${radius.lg} px-4 py-3.5 transition ${
                  isSelected
                    ? `border-orange-300 bg-orange-50/80 ring-2 ring-orange-200/80 ${shadows.sm}`
                    : `border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 ${shadows.sm}`
                } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white`}
              >
                <span
                  className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center ${radius.lg} ${
                    isSelected ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600"
                  }`}
                  aria-hidden
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={typography.bodyStrong}>
                      {opt.title}
                      {opt.legacy ? (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                          DEV
                        </span>
                      ) : null}
                    </span>
                    {opt.info ? <InfoPopover text={opt.info} label="Informacja o Sasist Agent" /> : null}
                  </span>
                  <span className={`mt-0.5 block ${typography.bodyMuted}`}>
                    {isAgent && agentDisabled
                      ? "Niedostępne — brak aktywnego Agenta lub mapowania na stanowisku."
                      : opt.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </PageHeader>
    </Dialog>
  );
}
