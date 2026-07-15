/**
 * Shared print-queue workspace: mode cards + optional wizard + 3-column layout.
 * Presentational only — handlers and data stay in LabelPrintQueue.
 */
import { Database, Filter, Settings2, SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { LabelRecord } from "../../../types/labelSystem";
import type { LabelPreviewCardTemplate } from "../LabelPreviewCard";
import { PrintModeCards, type PrintQueueMode } from "./printQueueUi";
import PrintQueueAccordion from "./PrintQueueAccordion";
import PrintQueueLabelPreviewPane from "./PrintQueueLabelPreviewPane";
import PrintQueueStepWizard, { type PrintQueueWizardStepId } from "./PrintQueueStepWizard";
import PrintQueueSummaryPanel, { type MappingSummaryState } from "./PrintQueueSummaryPanel";
import PrintQueueThreeColumnLayout from "./PrintQueueThreeColumnLayout";

export type PrintQueueAccordionsOpen = {
  data: boolean;
  config: boolean;
  filters: boolean;
  options: boolean;
};

type Props = {
  printMode: PrintQueueMode;
  onPrintModeChange: (m: PrintQueueMode) => void;
  currentStep?: PrintQueueWizardStepId;
  onStepClick?: (step: PrintQueueWizardStepId) => void;
  showWizard?: boolean;

  dataSummary?: string;
  configSummary?: string;
  filtersSummary?: string;
  optionsSummary?: string;

  dataSection: ReactNode;
  configSection: ReactNode;
  filtersSection: ReactNode;
  optionsSection: ReactNode;

  previewTemplate: LabelPreviewCardTemplate | null;
  previewRecords: Array<LabelRecord | Record<string, unknown>>;
  previewLoading?: boolean;
  previewEmptyMessage?: string;

  summaryTiles: Array<{ label: string; value: ReactNode }>;
  mapping?: MappingSummaryState;
  warnings?: ReactNode;
  generateLabel: string;
  generateDisabled: boolean;
  onGenerate: () => void;
  printLabel?: string;
  printDisabled?: boolean;
  onPrint?: () => void;
  printersSlot?: ReactNode;
  footerNote?: ReactNode;
};

const DEFAULT_OPEN: PrintQueueAccordionsOpen = {
  data: true,
  config: true,
  filters: true,
  options: false,
};

export default function PrintQueueWorkspaceShell({
  printMode,
  onPrintModeChange,
  currentStep = 4,
  onStepClick,
  showWizard = true,
  dataSummary,
  configSummary,
  filtersSummary,
  optionsSummary,
  dataSection,
  configSection,
  filtersSection,
  optionsSection,
  previewTemplate,
  previewRecords,
  previewLoading,
  previewEmptyMessage,
  summaryTiles,
  mapping = { kind: "na" },
  warnings,
  generateLabel,
  generateDisabled,
  onGenerate,
  printLabel,
  printDisabled,
  onPrint,
  printersSlot,
  footerNote,
}: Props) {
  const [openMap, setOpenMap] = useState(DEFAULT_OPEN);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  const toggle = (id: keyof PrintQueueAccordionsOpen) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStepClick = (step: PrintQueueWizardStepId) => {
    onStepClick?.(step);
    if (step === 2) {
      setOpenMap((p) => ({ ...p, data: true }));
      setLeftOpen(true);
    }
    if (step === 3) {
      setOpenMap((p) => ({ ...p, filters: true }));
      setLeftOpen(true);
    }
    if (step === 5) setRightDrawerOpen(true);
  };

  const left = (
    <div className="space-y-3">
      <PrintQueueAccordion
        id="pq-data"
        title="Dane źródłowe"
        icon={Database}
        open={openMap.data}
        onToggle={() => toggle("data")}
        summary={dataSummary}
      >
        {dataSection}
      </PrintQueueAccordion>
      <PrintQueueAccordion
        id="pq-config"
        title="Konfiguracja"
        icon={SlidersHorizontal}
        open={openMap.config}
        onToggle={() => toggle("config")}
        summary={configSummary}
      >
        {configSection}
      </PrintQueueAccordion>
      <PrintQueueAccordion
        id="pq-filters"
        title="Filtry"
        icon={Filter}
        open={openMap.filters}
        onToggle={() => toggle("filters")}
        summary={filtersSummary}
      >
        {filtersSection}
      </PrintQueueAccordion>
      <PrintQueueAccordion
        id="pq-options"
        title="Opcje"
        icon={Settings2}
        open={openMap.options}
        onToggle={() => toggle("options")}
        summary={optionsSummary ?? "PDF drukarni, termika, grupowanie"}
      >
        {optionsSection}
      </PrintQueueAccordion>
    </div>
  );

  const center = (
    <PrintQueueLabelPreviewPane
      template={previewTemplate}
      records={previewRecords}
      loading={previewLoading}
      emptyMessage={previewEmptyMessage}
    />
  );

  const right = (
    <div className="space-y-3">
      {warnings ? <div className="space-y-2">{warnings}</div> : null}
      <PrintQueueSummaryPanel
        tiles={summaryTiles}
        mapping={mapping}
        generateLabel={generateLabel}
        generateDisabled={generateDisabled}
        onGenerate={onGenerate}
        printLabel={printLabel}
        printDisabled={printDisabled}
        onPrint={onPrint}
        printersSlot={printersSlot}
        footerNote={footerNote}
      />
    </div>
  );

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-white">
      <div className="mx-auto w-full space-y-5 px-4 py-5 pb-12 md:px-6 min-[1600px]:px-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Typ wydruku</p>
          <PrintModeCards value={printMode} onChange={onPrintModeChange} />
        </div>

        {showWizard ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm md:px-6">
            <PrintQueueStepWizard currentStep={currentStep} onStepClick={handleStepClick} />
          </div>
        ) : null}

        <PrintQueueThreeColumnLayout
          left={left}
          center={center}
          right={right}
          leftOpen={leftOpen}
          onToggleLeft={() => setLeftOpen((v) => !v)}
          rightDrawerOpen={rightDrawerOpen}
          onCloseRightDrawer={() => setRightDrawerOpen(false)}
          onOpenRightDrawer={() => setRightDrawerOpen(true)}
        />
      </div>
    </div>
  );
}
