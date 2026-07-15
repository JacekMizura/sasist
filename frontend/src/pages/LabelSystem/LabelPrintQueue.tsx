import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { warn } from "../../utils/logger";
import { jsPDF } from "jspdf";
import api from "../../api/axios";
import { useQueuePrint } from "../../hooks/useQueuePrint";
import { useWarehouse } from "../../context/WarehouseContext";
import type {
  LabelTemplate,
  LabelRecord,
  SelectionMode,
  RepeaterElement,
  TemplateElement,
} from "../../types/labelSystem";
import type { Printer } from "../../types/printer";
import type { PrinterProfile } from "../../types/printerProfiles";
import { jsPdfOrientationForLabelShape, labelPageSizePt } from "../../utils/labels/labelPdfPageSetup";
import { chunkDataset } from "../../utils/labels/chunkDataset";
import {
  type LabelDatasetPrepareOptions,
  type RackDatasetTransformMode,
  transformLocations,
} from "../../utils/labels/rackLabelDataset";
import { drawSvgVector } from "../../utils/labels/svgToPdfVector";
import { getRecordsFromLayout } from "./labelData";
import { filterLabelRecordsByExcludeFloors } from "../../utils/labelFloorFilter";
import {
  buildColumnMappingWithPersistence,
  filterDerivedGroupSlotsFromCsvMapping,
  buildLabelRecordsFromCsvRows,
  dedupeLabelRecordsByRackFloorRow,
  sanitizeRecordsForRenderPdf,
  extractTemplateDataBindingKeys,
  mappedTargetFields,
  mergeParsedCsvSources,
  parseCsv,
  polishLabelCsvFieldForUi,
  saveCsvLabelMapping,
  sanitizeTemplateJsonDimensionsForCsvExport,
  type CsvFileRowStats,
  validateCsvAgainstTemplate,
  validateGroupedVariablesRequireGrouping,
  csvGroupingPdfBlockedByTemplate,
} from "./labelCsvImport";
import {
  CSV_IMPORT_PRINT_KINDS,
  type CsvImportPrintKind,
  templateMatchesCsvPrintKind,
} from "./csvMapping/csvImportPrintKinds";
import CsvMappingModal from "./csvMapping/CsvMappingModal";
import CsvTemplatePicker from "./csvMapping/CsvTemplatePicker";
import { resolveTemplateUsedVariables } from "./csvMapping/labelCsvMappingFields";
import PrintQueueWorkspaceShell from "./printQueue/PrintQueueWorkspaceShell";
import type { PrintQueueWizardStepId } from "./printQueue/PrintQueueStepWizard";
import {
  getCsvGroupingPreview,
  sanitizeFloorSetsMatrix,
} from "../../utils/labels/csvGroupingPreview";
import { FloorExclusionPanel, excludeFloorsFromUiState, type FloorFilterUiState } from "./FloorExclusionPanel";
import { labelModuleBasePath } from "./labelModuleBasePath";
import { renderLabel } from "../../labelRenderer";
import {
  connectQZ,
  listSystemPrinters,
  printPdf,
  isQzAvailable,
  setQzSecurity,
} from "../../printing/qzService";
import {
  PrintQueueSecondaryButton,
  humanizeCsvSanitizeWarning,
} from "./printQueue/printQueueUi";
import { useLabelPrintingPrinters } from "./hooks/useLabelPrintingPrinters";
import { LabelPrintingProfileField } from "./printQueue/LabelPrintingProfileField";
import { formatProfileSummaryLabel } from "./printQueue/labelProfileDisplay";
import { resolveLabelQueuePrinterSelection } from "./printQueue/labelQueuePrinterSelection";

const TENANT_ID = 1;

/** Optional `POST /labels/render-pdf` body (CSV): backend merges rows by ``row`` / ``rack_name`` before PDF. */
function labelRenderPdfCsvGroupBody(byRack: boolean): { group_mode: boolean; group_by_rack: boolean } {
  return { group_mode: true, group_by_rack: byRack };
}

type Props = {
  template: LabelTemplate;
  onTemplateChange: (t: LabelTemplate) => void;
};

type CartListItem = { id: number; name: string; type?: string };

type ApiLabelTemplateRow = {
  id: number;
  name: string;
  template_type?: string | null;
  template_json?: string;
  available_variables?: string[] | null;
  variables?: string[] | null;
};

