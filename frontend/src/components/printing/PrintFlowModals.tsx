import { PrintDocumentDialog } from "./PrintDocumentDialog";
import type { usePrintMethodFlow } from "./usePrintMethodFlow";

type Flow = ReturnType<typeof usePrintMethodFlow>;

/** Renders the operator print dialog for a print flow instance. */
export function PrintFlowModals({ flow }: { flow: Flow }) {
  return (
    <PrintDocumentDialog
      open={flow.dialogOpen || flow.open}
      title={flow.title}
      description={flow.description}
      pending={flow.pending}
      templates={flow.templates}
      stations={flow.stations}
      initialTemplateVersionId={flow.initialTemplateVersionId}
      initialWorkstationId={flow.initialWorkstationId}
      stationPrintAvailable={flow.stationPrintAvailable}
      stationUnavailableMessage={flow.stationUnavailableMessage}
      onClose={flow.close}
      onConfirm={flow.confirmSelection}
    />
  );
}
