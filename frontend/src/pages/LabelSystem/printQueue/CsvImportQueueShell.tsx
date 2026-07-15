import {
  Filter,
  Layers,
  Settings2,
  Tag,
  Upload,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import type { LabelRecord } from "../../../types/labelSystem";
import type { LabelPreviewCardTemplate } from "../LabelPreviewCard";
import { PrintModeCards, type PrintQueueMode } from "./printQueueUi";
import PrintQueueAccordion from "./PrintQueueAccordion";
import PrintQueueLabelPreviewPane from "./PrintQueueLabelPreviewPane";
import PrintQueueStepWizard, { type PrintQueueWizardStepId } from "./PrintQueueStepWizard";
import PrintQueueSummaryPanel, { type MappingSummaryState } from "./PrintQueueSummaryPanel";
import PrintQueueThreeColumnLayout from "./PrintQueueThreeColumnLayout";

export type CsvImportAccordionId = "template" | "profile" | "data" | "filters" | "advanced";

type Props = {
  printMode: PrintQueueMode;
  onPrintModeChange: (m: PrintQueueMode) => void;
  currentStep: PrintQueueWizardStepId;
  onStepClick?: (step: PrintQueueWizardStepId) => void;

  templateSummary?: string;
  profileSummary?: string;
  dataSummary?: string;
  filtersSummary?: string;

  templateSection: ReactNode;
  profileSection: ReactNode;
  dataSection: ReactNode;
  filtersSection: ReactNode;
  advancedSection: ReactNode;

  previewTemplate: LabelPreviewCardTemplate | null;
  previewRecords: Array<LabelRecord | Record<string, unknown>>;
  previewLoading?: boolean;

  summaryTiles: Array<{ label: string; value: ReactNode }>;
  mapping: MappingSummaryState;
  generateLabel: string;
  generateDisabled: boolean;
  onGenerate: () => void;
  printLabel?: string;
  printDisabled?: boolean;
  onPrint?: () => void;
  printersSlot?: ReactNode;
  footerNote?: ReactNode;
};

const DEFAULT_OPEN: Record<CsvImportAccordionId, boolean> = {
  template: true,
  profile: true,
  data: true,
  filters: false,
  advanced: false,
};

/**
 * CSV import print-queue: wizard + 3-column shell (config | preview | summary).
 * Presentational — all print logic stays in LabelPrintQueue.
 */
export default function CsvImportQueueShell({
  printMode,
  onPrintModeChange,
  currentStep,
  onStepClick,
  templateSummary,
  profileSummary,
  dataSummary,
  filtersSummary,
  templateSection,
  profileSection,
  dataSection,
  filtersSection,
  advancedSection,
  previewTemplate,
  previewRecords,
  previewLoading,
  summaryTiles,
  mapping,
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

  const toggle = (id: CsvImportAccordionId) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStepClick = (step: PrintQueueWizardStepId) => {
    onStepClick?.(step);
    const focus = ({ 1: "template", 2: "data", 3: "filters" } as const)[step as 1 | 2 | 3];
    if (focus) {
      setOpenMap((prev) => ({ ...prev, [focus]: true }));
      setLeftOpen(true);
    }
    if (step === 5) setRightDrawerOpen(true);
  };

  const left = (
    <div className="space-y-3">
      <PrintQueueAccordion
        id="pq-template"
        title="Szablon"
        icon={Tag}
        open={openMap.template}
        onToggle={() => toggle("template")}
        summary={templateSummary}
      >
        {templateSection}
      </PrintQueueAccordion>
      <PrintQueueAccordion
        id="pq-profile"
        title="Profil drukowania"
        icon={Layers}
        open={openMap.profile}
        onToggle={() => toggle("profile")}
        summary={profileSummary}
      >
        {profileSection}
      </PrintQueueAccordion>
      <PrintQueueAccordion
        id="pq-data"
        title="Dane"
        icon={Upload}
        open={openMap.data}
        onToggle={() => toggle("data")}
        summary={dataSummary}
      >
        {dataSection}
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
        id="pq-advanced"
        title="Ustawienia zaawansowane"
        icon={Settings2}
        open={openMap.advanced}
        onToggle={() => toggle("advanced")}
        summary="Grupowanie CSV, PDF drukarni, termika"
      >
        {advancedSection}
      </PrintQueueAccordion>
    </div>
  );

  const center = (
    <PrintQueueLabelPreviewPane
      template={previewTemplate}
      records={previewRecords}
      loading={previewLoading}
    />
  );

  const right = (
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
  );

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-white">
      <div className="mx-auto w-full space-y-5 px-4 py-5 pb-12 md:px-6 min-[1600px]:px-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Typ wydruku</p>
          <PrintModeCards value={printMode} onChange={onPrintModeChange} />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm md:px-6">
          <PrintQueueStepWizard currentStep={currentStep} onStepClick={handleStepClick} />
        </div>

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
