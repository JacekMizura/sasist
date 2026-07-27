import { useCallback, useEffect, useId, useState, type MouseEvent, type ReactNode } from "react";
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

const CLOUD_PRINT_INFO =
  "Sasist Cloud Print umożliwia automatyczne drukowanie dokumentów bez otwierania okna drukowania. Po skonfigurowaniu domyślnej drukarki dokument zostanie wysłany bezpośrednio do wydruku.";

type MethodOption = {
  id: PrintMethod;
  title: string;
  description: string;
  icon: typeof Printer;
  info?: string;
};

const OPTIONS: MethodOption[] = [
  {
    id: "browser",
    title: "Drukuj",
    description: "Wydruk przez okno drukowania przeglądarki.",
    icon: Printer,
  },
  {
    id: "cloud",
    title: "Sasist Cloud Print",
    description: "Automatyczny wydruk na skonfigurowanej drukarce.",
    icon: Cloud,
    info: CLOUD_PRINT_INFO,
  },
  {
    id: "download",
    title: "Pobierz PDF",
    description: "Pobierz dokument jako plik PDF.",
    icon: Download,
  },
];

export type PrintMethodDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (method: PrintMethod) => void | Promise<void>;
  /** Disable confirm while an action runs. */
  pending?: boolean;
  title?: ReactNode;
  description?: ReactNode;
  /** Cloud Print readiness — disables cloud tile when not ready. */
  cloudCapability?: CloudPrintCapability | null;
};

function CloudInfoPopover({ text }: { text: string }) {
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
        aria-label="Informacja o Sasist Cloud Print"
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
 * Standard Sasist print-method dialog — browser / Cloud Print / PDF download.
 * Use with `usePrintMethodFlow` so a configured default Cloud printer skips this UI.
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
  const [selected, setSelected] = useState<PrintMethod>("browser");
  const cloudDisabled = cloudCapability != null && !cloudCapability.ready;
  const cloudHint = cloudDisabled ? cloudPrintUnavailableMessage(cloudCapability) : null;

  useEffect(() => {
    if (open) setSelected("browser");
  }, [open]);

  useEffect(() => {
    if (selected === "cloud" && cloudDisabled) setSelected("browser");
  }, [cloudDisabled, selected]);

  const handleConfirm = useCallback(() => {
    void onConfirm(selected);
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
        {cloudDisabled && cloudHint ? (
          <p className={`mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 ${typography.bodyMuted} text-amber-950 whitespace-pre-line`}>
            {cloudHint}
          </p>
        ) : null}
        <div className={`mt-4 flex flex-col ${spacing.gap2}`}>
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isCloud = opt.id === "cloud";
            const disabledOption = pending || (isCloud && cloudDisabled);
            const isSelected = selected === opt.id;
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
                    <span className={typography.bodyStrong}>{opt.title}</span>
                    {opt.info ? <CloudInfoPopover text={opt.info} /> : null}
                  </span>
                  <span className={`mt-0.5 block ${typography.bodyMuted}`}>
                    {isCloud && cloudDisabled
                      ? "Niedostępne — brak aktywnego agenta lub domyślnej drukarki."
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
