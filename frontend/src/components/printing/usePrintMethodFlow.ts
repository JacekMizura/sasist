import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import {
  fetchPublishedTemplateOptions,
  type PublishedTemplateOptionDto,
} from "../../api/documentTemplatesApi";
import { fetchWorkstationsAvailableForMe } from "../../api/wmsWorkstationsApi";
import { useAuth } from "../../context/AuthContext";
import { packingSessionWorkstationId } from "../../pages/wms/wmsPackingSession";
import type { WorkstationListItem } from "../../types/wmsWorkstations";
import {
  cloudPrintUnavailableMessage,
  getCloudPrintCapability,
  type CloudPrintCapability,
} from "./hasDefaultCloudPrinter";
import { getPrintDocumentPref, savePrintDocumentPref } from "./printDocumentPrefs";
import type {
  PrintConfirmSelection,
  PrintMethodHandlers,
  PrintMethodKind,
  PrintRequestMeta,
} from "./printMethodTypes";

type Options = {
  tenantId: number;
  warehouseId?: number | null;
  printerKind?: PrintMethodKind;
  /**
   * When true (default), station print is offered.
   * When false, only PDF / browser alternatives.
   */
  agentSupported?: boolean;
};

type RequestInput = PrintMethodHandlers & PrintRequestMeta;

/**
 * Print entrypoint — always opens operator dialog (template + place + alternatives).
 * Infrastructure (queue / mapping) stays invisible.
 */
