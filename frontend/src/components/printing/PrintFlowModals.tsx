import { PrintMethodDialog } from "./PrintMethodDialog";
import { PrintWorkstationDialog } from "./PrintWorkstationDialog";
import type { usePrintMethodFlow } from "./usePrintMethodFlow";

type Flow = ReturnType<typeof usePrintMethodFlow>;

/** Renders station picker + alternative method dialog for a print flow instance. */
export function PrintFlowModals({ flow }: { flow: Flow }) {
  return (
    <>
      <PrintWorkstationDialog
        open={flow.stationPickerOpen}
        stations={flow.stations}
        pending={flow.pending}
        initialSelectedId={flow.lastUsedStationId}
        onClose={flow.close}
        onConfirm={flow.confirmStation}
        onChooseAlternative={flow.openAlternativeFromPicker}
      />
      <PrintMethodDialog
        open={flow.methodOpen || flow.open}
        pending={flow.pending}
        cloudCapability={flow.cloudCapability}
        preferSasistAgent={flow.preferSasistAgent}
        alternativesOnly={flow.alternativesOnly}
        onClose={flow.close}
        onConfirm={flow.confirmMethod}
      />
    </>
  );
}