export function LabelPrintQueue({ template }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const labelBase = labelModuleBasePath(pathname);
  const [printMode, setPrintMode] = useState<
    "location" | "cart_basket" | "rack" | "rack_strip" | "pdf_import" | "csv_import"
  >("location");
  const { warehouse: activeWarehouse } = useWarehouse();
  const selectedWarehouseId = activeWarehouse?.id ?? null;
  const { queueLabelPrint } = useQueuePrint({ tenantId: TENANT_ID, warehouseId: selectedWarehouseId });
  const [cartList, setCartList] = useState<CartListItem[]>([]);
  const [selectedCartId, setSelectedCartId] = useState<number | null>(null);
  const [generatingBasketLabels, setGeneratingBasketLabels] = useState(false);
  const [rackRack, setRackRack] = useState("A");
  const [rackLevels, setRackLevels] = useState(5);
  const [rackPositions, setRackPositions] = useState(4);
  const [rackZone, setRackZone] = useState("");
  const [rackRecords, setRackRecords] = useState<LabelRecord[]>([]);
  const [rackGenerating, setRackGenerating] = useState(false);
  const [rackPdfLoading, setRackPdfLoading] = useState(false);
  const [pdfImportBarcodes, setPdfImportBarcodes] = useState<string[]>([]);
  const [pdfImportLoading, setPdfImportLoading] = useState(false);
  const [pdfImportError, setPdfImportError] = useState<string | null>(null);
  const [pdfImportPdfLoading, setPdfImportPdfLoading] = useState(false);
  const [allLabelTemplatesForCsv, setAllLabelTemplatesForCsv] = useState<ApiLabelTemplateRow[]>([]);
  const [selectedCsvTemplateId, setSelectedCsvTemplateId] = useState<number | null>(null);
  /** Friendly print kind for Import CSV — filters template list (never shown as raw type ids). */
  const [csvImportPrintKind, setCsvImportPrintKind] = useState<CsvImportPrintKind>("locations");
  const [csvMappingModalOpen, setCsvMappingModalOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvColumnToField, setCsvColumnToField] = useState<Record<string, string>>({});
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const [csvImportLoading, setCsvImportLoading] = useState(false);
  const [csvPdfLoading, setCsvPdfLoading] = useState(false);
  const [csvPerFileStats, setCsvPerFileStats] = useState<CsvFileRowStats[]>([]);
  const [csvMergeWarnings, setCsvMergeWarnings] = useState<string[]>([]);
  const [csvDedupeRackFloorRow, setCsvDedupeRackFloorRow] = useState(false);
  const [stripRack, setStripRack] = useState("A");
  const [stripLevel, setStripLevel] = useState(1);
  const [stripStart, setStripStart] = useState(1);
  const [stripEnd, setStripEnd] = useState(10);
  const [stripRecords, setStripRecords] = useState<LabelRecord[]>([]);
  const [stripGenerating, setStripGenerating] = useState(false);
  const [stripPdfLoading, setStripPdfLoading] = useState(false);
  const [layout, setLayout] = useState<{
    racks?: { aisle_letter?: string; rack_index?: number; bins?: { label?: string; barcode_data?: string; location_id?: string; level_index?: number; segment_index?: number; storage_type?: string; volume_dm3?: number }[] }[];
    visual_elements?: { type?: string; zoneType?: string; name?: string }[];
  } | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("all");
  const [selectedRackIds, setSelectedRackIds] = useState<string[]>([]);
  const [manualLocationIds, setManualLocationIds] = useState<string[]>([]);
  const [manualLocationSearch, setManualLocationSearch] = useState("");
  const [thermalMode, setThermalMode] = useState(() => {
    try {
      const v = localStorage.getItem("label_print_thermal_mode");
      return v !== "false";
    } catch {
      return true;
    }
  });
  const [loading, setLoading] = useState(false);
  const [locationTemplates, setLocationTemplates] = useState<{ id: number; name: string; is_default: boolean }[]>([]);
  const [selectedLocationTemplateId, setSelectedLocationTemplateId] = useState<number | null>(null);
  const [locationPreviewTemplate, setLocationPreviewTemplate] = useState<LabelTemplate | null>(null);
  const [locationPreviewLoading, setLocationPreviewLoading] = useState(false);
  const [rackPreviewTemplate, setRackPreviewTemplate] = useState<LabelTemplate | null>(null);
  const [rackPreviewLoading, setRackPreviewLoading] = useState(false);
  const { printers, profiles, legacyPrinters, agentPrinters, systemPrinters, setSystemPrinters, reloadPrinters } =
    useLabelPrintingPrinters({
      tenantId: TENANT_ID,
      warehouseId: selectedWarehouseId,
    });
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
  const [backendPdfFallbackWarning, setBackendPdfFallbackWarning] = useState(false);
  const [qzReady, setQzReady] = useState(false);
  const [qzChecking, setQzChecking] = useState(true);
  const [printing, setPrinting] = useState(false);
  /** Repeater strip: locations per physical label (auto = derive from template geometry). */
  const [labelDatasetItemsPerLabel, setLabelDatasetItemsPerLabel] = useState<"auto" | 3 | 5 | 10>("auto");
  /** Order flat locations before chunking (warehouse row/column semantics). */
  const [labelDatasetTransformMode, setLabelDatasetTransformMode] =
    useState<RackDatasetTransformMode>("sequential");
  /** Optional bins-per-level hint for ordering (optional). */
  const [labelDatasetColumnsHint, setLabelDatasetColumnsHint] = useState("");
  /** Floors to exclude from location PDF (e.g. A, F). Matched to parsed loc_name or record.floor. */
  const [floorFilterUi, setFloorFilterUi] = useState<FloorFilterUiState>({ mode: "exclude", tokens: [] });
  const excludeFloors = useMemo(() => excludeFloorsFromUiState(floorFilterUi), [floorFilterUi]);
  /** Backend `/labels/render-pdf`: bleed + crop marks when true (standard PDF when false). */
  const [pdfPrintReady, setPdfPrintReady] = useState(false);
  /** CSV → PDF only: merge up to 3 records per row before `render-pdf` (`floor_1..3`, `barcode_1..3`). */
  const [csvGroupMode, setCsvGroupMode] = useState(false);
  const [csvGroupByRack, setCsvGroupByRack] = useState(false);
  /** CSV group_mode: optional `floor_sets` — merge by (row, set); built from chip UI (→ JSON w API). */
  const [csvFloorSets, setCsvFloorSets] = useState<string[][]>([]);
  const [csvFloorDraftInput, setCsvFloorDraftInput] = useState("");
  const [csvFloorDraftTokens, setCsvFloorDraftTokens] = useState<string[]>([]);

  const csvFloorSetsNormalized = useMemo(() => sanitizeFloorSetsMatrix(csvFloorSets), [csvFloorSets]);

  useEffect(() => {
    if (printMode !== "cart_basket") return;
    (async () => {
      try {
        const res = await api.get<Array<{ id?: number; name?: string; is_group?: boolean; items?: CartListItem[] }>>("/carts/", { params: { tenant_id: TENANT_ID } });
        const data = Array.isArray(res.data) ? res.data : [];
        const flat: CartListItem[] = data.flatMap((g) => (Array.isArray(g.items) ? g.items : []));
        setCartList(flat);
        if (flat.length > 0 && selectedCartId === null) setSelectedCartId(flat[0].id);
      } catch {
        setCartList([]);
      }
    })();
  }, [printMode, selectedCartId]);

  useEffect(() => {
    let cancelled = false;
    if (!isQzAvailable()) {
      setQzChecking(false);
      setQzReady(false);
      return;
    }
    setQzSecurity((toSign: string) =>
      api.get<{ signature: string }>("/qz/sign", { params: { request: toSign } }).then((r) => r.data.signature)
    );
    (async () => {
      try {
        await connectQZ();
        if (!cancelled) setQzReady(true);
      } catch {
        if (!cancelled) setQzReady(false);
      } finally {
        if (!cancelled) setQzChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadLayout = useCallback(async () => {
    if (selectedWarehouseId == null) return;
    setLoading(true);
    try {
      const res = await api.get("/warehouse/layout", {
        params: { tenant_id: TENANT_ID, warehouse_id: selectedWarehouseId },
      });
      setLayout(res.data?.layout ?? res.data);
    } catch {
      setLayout(null);
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (selectedWarehouseId != null) loadLayout();
    else setLayout(null);
  }, [selectedWarehouseId, loadLayout]);

  useEffect(() => {
    if (printMode !== "location" && printMode !== "rack" && printMode !== "rack_strip" && printMode !== "pdf_import") return;
    api.get<{ id: number; name: string; is_default: boolean }[]>("/labels/templates/by-type/location/", { params: { tenant_id: TENANT_ID } })
      .then((res) => setLocationTemplates(Array.isArray(res.data) ? res.data : []))
      .catch(() => setLocationTemplates([]));
  }, [printMode]);

  useEffect(() => {
    if (printMode !== "csv_import") return;
    let cancelled = false;
    api
      .get<ApiLabelTemplateRow[]>("/label-templates", { params: { tenant_id: TENANT_ID } })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setAllLabelTemplatesForCsv(list);
      })
      .catch(() => {
        if (!cancelled) {
          setAllLabelTemplatesForCsv([]);
          setSelectedCsvTemplateId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [printMode]);

  const csvTemplatesForPrintKind = useMemo(
    () =>
      allLabelTemplatesForCsv.filter((t) =>
        templateMatchesCsvPrintKind(t.template_type, csvImportPrintKind),
      ),
    [allLabelTemplatesForCsv, csvImportPrintKind],
  );

  useEffect(() => {
    if (printMode !== "csv_import") return;
    setSelectedCsvTemplateId((prev) => {
      if (prev != null && csvTemplatesForPrintKind.some((t) => t.id === prev)) return prev;
      return csvTemplatesForPrintKind[0]?.id ?? null;
    });
  }, [printMode, csvTemplatesForPrintKind]);

  const selectedCsvTemplateRow = useMemo(
    () => csvTemplatesForPrintKind.find((t) => t.id === selectedCsvTemplateId) ?? null,
    [csvTemplatesForPrintKind, selectedCsvTemplateId],
  );

  const csvTemplateParsed = useMemo((): LabelTemplate | null => {
    const raw = selectedCsvTemplateRow?.template_json;
    if (!raw?.trim()) return null;
    try {
      const parsed = JSON.parse(raw) as LabelTemplate;
      if (!parsed.template_type && selectedCsvTemplateRow?.template_type) {
        parsed.template_type = selectedCsvTemplateRow.template_type as LabelTemplate["template_type"];
      }
      if (!parsed.available_variables?.length && selectedCsvTemplateRow?.available_variables?.length) {
        parsed.available_variables = selectedCsvTemplateRow.available_variables;
      }
      if (!parsed.variables?.length && selectedCsvTemplateRow?.variables?.length) {
        parsed.variables = selectedCsvTemplateRow.variables;
      }
      return parsed;
    } catch {
      return null;
    }
  }, [selectedCsvTemplateRow]);

  const csvTemplateBindingInfo = useMemo(
    () => extractTemplateDataBindingKeys(csvTemplateParsed),
    [csvTemplateParsed],
  );

  const csvSelectedTemplateType =
    selectedCsvTemplateRow?.template_type ?? csvTemplateParsed?.template_type ?? null;

  /** Warn / note when stored template_json uses office-sheet mm; PDF request uses sanitized dimensions. */
  const csvTemplateDimensionHints = useMemo(() => {
    const raw = selectedCsvTemplateRow?.template_json?.trim();
    if (!raw) return { warnings: [] as string[], replacedA4Like: false };
    return sanitizeTemplateJsonDimensionsForCsvExport(raw);
  }, [selectedCsvTemplateRow]);

  const csvGroupingPdfBlocked = useMemo(
    () => csvGroupingPdfBlockedByTemplate(csvTemplateBindingInfo.keys, csvGroupMode),
    [csvTemplateBindingInfo.keys, csvGroupMode],
  );

  /** UI may keep grupowanie on, but PDF request skips merge when szablon nie ma slotów grupowych. */
  const csvPdfRequestUsesGrouping = useMemo(
    () => csvGroupMode && !csvGroupingPdfBlocked,
    [csvGroupMode, csvGroupingPdfBlocked],
  );

  const csvValidationWarnings = useMemo(() => {
    const base = validateCsvAgainstTemplate(
      csvTemplateBindingInfo.keys,
      csvTemplateBindingInfo.hasRepeater,
      csvColumnToField,
    );
    const grouped = validateGroupedVariablesRequireGrouping(csvTemplateBindingInfo.keys, csvGroupMode);
    return [...grouped, ...base];
  }, [
    csvTemplateBindingInfo.keys,
    csvTemplateBindingInfo.hasRepeater,
    csvColumnToField,
    csvGroupMode,
  ]);

  useEffect(() => {
    if (csvHeaders.length === 0) return;
    setCsvColumnToField((prev) => {
      const next = filterDerivedGroupSlotsFromCsvMapping(prev);
      for (const h of csvHeaders) {
        if ((prev[h] ?? "") !== (next[h] ?? "")) {
          saveCsvLabelMapping(csvHeaders, next);
          return next;
        }
      }
      return prev;
    });
  }, [selectedCsvTemplateId, csvHeaders]);

  const csvLabelRecords = useMemo(() => {
    if (csvRows.length === 0) return [];
    let rec = buildLabelRecordsFromCsvRows(csvRows, csvColumnToField);
    if (csvDedupeRackFloorRow && rec.length > 0) {
      rec = dedupeLabelRecordsByRackFloorRow(rec);
    }
    return sanitizeRecordsForRenderPdf(rec);
  }, [csvRows, csvColumnToField, csvDedupeRackFloorRow]);

  const csvRecordsFiltered = useMemo(
    () => filterLabelRecordsByExcludeFloors(csvLabelRecords, excludeFloors),
    [csvLabelRecords, excludeFloors],
  );

  /** Same record pipeline as PDF merge input: build → dedupe → exclude_floors → sanitize (server filters before merge). */
  const csvGroupingPreviewState = useMemo(() => {
    if (printMode !== "csv_import" || !csvPdfRequestUsesGrouping || csvRows.length === 0) return null;
    let rec = buildLabelRecordsFromCsvRows(csvRows, csvColumnToField);
    if (csvDedupeRackFloorRow && rec.length > 0) {
      rec = dedupeLabelRecordsByRackFloorRow(rec);
    }
    rec = filterLabelRecordsByExcludeFloors(rec, excludeFloors);
    if (rec.length === 0) {
      return { kind: "no_rows" as const };
    }
    const sanitized = sanitizeRecordsForRenderPdf(rec);
    const preview = getCsvGroupingPreview(sanitized as Record<string, unknown>[], {
      byRack: csvGroupByRack,
      floorSets: csvFloorSetsNormalized,
    });
    return { kind: "ready" as const, preview };
  }, [
    printMode,
    csvPdfRequestUsesGrouping,
    csvRows,
    csvColumnToField,
    csvDedupeRackFloorRow,
    excludeFloors,
    csvGroupByRack,
    csvFloorSetsNormalized,
  ]);

  const templateIdForPreview =
    selectedLocationTemplateId ??
    locationTemplates.find((t) => t.is_default)?.id ??
    locationTemplates[0]?.id ??
    null;

  const records = layout ? getRecordsFromLayout(layout, selectionMode, selectedRackIds, manualLocationIds) : [];

  const locationRecordsFiltered = useMemo(
    () => filterLabelRecordsByExcludeFloors(records, excludeFloors),
    [records, excludeFloors]
  );

  const csvFloorSummaryFooter = useMemo(() => {
    const active =
      (floorFilterUi.mode === "exclude" && excludeFloors.length > 0) ||
      (floorFilterUi.mode === "include_only" && floorFilterUi.tokens.length > 0);
    if (!active) return null;
    return (
      <>
        {floorFilterUi.mode === "include_only" ? (
          <>
            Tylko piętra <span className="font-mono">{floorFilterUi.tokens.join(", ")}</span> — pozostaje{" "}
          </>
        ) : (
          <>
            Wykluczone: <span className="font-mono">{[...excludeFloors].sort().join(", ")}</span> — pozostaje{" "}
          </>
        )}
        <strong>{csvRecordsFiltered.length}</strong> wierszy etykiet (z {csvRows.length}).
      </>
    );
  }, [floorFilterUi, excludeFloors, csvRecordsFiltered.length, csvRows.length]);

  const locationFloorSummaryFooter = useMemo(() => {
    const active =
      (floorFilterUi.mode === "exclude" && excludeFloors.length > 0) ||
      (floorFilterUi.mode === "include_only" && floorFilterUi.tokens.length > 0);
    if (!active) return null;
    return (
      <>
        {floorFilterUi.mode === "include_only" ? (
          <>
            Tylko piętra <span className="font-mono">{floorFilterUi.tokens.join(", ")}</span> — pozostaje{" "}
          </>
        ) : (
          <>
            Wykluczone: <span className="font-mono">{[...excludeFloors].sort().join(", ")}</span> — pozostaje{" "}
          </>
        )}
        <strong>{locationRecordsFiltered.length}</strong> lokalizacji (z {records.length}).
      </>
    );
  }, [floorFilterUi, excludeFloors, locationRecordsFiltered.length, records.length]);

  const labelDatasetPrepare = useMemo((): LabelDatasetPrepareOptions => {
    const colHint = labelDatasetColumnsHint.trim();
    const columnsParsed =
      colHint === "" ? undefined : Math.max(1, Math.min(999, parseInt(colHint, 10) || 0));
    return {
      transformMode: labelDatasetTransformMode,
      itemsPerLabel:
        labelDatasetItemsPerLabel === "auto"
          ? undefined
          : labelDatasetItemsPerLabel,
      columns: columnsParsed && columnsParsed > 0 ? columnsParsed : undefined,
    };
  }, [labelDatasetTransformMode, labelDatasetItemsPerLabel, labelDatasetColumnsHint]);

  /** Page records (dataset structure for repeaters) — same as PDF pipeline. Used for preview and PDF. */
  const locationPageRecords = useMemo(() => {
    if (!locationRecordsFiltered.length) return [];
    const t = locationPreviewTemplate ?? template;
    return buildPageRecords(t, locationRecordsFiltered, labelDatasetPrepare);
  }, [locationPreviewTemplate, template, locationRecordsFiltered, labelDatasetPrepare]);

  const rackPageRecords = useMemo(() => {
    if (!rackRecords.length) return [];
    const tmpl = rackPreviewTemplate ?? template;
    return buildRecordsLikeRackLabelModal(tmpl, rackRecords, labelDatasetPrepare);
  }, [rackPreviewTemplate, template, rackRecords, labelDatasetPrepare]);

  useEffect(() => {
    if (printMode !== "location" || templateIdForPreview == null) {
      setLocationPreviewTemplate(null);
      return;
    }
    let cancelled = false;
    setLocationPreviewLoading(true);
    (async () => {
      try {
        const res = await api.get<{ template_json: string }>(`/label-templates/${templateIdForPreview}`, {
          params: { tenant_id: TENANT_ID },
        });
        const templateObj = JSON.parse(res.data.template_json) as LabelTemplate;
        if (!cancelled) setLocationPreviewTemplate(templateObj);
      } catch {
        if (!cancelled) setLocationPreviewTemplate(null);
      } finally {
        if (!cancelled) setLocationPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [printMode, templateIdForPreview]);

  useEffect(() => {
    if (printMode !== "rack" || rackRecords.length === 0 || templateIdForPreview == null) {
      setRackPreviewTemplate(null);
      return;
    }
    let cancelled = false;
    setRackPreviewLoading(true);
    (async () => {
      try {
        const res = await api.get<{ template_json: string }>(`/label-templates/${templateIdForPreview}`, {
          params: { tenant_id: TENANT_ID },
        });
        const templateObj = JSON.parse(res.data.template_json) as LabelTemplate;
        if (!cancelled) setRackPreviewTemplate(templateObj);
      } catch {
        if (!cancelled) setRackPreviewTemplate(null);
      } finally {
        if (!cancelled) setRackPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [printMode, templateIdForPreview, rackRecords]);

  const handleGeneratePdf = useCallback(async () => {
    if (printMode === "location") {
      if (locationRecordsFiltered.length === 0) return;
    } else if (records.length === 0) {
      return;
    }
    setBackendPdfFallbackWarning(false);
    // Location labels: use filtered records only. Prefer backend POST /labels/render-pdf (no GET /warehouse/layout/labels/).
    if (printMode === "location" && selectedLocationTemplateId != null) {
      try {
        let templateForBackend: LabelTemplate | null = locationPreviewTemplate ?? template;
        if (!templateForBackend?.elements?.length) {
          const tRes = await api.get<{ template_json: string }>(
            `/label-templates/${selectedLocationTemplateId}`,
            { params: { tenant_id: TENANT_ID } }
          );
          templateForBackend = JSON.parse(tRes.data.template_json) as LabelTemplate;
        }
        const recordsToSend = buildRecordsForBackendRenderPdf(
          templateForBackend,
          locationRecordsFiltered,
          labelDatasetPrepare
        );
        const res = await api.post(
          "/labels/render-pdf",
          {
            template_id: selectedLocationTemplateId,
            records: recordsToSend,
            exclude_floors: excludeFloors,
            ...((() => { const p = printers.find(pr => pr.id === selectedPrinterId); return p?.profile_id != null ? { printer_profile_id: p.profile_id } : {}; })()),
          },
          { params: { tenant_id: TENANT_ID, print_mode: pdfPrintReady }, responseType: "blob" }
        );
        const url = URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement("a");
        a.href = url;
        a.download = `location-labels-${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      } catch (e) {
        console.error("Backend render-pdf failed, falling back to client PDF:", e);
        setBackendPdfFallbackWarning(true);
      }
    }
    // Client fallback: use the same template as preview (locationPreviewTemplate in location mode)
    const templateForPdf =
      printMode === "location" && locationPreviewTemplate != null
        ? locationPreviewTemplate
        : template;
    if (printMode === "location" && locationPreviewTemplate == null) {
      warn("Location preview template not loaded; PDF may use wrong template.");
    }
    const selectedPrinter = printers.find((p) => p.id === selectedPrinterId) ?? null;
    const blob = await generatePdfBlob(
      templateForPdf,
      printMode === "location" ? locationRecordsFiltered : records,
      thermalMode,
      selectedPrinter?.profile ?? null,
      labelDatasetPrepare
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etykiety-${templateForPdf.name.replace(/\s+/g, "-")}-${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [
    template,
    records,
    locationRecordsFiltered,
    excludeFloors,
    thermalMode,
    printMode,
    selectedLocationTemplateId,
    printers,
    selectedPrinterId,
    locationPreviewTemplate,
    labelDatasetPrepare,
    pdfPrintReady,
  ]);

  /** Returns the same PDF blob as Generate PDF (for direct print or fallback download). */
  const getLocationLabelPdfBlob = useCallback(async (): Promise<Blob> => {
    if (printMode === "location" && locationRecordsFiltered.length === 0) throw new Error("No records");
    if (printMode !== "location" && records.length === 0) throw new Error("No records");
    if (printMode === "location" && selectedLocationTemplateId != null) {
      try {
        let templateForBackend: LabelTemplate | null = locationPreviewTemplate ?? template;
        if (!templateForBackend?.elements?.length) {
          const tRes = await api.get<{ template_json: string }>(
            `/label-templates/${selectedLocationTemplateId}`,
            { params: { tenant_id: TENANT_ID } }
          );
          templateForBackend = JSON.parse(tRes.data.template_json) as LabelTemplate;
        }
        const recordsToSend = buildRecordsForBackendRenderPdf(
          templateForBackend,
          locationRecordsFiltered,
          labelDatasetPrepare
        );
        const res = await api.post<Blob>(
          "/labels/render-pdf",
          {
            template_id: selectedLocationTemplateId,
            records: recordsToSend,
            exclude_floors: excludeFloors,
            ...((() => { const p = printers.find(pr => pr.id === selectedPrinterId); return p?.profile_id != null ? { printer_profile_id: p.profile_id } : {}; })()),
          },
          { params: { tenant_id: TENANT_ID, print_mode: pdfPrintReady }, responseType: "blob" }
        );
        return res.data;
      } catch {
        // fallback to client PDF
      }
    }
    const templateForPdf =
      printMode === "location" && locationPreviewTemplate != null ? locationPreviewTemplate : template;
    const selectedPrinter = printers.find((p) => p.id === selectedPrinterId) ?? null;
    return await generatePdfBlob(
      templateForPdf,
      printMode === "location" ? locationRecordsFiltered : records,
      thermalMode,
      selectedPrinter?.profile ?? null,
      labelDatasetPrepare
    );
  }, [
    template,
    records,
    locationRecordsFiltered,
    excludeFloors,
    thermalMode,
    printMode,
    selectedLocationTemplateId,
    printers,
    selectedPrinterId,
    locationPreviewTemplate,
    labelDatasetPrepare,
    pdfPrintReady,
  ]);

  const handlePrint = useCallback(async () => {
    if (printMode === "location" && locationRecordsFiltered.length === 0) return;
    if (printMode !== "location" && records.length === 0) return;

    setPrinting(true);
    try {
      const templateId =
        selectedLocationTemplateId ??
        locationTemplates.find((t) => t.is_default)?.id ??
        locationTemplates[0]?.id;
      if (templateId == null) {
        throw new Error("Wybierz szablon etykiety.");
      }

      let templateForBackend: LabelTemplate | null = locationPreviewTemplate ?? template;
      if (!templateForBackend?.elements?.length) {
        const tRes = await api.get<{ template_json: string }>(`/label-templates/${templateId}`, {
          params: { tenant_id: TENANT_ID },
        });
        templateForBackend = JSON.parse(tRes.data.template_json) as LabelTemplate;
      }

      const sourceRecords = printMode === "location" ? locationRecordsFiltered : records;
      const recordsToSend = buildRecordsForBackendRenderPdf(
        templateForBackend,
        sourceRecords,
        labelDatasetPrepare,
      );
      const selectedPrinter = printers.find((p) => p.id === selectedPrinterId) ?? null;
      const printerSelection = resolveLabelQueuePrinterSelection(
        selectedPrinter,
        agentPrinters,
        profiles,
        legacyPrinters,
      );

      await queueLabelPrint(
        {
          template_id: templateId,
          records: recordsToSend,
          exclude_floors: excludeFloors,
          printer_profile_id: printerSelection.printer_profile_id,
          print_mode: pdfPrintReady,
          ...(printMode === "csv_import" ? labelRenderPdfCsvGroupBody(csvPdfRequestUsesGrouping) : {}),
        },
        selectedWarehouseId,
        printerSelection,
      );
    } catch (e) {
      console.error("Label queue print failed:", e);
    } finally {
      setPrinting(false);
    }
  }, [
    printMode,
    locationRecordsFiltered,
    records,
    selectedLocationTemplateId,
    locationTemplates,
    locationPreviewTemplate,
    template,
    labelDatasetPrepare,
    printers,
    selectedPrinterId,
    profiles,
    legacyPrinters,
    agentPrinters,
    excludeFloors,
    pdfPrintReady,
    csvPdfRequestUsesGrouping,
    queueLabelPrint,
    selectedWarehouseId,
  ]);

  const handleDetectSystemPrinters = useCallback(async () => {
    try {
      const qzList = qzReady ? await listSystemPrinters() : [];
      const agentNames = agentPrinters
        .filter((row) => row.is_active)
        .map((row) => row.system_name)
        .filter(Boolean);
      const merged = [...new Set([...systemPrinters, ...agentNames, ...qzList].map((s) => s.trim()).filter(Boolean))];
      merged.sort((a, b) => a.localeCompare(b, "pl"));
      setSystemPrinters(merged);
    } catch (e) {
      console.error("List system printers failed:", e);
      setSystemPrinters(
        agentPrinters.filter((row) => row.is_active).map((row) => row.system_name).filter(Boolean),
      );
    }
  }, [agentPrinters, qzReady, setSystemPrinters, systemPrinters]);

  const handleGenerateRackLabels = useCallback(async () => {
    setRackGenerating(true);
    try {
      const res = await api.post<{ records: LabelRecord[] }>("/labels/generate-rack", {
        rack: rackRack,
        levels: rackLevels,
        positions: rackPositions,
        ...(rackZone.trim() ? { zone: rackZone.trim() } : {}),
      });
      setRackRecords(Array.isArray(res.data?.records) ? res.data.records : []);
    } catch (e) {
      console.error("Generate rack labels failed:", e);
      setRackRecords([]);
    } finally {
      setRackGenerating(false);
    }
  }, [rackRack, rackLevels, rackPositions, rackZone]);

  const handleDownloadRackPdf = useCallback(async () => {
    if (rackRecords.length === 0) return;
    const templateId = selectedLocationTemplateId ?? locationTemplates.find((t) => t.is_default)?.id ?? locationTemplates[0]?.id;
    if (templateId == null) {
      return;
    }
    setRackPdfLoading(true);
    try {
      const tRes = await api.get<{ template_json: string }>(`/label-templates/${templateId}`, {
        params: { tenant_id: TENANT_ID },
      });
      const templateObj = JSON.parse(tRes.data.template_json) as LabelTemplate;
      const recordsToSend = buildRecordsLikeRackLabelModal(templateObj, rackRecords, labelDatasetPrepare);
      const res = await api.post(
        "/labels/render-pdf",
        {
          template_id: templateId,
          records: recordsToSend,
          ...((() => { const p = printers.find(pr => pr.id === selectedPrinterId); return p?.profile_id != null ? { printer_profile_id: p.profile_id } : {}; })()),
        },
        { params: { tenant_id: TENANT_ID, print_mode: pdfPrintReady }, responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `rack-labels-${rackRack}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Rack labels PDF failed:", e);
    } finally {
      setRackPdfLoading(false);
    }
  }, [
    rackRecords,
    selectedLocationTemplateId,
    locationTemplates,
    rackRack,
    printers,
    selectedPrinterId,
    labelDatasetPrepare,
    pdfPrintReady,
  ]);

  const handlePdfImportUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setPdfImportError("Please select a PDF file.");
      return;
    }
    setPdfImportError(null);
    setPdfImportLoading(true);
    setPdfImportBarcodes([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<{ barcodes: string[] }>("/labels/import-barcode-pdf", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const list = Array.isArray(res.data?.barcodes) ? res.data.barcodes : [];
      setPdfImportBarcodes(list);
      if (list.length === 0) setPdfImportError("No barcodes detected in this PDF.");
    } catch (err: unknown) {
      const res = err && typeof err === "object" && "response" in err ? (err as { response?: { data?: { detail?: string } } }).response : undefined;
      const detail = res?.data?.detail;
      setPdfImportError(detail ? String(detail) : "Import failed.");
      setPdfImportBarcodes([]);
    } finally {
      setPdfImportLoading(false);
    }
    e.target.value = "";
  }, []);

  const handlePdfImportGenerateLabels = useCallback(async () => {
    if (pdfImportBarcodes.length === 0) return;
    const templateId = selectedLocationTemplateId ?? locationTemplates.find((t) => t.is_default)?.id ?? locationTemplates[0]?.id;
    if (templateId == null) return;
    const recordsRaw: LabelRecord[] = pdfImportBarcodes.map((code) => ({
      loc_name: code,
      loc_barcode: code,
      location_name: code,
      barcode_data: code,
    }));
    const records = sanitizeRecordsForRenderPdf(recordsRaw as Record<string, unknown>[]);
    setPdfImportPdfLoading(true);
    try {
      const res = await api.post(
        "/labels/render-pdf",
        {
          template_id: templateId,
          records,
          ...((() => { const p = printers.find(pr => pr.id === selectedPrinterId); return p?.profile_id != null ? { printer_profile_id: p.profile_id } : {}; })()),
        },
        { params: { tenant_id: TENANT_ID, print_mode: pdfPrintReady }, responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `imported-barcodes-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF generation failed:", e);
      setPdfImportError("Failed to generate PDF.");
    } finally {
      setPdfImportPdfLoading(false);
    }
  }, [pdfImportBarcodes, selectedLocationTemplateId, locationTemplates, printers, selectedPrinterId, pdfPrintReady]);

  const handleCsvFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    const files = Array.from(list).filter((f) => f.name.toLowerCase().endsWith(".csv"));
    if (!files.length) {
      setCsvImportError("Wybierz co najmniej jeden plik CSV.");
      return;
    }
    setCsvImportError(null);
    setCsvMergeWarnings([]);
    setCsvImportLoading(true);
    try {
      const parsed: { filename: string; headers: string[]; rows: Record<string, string>[] }[] = [];
      for (const file of files) {
        const text = await file.text();
        const { headers, rows } = parseCsv(text);
        if (headers.length === 0) {
          setCsvImportError(`Plik „${file.name}” nie zawiera nagłówków.`);
          setCsvHeaders([]);
          setCsvRows([]);
          setCsvColumnToField({});
          setCsvPerFileStats([]);
          return;
        }
        parsed.push({ filename: file.name, headers, rows });
      }
      const { headers, rows, perFile, warnings } = mergeParsedCsvSources(parsed);
      setCsvPerFileStats(perFile);
      setCsvMergeWarnings(warnings);
      setCsvHeaders(headers);
      setCsvRows(rows);
      setCsvColumnToField(buildColumnMappingWithPersistence(headers));
      setCsvMappingModalOpen(true);
    } catch {
      setCsvImportError("Nie udało się odczytać pliku CSV.");
      setCsvHeaders([]);
      setCsvRows([]);
      setCsvColumnToField({});
      setCsvPerFileStats([]);
      setCsvMergeWarnings([]);
      setCsvMappingModalOpen(false);
    } finally {
      setCsvImportLoading(false);
    }
    e.target.value = "";
  }, []);

  const handleCsvGeneratePdf = useCallback(async () => {
    if (csvRows.length === 0 || selectedCsvTemplateId == null) return;
    const csvTplRow = allLabelTemplatesForCsv.find((t) => t.id === selectedCsvTemplateId);
    const templateJson = csvTplRow?.template_json?.trim();
    if (!templateJson) {
      setCsvImportError(
        "Template required for CSV labels: brak template_json dla wybranego szablonu — odśwież listę lub zapisz szablon w edytorze.",
      );
      return;
    }
    const CSV_ROW_LIMIT = 5000;
    if (csvRows.length > CSV_ROW_LIMIT) {
      setCsvImportError(`Maksymalnie ${CSV_ROW_LIMIT} wierszy po połączeniu plików — zmniejsz zestaw CSV.`);
      return;
    }
    const floorSetsPayload =
      csvPdfRequestUsesGrouping && csvFloorSetsNormalized.length > 0 ? csvFloorSetsNormalized : [];
    setCsvImportError(null);
    setCsvPdfLoading(true);
    try {
      let records = buildLabelRecordsFromCsvRows(csvRows, csvColumnToField);
      if (csvDedupeRackFloorRow) {
        records = dedupeLabelRecordsByRackFloorRow(records);
      }
      if (filterLabelRecordsByExcludeFloors(records, excludeFloors).length === 0) {
        setCsvImportError("Po wykluczeniu pięter nie zostało żadnego wiersza. Odznacz piętra lub zmień CSV.");
        return;
      }
      records = sanitizeRecordsForRenderPdf(records);
      for (const record of records) {
        console.log("CLEAN RECORD", record);
      }
      if (import.meta.env.DEV) {
        const sample = records[0];
        const keys = sample && typeof sample === "object" ? Object.keys(sample as object) : [];
        console.info("[csv labels] render-pdf records count", records.length);
        console.info("[csv labels] first record keys (no `{binding}` keys)", keys);
        console.info("[csv labels] first record", sample);
      }
      const { templateJson: templateJsonForPdf, warnings: dimWarnings } =
        sanitizeTemplateJsonDimensionsForCsvExport(templateJson);
      for (const w of dimWarnings) {
        if (import.meta.env.DEV) console.warn("[csv labels]", w);
      }
      const res = await api.post(
        "/labels/render-pdf",
        {
          template_id: selectedCsvTemplateId,
          template_json: templateJsonForPdf,
          records,
          exclude_floors: excludeFloors,
          ...(csvPdfRequestUsesGrouping ? labelRenderPdfCsvGroupBody(csvGroupByRack) : {}),
          ...(csvPdfRequestUsesGrouping && floorSetsPayload.length > 0 ? { floor_sets: floorSetsPayload } : {}),
          ...((() => {
            const p = printers.find((pr) => pr.id === selectedPrinterId);
            return p?.profile_id != null ? { printer_profile_id: p.profile_id } : {};
          })()),
        },
        { params: { tenant_id: TENANT_ID, print_mode: pdfPrintReady }, responseType: "blob" },
      );
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `csv-labels-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error("CSV labels PDF failed:", err);
      let msg = "Generowanie PDF nie powiodło się.";
      const resp =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { status?: number; data?: unknown } }).response
          : undefined;
      if (resp?.status === 400 && resp.data instanceof Blob) {
        try {
          const text = await resp.data.text();
          try {
            const j = JSON.parse(text) as { detail?: unknown };
            if (typeof j.detail === "string") msg = j.detail;
          } catch {
            if (text.trim()) msg = text.trim();
          }
        } catch {
          /* keep default */
        }
      }
      setCsvImportError(msg);
    } finally {
      setCsvPdfLoading(false);
    }
  }, [
    csvRows,
    csvColumnToField,
    csvDedupeRackFloorRow,
    selectedCsvTemplateId,
    allLabelTemplatesForCsv,
    printers,
    selectedPrinterId,
    excludeFloors,
    pdfPrintReady,
    csvPdfRequestUsesGrouping,
    csvGroupByRack,
    csvFloorSetsNormalized,
  ]);

  const handleGenerateRackStrip = useCallback(async () => {
    setStripGenerating(true);
    try {
      const res = await api.post<{ records: LabelRecord[] }>("/labels/generate-rack-strip", {
        rack: stripRack,
        level: stripLevel,
        start: stripStart,
        end: stripEnd,
      });
      setStripRecords(Array.isArray(res.data?.records) ? res.data.records : []);
    } catch (e) {
      console.error("Generate rack strip failed:", e);
      setStripRecords([]);
    } finally {
      setStripGenerating(false);
    }
  }, [stripRack, stripLevel, stripStart, stripEnd]);

  const handleDownloadRackStripPdf = useCallback(async () => {
    if (stripRecords.length === 0) return;
    const templateId = selectedLocationTemplateId ?? locationTemplates.find((t) => t.is_default)?.id ?? locationTemplates[0]?.id;
    if (templateId == null) return;
    setStripPdfLoading(true);
    try {
      const stripRecord = { locations: stripRecords };
      const stripRecordsToSend = sanitizeRecordsForRenderPdf([stripRecord as Record<string, unknown>]);
      const res = await api.post(
        "/labels/render-pdf",
        {
          template_id: templateId,
          records: stripRecordsToSend,
          ...((() => { const p = printers.find(pr => pr.id === selectedPrinterId); return p?.profile_id != null ? { printer_profile_id: p.profile_id } : {}; })()),
        },
        { params: { tenant_id: TENANT_ID, print_mode: pdfPrintReady }, responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `rack-strip-${stripRack}-${stripLevel}-${stripStart}-${stripEnd}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Rack strip PDF failed:", e);
    } finally {
      setStripPdfLoading(false);
    }
  }, [stripRecords, stripRack, stripLevel, stripStart, stripEnd, selectedLocationTemplateId, locationTemplates, printers, selectedPrinterId, pdfPrintReady]);

  const handleGenerateBasketLabelsForCart = useCallback(async () => {
    if (selectedCartId == null) return;
    setGeneratingBasketLabels(true);
    try {
      const res = await api.get<{ id: number; name: string; barcode?: string; baskets?: Array<{ id: number; name: string | null; row: number; column: number; barcode?: string }> }>(`/carts/${selectedCartId}/`);
      const cart = res.data;
      const cartBarcode = cart.barcode ?? `CART-${cart.id}`;
      const baskets = cart.baskets ?? [];
      const records: LabelRecord[] = baskets.map((b, idx) => {
        const code = b.name && String(b.name).trim() ? b.name : `S-${b.row}-${b.column}`;
        const barcode = b.barcode ?? `${cartBarcode}-B${String(idx + 1).padStart(2, "0")}`;
        return {
          basket_id: String(b.id),
          basket_code: code,
          basket_barcode: barcode,
          basket_level: String(b.row + 1),
          basket_position: String(b.column + 1),
          cart_id: String(cart.id),
          barcode_data: barcode,
          "{basket_id}": String(b.id),
          "{basket_code}": code,
          "{basket_barcode}": barcode,
          "{basket_level}": String(b.row + 1),
          "{basket_position}": String(b.column + 1),
          "{cart_id}": String(cart.id),
        };
      });
      if (records.length === 0) return;
      const selectedPrinter = printers.find((p) => p.id === selectedPrinterId) ?? null;
      const blob = await generatePdfBlob(
        template,
        records,
        thermalMode,
        selectedPrinter?.profile ?? null,
        undefined
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `basket-labels-cart-${selectedCartId}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Generate basket labels failed:", e);
    } finally {
      setGeneratingBasketLabels(false);
    }
  }, [template, selectedCartId, thermalMode, printers, selectedPrinterId]);

  const rackOptions = layout?.racks?.map((r, i) => {
    const aisle = (r.aisle_letter ?? "A").toString().trim().toUpperCase().slice(0, 1);
    const idx = Number(r.rack_index ?? i + 1);
    const id = `${aisle}${idx}`;
    return { id, label: `Regał ${id}` };
  }) ?? [];

  const summaryTemplateName = useMemo(() => {
    if (printMode === "csv_import") {
      return allLabelTemplatesForCsv.find((t) => t.id === selectedCsvTemplateId)?.name?.trim() || "—";
    }
    const pick =
      locationTemplates.find((t) => t.id === selectedLocationTemplateId) ??
      locationTemplates.find((t) => t.is_default) ??
      locationTemplates[0];
    return pick?.name?.trim() || "—";
  }, [
    printMode,
    allLabelTemplatesForCsv,
    selectedCsvTemplateId,
    locationTemplates,
    selectedLocationTemplateId,
  ]);

  const summaryDimsTemplate = useMemo(() => {
    if (printMode === "csv_import" && csvTemplateParsed) return csvTemplateParsed;
    if (printMode === "location" && locationPreviewTemplate) return locationPreviewTemplate;
    if (printMode === "rack" && rackPreviewTemplate) return rackPreviewTemplate;
    return template;
  }, [printMode, csvTemplateParsed, locationPreviewTemplate, rackPreviewTemplate, template]);

  const summaryPrinterLabel = useMemo(() => {
    const printer = printers.find((row) => row.id === selectedPrinterId);
    return formatProfileSummaryLabel(printer, legacyPrinters);
  }, [printers, legacyPrinters, selectedPrinterId]);

  const labelsToPrintCount =
    printMode === "location" ? locationPageRecords.length
    : printMode === "rack" ? rackPageRecords.length
    : printMode === "rack_strip" ? stripRecords.length
    : printMode === "pdf_import" ? pdfImportBarcodes.length
    : printMode === "csv_import" ? csvRecordsFiltered.length
    : null;

  const csvWizardStep: PrintQueueWizardStepId = useMemo(() => {
    if (!selectedCsvTemplateId) return 1;
    if (csvHeaders.length === 0) return 2;
    if (csvRecordsFiltered.length === 0) return 3;
    return 4;
  }, [selectedCsvTemplateId, csvHeaders.length, csvRecordsFiltered.length]);

  const csvMappingSummary = useMemo(() => {
    if (csvHeaders.length === 0) return { kind: "na" as const };
    const used = resolveTemplateUsedVariables({
      template: csvTemplateParsed,
      apiAvailableVariables:
        selectedCsvTemplateRow?.available_variables ?? selectedCsvTemplateRow?.variables ?? null,
      bindingKeys: csvTemplateBindingInfo.keys,
    });
    if (used.length === 0) return { kind: "ok" as const };
    const covered = mappedTargetFields(csvColumnToField);
    const missing = used
      .filter((f) => !covered.has(f))
      .map((f) => polishLabelCsvFieldForUi(f));
    return missing.length === 0
      ? { kind: "ok" as const }
      : { kind: "missing" as const, fields: missing };
  }, [
    csvHeaders.length,
    csvTemplateParsed,
    selectedCsvTemplateRow,
    csvTemplateBindingInfo.keys,
    csvColumnToField,
  ]);


  const labelW = Math.round(Number(summaryDimsTemplate?.widthMm) || 0);
  const labelH = Math.round(Number(summaryDimsTemplate?.heightMm) || 0);
  const dpi = summaryDimsTemplate?.dpi ?? 300;

  const workspaceWizardStep: PrintQueueWizardStepId =
    printMode === "csv_import" ? csvWizardStep : labelsToPrintCount && labelsToPrintCount > 0 ? 4 : 2;

  const previewBundle = useMemo(() => {
    if (printMode === "csv_import") {
      return {
        template: csvTemplateParsed,
        records: csvRecordsFiltered as Array<Record<string, unknown>>,
        loading: false,
        empty: "Wgraj CSV i zmapuj kolumny, aby zobaczyć podgląd.",
      };
    }
    if (printMode === "location") {
      return {
        template: locationPreviewTemplate,
        records: locationPageRecords as Array<Record<string, unknown>>,
        loading: locationPreviewLoading,
        empty: "Wybierz lokalizacje i szablon, aby zobaczyć podgląd.",
      };
    }
    if (printMode === "rack") {
      return {
        template: rackPreviewTemplate,
        records: rackPageRecords as Array<Record<string, unknown>>,
        loading: rackPreviewLoading,
        empty: "Wygeneruj siatkę regału, aby zobaczyć podgląd.",
      };
    }
    if (printMode === "rack_strip") {
      return {
        template: locationPreviewTemplate ?? rackPreviewTemplate,
        records: stripRecords as Array<Record<string, unknown>>,
        loading: false,
        empty: "Utwórz segmenty listwy, aby zobaczyć podgląd.",
      };
    }
    if (printMode === "pdf_import") {
      return {
        template: locationPreviewTemplate,
        records: pdfImportBarcodes.map((code) => ({
          barcode_data: code,
          loc_name: code,
          loc_barcode: code,
        })),
        loading: pdfImportLoading || locationPreviewLoading,
        empty: "Wgraj PDF z kodami, aby zobaczyć podgląd.",
      };
    }
    return {
      template: template as typeof locationPreviewTemplate,
      records: [] as Array<Record<string, unknown>>,
      loading: false,
      empty: "Wybierz wózek i wygeneruj etykiety koszyków.",
    };
  }, [
    printMode,
    csvTemplateParsed,
    csvRecordsFiltered,
    locationPreviewTemplate,
    locationPageRecords,
    locationPreviewLoading,
    rackPreviewTemplate,
    rackPageRecords,
    rackPreviewLoading,
    stripRecords,
    pdfImportBarcodes,
    pdfImportLoading,
    template,
  ]);

  const configSection = (
    <div className="space-y-3">
      {printMode === "csv_import" ? (
        <>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Typ wydruku (CSV)</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Typ wydruku dla importu CSV">
              {CSV_IMPORT_PRINT_KINDS.map((kind) => {
                const active = csvImportPrintKind === kind.id;
                return (
                  <button
                    key={kind.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCsvImportPrintKind(kind.id)}
                    className={[
                      "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition",
                      active
                        ? "border-orange-400 bg-orange-50 text-orange-900 ring-1 ring-orange-400"
                        : "border-gray-200 bg-white text-slate-700 hover:border-orange-300",
                    ].join(" ")}
                  >
                    <span aria-hidden>{kind.emoji}</span>
                    {kind.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Szablon etykiety</p>
            <CsvTemplatePicker
              templates={csvTemplatesForPrintKind}
              selectedId={selectedCsvTemplateId}
              onSelect={setSelectedCsvTemplateId}
            />
          </div>
          {csvTemplateDimensionHints.warnings.length > 0 ? (
            <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-950">
              {csvTemplateDimensionHints.warnings.map((w, i) => (
                <p key={i}>{humanizeCsvSanitizeWarning(w)}</p>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Szablon etykiety
          </label>
          <select
            value={selectedLocationTemplateId ?? ""}
            onChange={(e) => setSelectedLocationTemplateId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300/40"
          >
            <option value="">
              {printMode === "location" ? "— Domyślny z listy —" : "— Wybierz szablon —"}
            </option>
            {locationTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.is_default ? " (domyślny)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      <LabelPrintingProfileField
        tenantId={TENANT_ID}
        warehouseId={selectedWarehouseId}
        profiles={profiles}
        printers={printers}
        legacyPrinters={legacyPrinters}
        agentPrinters={agentPrinters}
        systemPrinters={systemPrinters}
        selectedPrinterId={selectedPrinterId}
        onSelectPrinterId={setSelectedPrinterId}
        onProfilesChanged={reloadPrinters}
      />
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm">
          <dt className="font-semibold uppercase tracking-wide text-slate-500">DPI</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-900">{dpi}</dd>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm">
          <dt className="font-semibold uppercase tracking-wide text-slate-500">Rozmiar</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
            {labelW} × {labelH} mm
          </dd>
        </div>
      </dl>
    </div>
  );

  const dataSection = (
    <div className="space-y-3">
      {printMode === "csv_import" ? (
        <>
          <p className="text-xs leading-relaxed text-slate-600">
            Jedna linia CSV = jedna etykieta. Mapowanie otwiera się w pełnym oknie po wczytaniu pliku.
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Źródło danych
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={handleCsvFileChange}
              disabled={csvImportLoading}
              className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm file:mr-2 file:rounded file:border-0 file:bg-orange-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-orange-800"
            />
          </div>
          {csvImportLoading ? <p className="text-sm text-slate-500">Wczytywanie…</p> : null}
          {csvImportError ? <p className="text-sm text-red-600">{csvImportError}</p> : null}
          {csvHeaders.length > 0 ? (
            <>
              <p className="text-sm text-slate-700">
                Rekordów: <strong>{csvRows.length}</strong>
                {csvPerFileStats.length > 1 ? (
                  <span className="text-slate-500"> ({csvPerFileStats.length} plików)</span>
                ) : null}{" "}
                · etykiet po filtrach: <strong>{csvRecordsFiltered.length}</strong>
              </p>
              <button
                type="button"
                onClick={() => setCsvMappingModalOpen(true)}
                className="w-full rounded-xl border border-orange-300 bg-orange-50 px-3 py-2.5 text-sm font-semibold text-orange-900 shadow-sm hover:bg-orange-100"
              >
                Otwórz mapowanie kolumn
              </button>
              {csvPerFileStats.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                  {csvPerFileStats.map((s) => (
                    <li key={s.filename}>
                      <span className="font-mono text-slate-800">{s.filename}</span> — {s.rowCount}{" "}
                      wierszy
                    </li>
                  ))}
                </ul>
              ) : null}
              {csvMergeWarnings.length > 0 ? (
                <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  <p className="font-semibold">Scalanie plików</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {csvMergeWarnings.map((w, i) => (
                      <li key={`${i}-${w.slice(0, 40)}`}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={csvDedupeRackFloorRow}
                  onChange={(e) => setCsvDedupeRackFloorRow(e.target.checked)}
                  className="mt-1 rounded border-gray-200"
                />
                <span>
                  Usuń duplikaty po <strong>Regał</strong> + <strong>Piętro</strong> + <strong>Rząd</strong>
                </span>
              </label>
            </>
          ) : null}
        </>
      ) : null}

      {printMode === "location" && layout ? (
        <>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Zakres lokalizacji
            </label>
            <select
              value={selectionMode}
              onChange={(e) => setSelectionMode(e.target.value as SelectionMode)}
              className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm"
            >
              <option value="all">Wszystkie lokalizacje</option>
              <option value="by_rack">Wybrane regały</option>
              <option value="reserve_only">Tylko rezerwa</option>
              <option value="manual">Ręczny wybór</option>
            </select>
          </div>
          {selectionMode === "by_rack" ? (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 text-sm">
              {rackOptions.map((r) => (
                <label key={r.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedRackIds.includes(r.id)}
                    onChange={(e) => {
                      setSelectedRackIds((prev) =>
                        e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id),
                      );
                    }}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          ) : null}
          {selectionMode === "manual" ? (
            <div className="space-y-2">
              <input
                type="search"
                value={manualLocationSearch}
                onChange={(e) => setManualLocationSearch(e.target.value)}
                placeholder="Szukaj lokalizacji…"
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
              />
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 text-sm">
                {(layout?.racks ?? [])
                  .flatMap((rack, ri) =>
                    (rack.bins ?? []).map((bin, bi) => {
                      const id =
                        bin.location_id ||
                        bin.barcode_data ||
                        bin.label ||
                        `${rack.aisle_letter ?? "R"}${ri}-${bi}`;
                      const label = bin.label || bin.barcode_data || id;
                      return { id: String(id), label: String(label) };
                    }),
                  )
                  .filter((loc) => {
                    const q = manualLocationSearch.trim().toLowerCase();
                    if (!q) return true;
                    return loc.label.toLowerCase().includes(q) || loc.id.toLowerCase().includes(q);
                  })
                  .slice(0, 200)
                  .map((loc) => (
                    <label key={loc.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={manualLocationIds.includes(loc.id)}
                        onChange={(e) => {
                          setManualLocationIds((prev) =>
                            e.target.checked ? [...prev, loc.id] : prev.filter((x) => x !== loc.id),
                          );
                        }}
                      />
                      <span className="truncate">{loc.label}</span>
                    </label>
                  ))}
              </div>
              <p className="text-xs text-slate-500">Wybrano: {manualLocationIds.length}</p>
            </div>
          ) : null}
        </>
      ) : null}

      {printMode === "rack" ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">Regał</label>
            <input
              type="text"
              value={rackRack}
              onChange={(e) => setRackRack(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Poziomy</label>
            <input
              type="number"
              min={1}
              value={rackLevels}
              onChange={(e) => setRackLevels(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Pozycje</label>
            <input
              type="number"
              min={1}
              value={rackPositions}
              onChange={(e) => setRackPositions(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">Strefa (opcjonalnie)</label>
            <input
              type="text"
              value={rackZone}
              onChange={(e) => setRackZone(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <PrintQueueSecondaryButton onClick={handleGenerateRackLabels} disabled={rackGenerating}>
              {rackGenerating ? "Generowanie…" : "Utwórz siatkę regału"}
            </PrintQueueSecondaryButton>
          </div>
        </div>
      ) : null}

      {printMode === "rack_strip" ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Regał</label>
            <input
              type="text"
              value={stripRack}
              onChange={(e) => setStripRack(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Poziom</label>
            <input
              type="number"
              min={1}
              value={stripLevel}
              onChange={(e) => setStripLevel(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Start</label>
            <input
              type="number"
              min={1}
              value={stripStart}
              onChange={(e) => setStripStart(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Koniec</label>
            <input
              type="number"
              min={1}
              value={stripEnd}
              onChange={(e) => setStripEnd(Math.max(stripStart, Number(e.target.value) || 1))}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <PrintQueueSecondaryButton
              onClick={handleGenerateRackStrip}
              disabled={stripGenerating || stripEnd < stripStart}
            >
              {stripGenerating ? "Tworzenie listwy…" : "Utwórz segmenty listwy"}
            </PrintQueueSecondaryButton>
          </div>
        </div>
      ) : null}

      {printMode === "pdf_import" ? (
        <>
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={handlePdfImportUpload}
            disabled={pdfImportLoading}
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm file:mr-2 file:rounded file:border-0 file:bg-orange-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-orange-800"
          />
          {pdfImportError ? <p className="text-sm text-red-600">{pdfImportError}</p> : null}
          {pdfImportLoading ? <p className="text-sm text-slate-500">Odczytywanie kodów…</p> : null}
          {pdfImportBarcodes.length > 0 ? (
            <p className="text-sm text-slate-700">
              Wykryto kodów: <strong>{pdfImportBarcodes.length}</strong>
            </p>
          ) : null}
        </>
      ) : null}

      {printMode === "cart_basket" ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Wózek</label>
          <select
            value={selectedCartId ?? ""}
            onChange={(e) => setSelectedCartId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm"
          >
            <option value="">— Wybierz wózek —</option>
            {cartList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!layout && printMode === "location" ? (
        <p className="text-sm text-slate-500">{loading ? "Ładowanie układu…" : "Brak układu magazynu."}</p>
      ) : null}
    </div>
  );

  const filtersSection = (
    <div className="space-y-3">
      {printMode === "csv_import" || printMode === "location" ? (
        <FloorExclusionPanel
          value={floorFilterUi}
          onChange={setFloorFilterUi}
          summaryFooter={printMode === "csv_import" ? csvFloorSummaryFooter : locationFloorSummaryFooter}
        />
      ) : (
        <p className="text-xs text-slate-500">Brak dodatkowych filtrów dla tego typu wydruku.</p>
      )}
    </div>
  );

  const optionsSection = (
    <div className="space-y-3.5">
      <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
        <input
          type="checkbox"
          className="mt-1 rounded border-gray-300"
          checked={pdfPrintReady}
          onChange={(e) => setPdfPrintReady(e.target.checked)}
        />
        <span>
          <span className="font-medium">PDF pod druk profesjonalny</span>
          <span className="mt-0.5 block text-xs font-normal text-slate-600">
            Spady i znaczniki cięcia dla drukarni zewnętrznej.
          </span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
        <input
          type="checkbox"
          className="mt-1 rounded border-gray-300"
          checked={thermalMode}
          onChange={(e) => {
            const checked = e.target.checked;
            setThermalMode(checked);
            try {
              localStorage.setItem("label_print_thermal_mode", String(checked));
            } catch {
              /* ignore */
            }
          }}
        />
        <span>
          <span className="font-medium">Tryb drukarki termicznej</span>
          <span className="mt-0.5 block text-xs font-normal text-slate-600">
            Monochrom i wyższy kontrast (Zebra i podobne).
          </span>
        </span>
      </label>
      {(printMode === "location" || printMode === "rack") && (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-800">Powtarzacz — lokacji na etykietę</p>
          <select
            value={labelDatasetItemsPerLabel}
            onChange={(e) => {
              const v = e.target.value;
              setLabelDatasetItemsPerLabel(v === "auto" ? "auto" : (Number(v) as 3 | 5 | 10));
            }}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="auto">Automatycznie</option>
            <option value="3">3</option>
            <option value="5">5</option>
            <option value="10">10</option>
          </select>
          <select
            value={labelDatasetTransformMode}
            onChange={(e) => setLabelDatasetTransformMode(e.target.value as RackDatasetTransformMode)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="sequential">Jak na liście</option>
            <option value="row">Wierszami</option>
            <option value="column">Kolumnami</option>
          </select>
        </div>
      )}
      {printMode === "csv_import" ? (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-800">Grupowanie wierszy CSV w PDF</p>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800 select-none">
            <input
              type="checkbox"
              checked={csvGroupMode}
              onChange={(e) => {
                const on = e.target.checked;
                setCsvGroupMode(on);
                if (!on) {
                  setCsvGroupByRack(false);
                  setCsvFloorSets([]);
                  setCsvFloorDraftInput("");
                  setCsvFloorDraftTokens([]);
                }
              }}
              className="mt-1 rounded border-gray-300"
            />
            <span>Włącz grupowanie wielu wierszy w jedną etykietę</span>
          </label>
          <label
            className={`flex items-start gap-2 text-sm text-slate-800 select-none ${
              csvGroupMode ? "cursor-pointer" : "cursor-not-allowed opacity-50"
            }`}
          >
            <input
              type="checkbox"
              checked={csvGroupByRack}
              disabled={!csvGroupMode}
              onChange={(e) => setCsvGroupByRack(e.target.checked)}
              className="mt-1 rounded border-gray-300"
            />
            <span>Uwzględnij regał przy grupowaniu (regał + rząd)</span>
          </label>
          {csvGroupMode && csvGroupingPdfBlocked ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <span>Szablon nie obsługuje grupowania — etykiety zostaną wygenerowane pojedynczo</span>
              {selectedCsvTemplateId != null ? (
                <button
                  type="button"
                  onClick={() => navigate(`${labelBase}/${selectedCsvTemplateId}/edit`)}
                  className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                >
                  Dostosuj szablon
                </button>
              ) : null}
            </div>
          ) : null}
          {csvGroupingPreviewState != null ? (
            <div className="rounded border border-gray-200 bg-white px-2.5 py-2">
              <p className="mb-1 text-[10px] font-semibold text-slate-600">Podgląd grupowania</p>
              {csvGroupingPreviewState.kind === "ready" &&
              csvGroupingPreviewState.preview.kind === "ok" ? (
                <ul className="list-none space-y-0.5 font-mono text-[10px] leading-snug text-slate-800">
                  {csvGroupingPreviewState.preview.lines.map((line, idx) => (
                    <li key={`${idx}-${line}`}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[10px] text-slate-500">Podgląd grupowania niedostępny / pusty.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const generateDisabled =
    printMode === "csv_import"
      ? csvPdfLoading ||
        csvRows.length === 0 ||
        csvRecordsFiltered.length === 0 ||
        selectedCsvTemplateId == null ||
        csvTemplatesForPrintKind.length === 0 ||
        csvTemplateParsed == null
      : printMode === "location"
        ? locationRecordsFiltered.length === 0
        : printMode === "rack"
          ? rackRecords.length === 0 || rackPdfLoading || locationTemplates.length === 0
          : printMode === "rack_strip"
            ? stripRecords.length === 0 || stripPdfLoading || locationTemplates.length === 0
            : printMode === "pdf_import"
              ? pdfImportBarcodes.length === 0 || pdfImportPdfLoading || locationTemplates.length === 0
              : selectedCartId == null || generatingBasketLabels;

  const onGenerate = () => {
    if (printMode === "csv_import") void handleCsvGeneratePdf();
    else if (printMode === "location") void handleGeneratePdf();
    else if (printMode === "rack") void handleDownloadRackPdf();
    else if (printMode === "rack_strip") void handleDownloadRackStripPdf();
    else if (printMode === "pdf_import") void handlePdfImportGenerateLabels();
    else void handleGenerateBasketLabelsForCart();
  };

  const generateLabel =
    printMode === "csv_import"
      ? csvPdfLoading
        ? "Generowanie PDF…"
        : "Generuj PDF"
      : printMode === "location"
        ? "Generuj PDF"
        : printMode === "rack"
          ? rackPdfLoading
            ? "Tworzenie pliku PDF…"
            : "Pobierz PDF regału"
          : printMode === "rack_strip"
            ? stripPdfLoading
              ? "Tworzenie pliku PDF…"
              : "Pobierz PDF listwy"
            : printMode === "pdf_import"
              ? pdfImportPdfLoading
                ? "Tworzenie pliku PDF…"
                : "Generuj PDF z kodów"
              : generatingBasketLabels
                ? "Tworzenie pliku PDF…"
                : "Generuj PDF etykiet koszyków";

  return (
    <>
      <PrintQueueWorkspaceShell
        printMode={printMode}
        onPrintModeChange={setPrintMode}
        currentStep={workspaceWizardStep}
        dataSummary={
          printMode === "csv_import"
            ? csvHeaders.length > 0
              ? `${csvRows.length} wierszy`
              : "Brak CSV"
            : labelsToPrintCount != null
              ? `${labelsToPrintCount} etykiet`
              : undefined
        }
        configSummary={summaryTemplateName}
        filtersSummary={
          printMode === "csv_import" || printMode === "location"
            ? excludeFloors.length > 0
              ? `Wykluczone piętra: ${excludeFloors.length}`
              : "Bez filtra pięter"
            : "—"
        }
        dataSection={dataSection}
        configSection={configSection}
        filtersSection={filtersSection}
        optionsSection={optionsSection}
        previewTemplate={previewBundle.template}
        previewRecords={previewBundle.records}
        previewLoading={previewBundle.loading}
        previewEmptyMessage={previewBundle.empty}
        summaryTiles={[
          { label: "Liczba etykiet", value: labelsToPrintCount != null ? labelsToPrintCount : "—" },
          { label: "Rozmiar etykiety", value: `${labelW} × ${labelH} mm` },
          { label: "Profil / drukarka", value: summaryPrinterLabel },
          { label: "Szablon", value: summaryTemplateName },
          {
            label: "Źródło danych",
            value:
              printMode === "csv_import"
                ? csvHeaders.length > 0
                  ? `CSV · ${csvRows.length} wierszy`
                  : "Brak CSV"
                : printMode,
          },
        ]}
        mapping={printMode === "csv_import" ? csvMappingSummary : { kind: "na" }}
        warnings={
          <>
            {backendPdfFallbackWarning && printMode === "location" ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Nie udało się przygotować PDF na serwerze — używamy silnika w przeglądarce.
              </p>
            ) : null}
            {printMode === "csv_import" && csvValidationWarnings.length > 0 ? (
              <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <p className="font-semibold">Uwagi mapowania:</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {csvValidationWarnings.slice(0, 5).map((w, i) => (
                    <li key={`${i}-${w.slice(0, 40)}`}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {printMode === "location" && !qzChecking && !qzReady ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Zainstaluj i uruchom QZ Tray, aby drukować bezpośrednio.
              </p>
            ) : null}
          </>
        }
        generateLabel={generateLabel}
        generateDisabled={generateDisabled}
        onGenerate={onGenerate}
        printLabel={printMode === "location" ? (printing ? "Wysyłanie…" : "Drukuj etykiety") : undefined}
        printDisabled={printMode === "location" ? locationRecordsFiltered.length === 0 || printing : undefined}
        onPrint={printMode === "location" ? handlePrint : undefined}
        printersSlot={
          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-2">
                Lista drukarek systemowych
                <span className="text-slate-400 group-open:rotate-180">▼</span>
              </span>
            </summary>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={handleDetectSystemPrinters}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:shadow-md"
              >
                Odśwież listę drukarek
              </button>
              <ul className="max-h-32 list-inside list-disc overflow-y-auto text-xs text-slate-600">
                {systemPrinters.length === 0 ? (
                  <li>Nie wykryto drukarek — sprawdź agenta Sasist Printer lub QZ Tray.</li>
                ) : (
                  systemPrinters.map((name, i) => <li key={i}>{name}</li>)
                )}
              </ul>
            </div>
          </details>
        }
        footerNote={<>DPI w profilu: {dpi}.</>}
      />
      {printMode === "csv_import" ? (
        <CsvMappingModal
          open={csvMappingModalOpen}
          onClose={() => setCsvMappingModalOpen(false)}
          onSave={(mapping) => {
            const next = filterDerivedGroupSlotsFromCsvMapping(mapping);
            setCsvColumnToField(next);
            saveCsvLabelMapping(csvHeaders, next);
            setCsvMappingModalOpen(false);
          }}
          csvHeaders={csvHeaders}
          initialMapping={csvColumnToField}
          csvRowCount={csvRows.length}
          labelCount={csvRecordsFiltered.length}
          perFileStats={csvPerFileStats}
          template={csvTemplateParsed}
          templateType={csvSelectedTemplateType}
          apiAvailableVariables={
            selectedCsvTemplateRow?.available_variables ?? selectedCsvTemplateRow?.variables ?? null
          }
          bindingKeys={csvTemplateBindingInfo.keys}
        />
      ) : null}
    </>
  );
}

/** Convert SVG string to PNG data URL at given mm size (for PDF). Uses same render as editor. */
const PDF_PX_PER_MM = 6;

function svgToPngDataUrl(svgString: string, widthMm: number, heightMm: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
    img.onload = () => {
      const cw = Math.max(1, Math.round(widthMm * PDF_PX_PER_MM));
      const ch = Math.max(1, Math.round(heightMm * PDF_PX_PER_MM));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2d unavailable"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("SVG image load failed"));
    img.src = dataUrl;
  });
}

/** When true, use vector SVG→PDF; when false, use raster (SVG→PNG→PDF). */
const VECTOR_PDF_ENABLED = true;

/** Find first repeater in template tree (top-level or inside groups). */
function findRepeater(elements: TemplateElement[]): RepeaterElement | null {
  for (const el of elements) {
    if (el.type === "repeater") return el as RepeaterElement;
    if (el.type === "group" && "elements" in el && Array.isArray(el.elements)) {
      const found = findRepeater(el.elements as TemplateElement[]);
      if (found) return found;
    }
  }
  return null;
}

/**
 * How many repeater items fit on one physical label (record generation only).
 * Grid: columns × floor(available height / itemHeight).
 * Vertical: floor(available height / itemHeight).
 * Horizontal: floor(available width / itemWidth).
 */
function getSlotsPerLabelLikeRack(rep: RepeaterElement, template: LabelTemplate): number {
  const itemW =
    Number(rep.itemWidth) || Number((rep as { item_width?: number }).item_width) || 0;
  const itemH = Number(rep.itemHeight ?? rep.itemWidth) || 0;
  const repY = Number(rep.y ?? 0);
  const repX = Number(rep.x ?? 0);

  if (rep.layout === "grid" && rep.columns != null && rep.columns > 0) {
    const cols = Math.max(1, rep.columns);
    const cellH = itemH > 0 ? itemH : itemW > 0 ? itemW : 20;
    const availH = Math.max(cellH, template.heightMm - repY);
    const rows = Math.max(1, Math.floor(availH / cellH));
    return Math.max(1, cols * rows);
  }

  if (rep.direction === "vertical" && itemH > 0) {
    const availH = Math.max(itemH, template.heightMm - repY);
    return Math.max(1, Math.floor(availH / itemH));
  }

  if (itemW > 0) {
    const availW = Math.max(itemW, template.widthMm - repX);
    return Math.max(1, Math.floor(availW / itemW));
  }
  return 1;
}

/** Normalize a record so template variables (loc_name, loc_barcode, etc.) resolve. */
function normalizeRepeaterItem(r: LabelRecord): Record<string, unknown> {
  const rec = r as Record<string, unknown>;
  const locName = rec.location_name ?? rec.location_code ?? rec.loc_name ?? "";
  const barcode = rec.location_barcode ?? rec.barcode_data ?? rec.loc_barcode ?? rec.location_code ?? locName;
  return {
    ...rec,
    loc_name: locName,
    loc_barcode: barcode,
    barcode_data: barcode,
    location_name: rec.location_name ?? locName,
    location_code: rec.location_code ?? locName,
    location_barcode: rec.location_barcode ?? barcode,
  };
}

/**
 * Build repeater dataset from the same location records used by preview (getRecordsFromLayout).
 * No synthetic data: dataset items use actual record fields only. Dataset key from repeater.dataset
 * (e.g. levels, locations, bins). Ensures PDF repeater matches preview and warehouse layout.
 */
function buildRecordsLikeRackLabelModal(
  template: LabelTemplate,
  records: LabelRecord[],
  prepare?: LabelDatasetPrepareOptions
): Record<string, unknown>[] {
  const repeater = findRepeater(template.elements ?? []);
  if (!repeater) {
    return sanitizeRecordsForRenderPdf(records.map((r) => r as Record<string, unknown>));
  }
  const datasetKey = repeater.dataset?.trim() || "locations";
  const autoCapacity = getSlotsPerLabelLikeRack(repeater, template);
  const capacity =
    prepare?.itemsPerLabel != null && prepare.itemsPerLabel > 0
      ? prepare.itemsPerLabel
      : autoCapacity;
  const normalized = records.map((loc) => normalizeRepeaterItem(loc));
  const transformed = transformLocations(
    normalized,
    prepare?.transformMode ?? "sequential",
    prepare?.columns
  );
  return sanitizeRecordsForRenderPdf(chunkDataset(transformed, capacity, datasetKey));
}

/**
 * For /labels/render-pdf: use same record structure as RackLabelDownloadModal.
 */
function buildRecordsForBackendRenderPdf(
  template: LabelTemplate | null,
  records: LabelRecord[],
  prepare?: LabelDatasetPrepareOptions
): Record<string, unknown>[] {
  if (!template?.elements?.length) {
    return sanitizeRecordsForRenderPdf(records.map((r) => r as Record<string, unknown>));
  }
  return buildRecordsLikeRackLabelModal(template, records, prepare);
}

/**
 * Build list of records to render (one per physical label). Reuses RackLabelDownloadModal logic
 * so client-side PDF layout matches backend and "Download rack labels".
 */
function buildPageRecords(
  template: LabelTemplate,
  records: LabelRecord[],
  prepare?: LabelDatasetPrepareOptions
): Record<string, unknown>[] {
  return buildRecordsLikeRackLabelModal(template, records, prepare);
}

/**
 * Client-side PDF: uses shared renderLabel so layout matches editor exactly.
 * Repeater templates: builds dataset records (e.g. { [datasetKey]: [r1, r2, r3] }) so repeater renders. Dataset key from repeater.dataset.
 * Tries vector render first (smaller PDF, sharper barcodes), falls back to raster.
 * One page per label; page size = template mm × 2.83465 pt. Printer profile is not applied (no SVG transform).
 */
async function generatePdfBlob(
  template: LabelTemplate,
  records: LabelRecord[],
  _thermal: boolean,
  _printerProfile?: PrinterProfile | null,
  prepare?: LabelDatasetPrepareOptions
): Promise<Blob> {
  const labelWmm = Math.max(0.01, Number(template.widthMm) || 100);
  const labelHmm = Math.max(0.01, Number(template.heightMm) || 60);
  const { widthPt: pageWPt, heightPt: pageHPt } = labelPageSizePt(labelWmm, labelHmm);
  const orientation = jsPdfOrientationForLabelShape(labelWmm, labelHmm);
  const pdf = new jsPDF({ orientation, unit: "pt", format: [pageWPt, pageHPt] });
  if (import.meta.env.DEV) {
    console.info("[label-pdf] LabelPrintQueue.generatePdfBlob", {
      source: "LabelPrintQueue.generatePdfBlob",
      template_id: template.id,
      width_mm: labelWmm,
      height_mm: labelHmm,
      format_pt: `${pageWPt}×${pageHPt}`,
      jsPdf_pageSize_pt: `${pdf.internal.pageSize.getWidth()}×${pdf.internal.pageSize.getHeight()}`,
    });
  }

  const pageRecords = buildPageRecords(template, records, prepare);

  const BATCH_SIZE = 20;
  let index = 0;
  for (let start = 0; start < pageRecords.length; start += BATCH_SIZE) {
    const chunk = pageRecords.slice(start, start + BATCH_SIZE);
    for (const record of chunk) {
      if (index > 0) pdf.addPage([pageWPt, pageHPt], orientation);

      const svg = await renderLabel(template, record, { thermal: _thermal });
      if (VECTOR_PDF_ENABLED) {
        try {
          await drawSvgVector(pdf, svg, 0, 0, pageWPt, pageHPt);
        } catch {
          const pngDataUrl = await svgToPngDataUrl(svg, labelWmm, labelHmm);
          pdf.addImage(pngDataUrl, "PNG", 0, 0, pageWPt, pageHPt);
        }
      } else {
        const pngDataUrl = await svgToPngDataUrl(svg, labelWmm, labelHmm);
        pdf.addImage(pngDataUrl, "PNG", 0, 0, pageWPt, pageHPt);
      }
      index++;
    }
    await new Promise((r) => setTimeout(r, 0));
  }

  return pdf.output("blob");
}