export function usePrintMethodFlow({
  tenantId,
  warehouseId,
  printerKind = "a4",
  agentSupported = true,
}: Options) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stations, setStations] = useState<WorkstationListItem[]>([]);
  const [templates, setTemplates] = useState<PublishedTemplateOptionDto[]>([]);
  const [pending, setPending] = useState(false);
  const [handlers, setHandlers] = useState<PrintMethodHandlers | null>(null);
  const [cloudCapability, setCloudCapability] = useState<CloudPrintCapability | null>(null);
  const [documentTypeKey, setDocumentTypeKey] = useState<string>("");
  const [title, setTitle] = useState<string>("Drukuj dokument");
  const [description, setDescription] = useState<string | undefined>(undefined);
  const [initialTemplateVersionId, setInitialTemplateVersionId] = useState<number | null>(null);
  const [initialWorkstationId, setInitialWorkstationId] = useState<number | null>(null);
  const [stationPrintAvailable, setStationPrintAvailable] = useState(true);
  const [stationUnavailableMessage, setStationUnavailableMessage] = useState<string | null>(null);

  const profileStationId = user?.wms_profile?.packing_station_id ?? null;

  const closeAll = useCallback(() => {
    if (pending) return;
    setDialogOpen(false);
    setHandlers(null);
    setStations([]);
    setTemplates([]);
    setCloudCapability(null);
  }, [pending]);

  const runStationPrint = useCallback(
    async (
      workstationId: number,
      templateVersionId: number | null,
      h: PrintMethodHandlers,
      prefsKey: string,
    ) => {
      const capability = await getCloudPrintCapability(
        tenantId,
        warehouseId,
        printerKind,
        workstationId,
      );
      setCloudCapability(capability);
      if (!capability.ready) {
        toast.error(cloudPrintUnavailableMessage(capability));
        return false;
      }
      await (h.onAgentPrint ?? h.onCloudPrint)(workstationId, templateVersionId);
      if (prefsKey) {
        savePrintDocumentPref(prefsKey, {
          workstationId,
          templateVersionId,
        });
      }
      setDialogOpen(false);
      setHandlers(null);
      return true;
    },
    [printerKind, tenantId, warehouseId],
  );

  const requestPrint = useCallback(
    async (next: RequestInput) => {
      if (pending) return;
      setPending(true);
      const {
        kindCode = null,
        documentTypeKey: typeKey = kindCode,
        title: nextTitle,
        description: nextDescription,
        onBrowserPrint,
        onCloudPrint,
        onDownloadPdf,
        onAgentPrint,
        onQzPrint,
      } = next;
      const prefsKey = (typeKey || kindCode || "").trim();
      const h: PrintMethodHandlers = {
        onBrowserPrint,
        onCloudPrint,
        onDownloadPdf,
        onAgentPrint,
        onQzPrint,
      };
      setHandlers(h);
      setDocumentTypeKey(prefsKey);
      setTitle(nextTitle?.trim() || "Drukuj dokument");
      setDescription(nextDescription);
      try {
        const prefs = prefsKey ? getPrintDocumentPref(prefsKey) : {};
        setInitialTemplateVersionId(prefs.templateVersionId ?? null);

        let loadedTemplates: PublishedTemplateOptionDto[] = [];
        if (kindCode) {
          try {
            loadedTemplates = await fetchPublishedTemplateOptions(tenantId, {
              kind_code: kindCode,
            });
          } catch {
            loadedTemplates = [];
          }
        }
        setTemplates(loadedTemplates);

        if (!agentSupported) {
          setStations([]);
          setStationPrintAvailable(false);
          setStationUnavailableMessage(null);
          setInitialWorkstationId(null);
          setDialogOpen(true);
          return;
        }

        let list = await fetchWorkstationsAvailableForMe(tenantId);
        if (warehouseId != null && warehouseId >= 1) {
          list = list.filter((s) => s.warehouse_id === warehouseId);
        }
        setStations(list);

        const sessionWs = packingSessionWorkstationId();
        const preferredWs =
          (sessionWs != null && list.some((s) => s.id === sessionWs) ? sessionWs : null) ??
          (prefs.workstationId != null && list.some((s) => s.id === prefs.workstationId)
            ? prefs.workstationId
            : null) ??
          (profileStationId != null && list.some((s) => s.id === profileStationId)
            ? profileStationId
            : null) ??
          list.find((s) => s.connection_status === "connected" || s.agent?.is_online)?.id ??
          list[0]?.id ??
          null;
        setInitialWorkstationId(preferredWs);

        if (list.length === 0) {
          setStationPrintAvailable(false);
          setStationUnavailableMessage(
            "Brak przypisanego stanowiska. Poproś administratora o dostęp do stanowiska WMS.",
          );
        } else {
          setStationPrintAvailable(true);
          setStationUnavailableMessage(null);
        }

        setDialogOpen(true);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Nie udało się rozpocząć wydruku.");
        setHandlers(null);
      } finally {
        setPending(false);
      }
    },
    [agentSupported, pending, profileStationId, tenantId, warehouseId],
  );

  const confirmSelection = useCallback(
    async (selection: PrintConfirmSelection) => {
      if (!handlers) return;
      setPending(true);
      try {
        if (selection.destination === "station") {
          if (selection.workstationId == null) {
            toast.error("Wybierz miejsce wydruku.");
            return;
          }
          await runStationPrint(
            selection.workstationId,
            selection.templateVersionId,
            handlers,
            documentTypeKey,
          );
          return;
        }
        if (documentTypeKey) {
          savePrintDocumentPref(documentTypeKey, {
            templateVersionId: selection.templateVersionId,
          });
        }
        if (selection.destination === "browser") {
          await handlers.onBrowserPrint(selection.templateVersionId);
        } else {
          await handlers.onDownloadPdf(selection.templateVersionId);
        }
        setDialogOpen(false);
        setHandlers(null);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Nie udało się wykonać wydruku.");
      } finally {
        setPending(false);
      }
    },
    [documentTypeKey, handlers, runStationPrint],
  );

  return {
    /** @deprecated kept for older callers expecting PrintMethodDialog open flag */
    open: dialogOpen,
    dialogOpen,
    methodOpen: false,
    stationPickerOpen: false,
    stations,
    templates,
    pending,
    cloudCapability,
    preferSasistAgent: true as boolean | null,
    alternativesOnly: false,
    lastUsedStationId: initialWorkstationId ?? profileStationId,
    activeWorkstationId: initialWorkstationId,
    title,
    description,
    initialTemplateVersionId,
    initialWorkstationId,
    stationPrintAvailable,
    stationUnavailableMessage,
    requestPrint,
    confirmSelection,
    /** @deprecated */
    confirmMethod: async () => undefined,
    /** @deprecated */
    confirmStation: async () => undefined,
    /** @deprecated */
    openAlternativeFromPicker: () => undefined,
    close: closeAll,
  };
}
