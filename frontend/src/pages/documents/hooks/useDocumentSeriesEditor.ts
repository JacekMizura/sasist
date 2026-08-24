import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCompanyProfile } from "../../../api/companyProfileApi";
import {
  createDefaultDocumentSeriesWrite,
  createDocumentSeries,
  getDocumentSeries,
  listDocumentSeries,
  subtypesForDocumentSeriesType,
  updateDocumentSeries,
  type DocumentSeriesDto,
  type DocumentSeriesSubtype,
  type DocumentSeriesWritePayload,
  type VatSource,
} from "../../../api/documentSeriesApi";
import { listOrderStatuses } from "../../../api/orderStatusesApi";
import type { OrderStatusOption } from "../../../types/wmsPackingSettings";
import { readDocumentsSeriesListContext, rememberDocumentsSeriesListContext } from "../documentSeriesContext";
import {
  cloneDocumentSeriesWrite,
  companyProfileToSeriesCompanyBlock,
  documentSeriesDtoToWrite,
} from "../documentSeriesFormUtils";
import { applyWarehouseSubtypeDefaults } from "../warehouseSeriesCapabilities";

type Options = {
  seriesId: string | null;
  isCreate: boolean;
  tenantId: number;
  warehouseId: number | null;
  onSaved: (saved: DocumentSeriesDto, mode: "create" | "update") => void;
};

export function useDocumentSeriesEditor({
  seriesId,
  isCreate,
  tenantId,
  warehouseId,
  onSaved,
}: Options) {
  const [draft, setDraft] = useState<DocumentSeriesWritePayload>(createDefaultDocumentSeriesWrite());
  const [baseline, setBaseline] = useState<DocumentSeriesWritePayload>(createDefaultDocumentSeriesWrite());
  const [allSeries, setAllSeries] = useState<DocumentSeriesDto[]>([]);
  const [statuses, setStatuses] = useState<OrderStatusOption[]>([]);
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allowedSubtypes = useMemo(() => subtypesForDocumentSeriesType(draft.type), [draft.type]);
  const isWarehouse = draft.type === "WAREHOUSE";

  useEffect(() => {
    setDraft((d) => {
      const subs = subtypesForDocumentSeriesType(d.type);
      if (!subs.includes(d.subtype)) {
        return { ...d, subtype: subs[0] };
      }
      if (d.type === "WAREHOUSE") {
        return applyWarehouseSubtypeDefaults(d, d.subtype) as DocumentSeriesWritePayload;
      }
      return d;
    });
  }, [draft.type]);

  const loadRefs = useCallback(async () => {
    if (warehouseId == null) return;
    try {
      const [series, st] = await Promise.all([
        listDocumentSeries(tenantId, warehouseId),
        listOrderStatuses(tenantId, warehouseId),
      ]);
      setAllSeries(series);
      setStatuses(st);
    } catch {
      setErr("Nie udało się wczytać list pomocniczych.");
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    if (warehouseId == null) return;

    if (isCreate) {
      const ctx = readDocumentsSeriesListContext();
      const effectiveType = ctx.type ?? "SALE";
      const subs = subtypesForDocumentSeriesType(effectiveType);
      const sub =
        ctx.subtype && subs.includes(ctx.subtype as DocumentSeriesSubtype)
          ? (ctx.subtype as DocumentSeriesSubtype)
          : subs[0];
      const next = { ...createDefaultDocumentSeriesWrite(), type: effectiveType, subtype: sub };
      setDraft(next);
      setBaseline(cloneDocumentSeriesWrite(next));
      setLoading(false);
      setErr(null);
      return;
    }

    if (!seriesId) return;

    setLoading(true);
    setErr(null);
    void getDocumentSeries(seriesId, tenantId, warehouseId)
      .then((d) => {
        const write = documentSeriesDtoToWrite(d);
        setDraft(write);
        setBaseline(cloneDocumentSeriesWrite(write));
      })
      .catch(() => setErr("Nie znaleziono serii lub błąd wczytywania."))
      .finally(() => setLoading(false));
  }, [isCreate, seriesId, tenantId, warehouseId]);

  const correctionOptions = useMemo(
    () => allSeries.filter((s) => s.type === "CORRECTION" && s.id !== seriesId),
    [allSeries, seriesId],
  );

  const warehouseSeriesOptions = useMemo(
    () => allSeries.filter((s) => s.type === "WAREHOUSE" && s.subtype === "WZ" && s.id !== seriesId),
    [allSeries, seriesId],
  );

  const setField = <K extends keyof DocumentSeriesWritePayload>(key: K, value: DocumentSeriesWritePayload[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const loadFromTenantProfile = async () => {
    setLoadingProfile(true);
    setErr(null);
    try {
      const profile = await fetchCompanyProfile(tenantId);
      const block = companyProfileToSeriesCompanyBlock(profile);
      setDraft((d) => ({ ...d, ...block }));
    } catch {
      setErr("Nie udało się wczytać profilu firmy.");
    } finally {
      setLoadingProfile(false);
    }
  };

  const cancel = useCallback(() => {
    setDraft(cloneDocumentSeriesWrite(baseline));
    setErr(null);
  }, [baseline]);

  const save = async () => {
    if (warehouseId == null) return;
    const nm = draft.name.trim();
    if (!nm) {
      setErr("Nazwa serii jest wymagana.");
      return;
    }
    if (!draft.type || !allowedSubtypes.includes(draft.subtype)) {
      setErr("Wybierz typ i dozwolony podtyp serii.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body: DocumentSeriesWritePayload = {
        ...draft,
        name: nm,
        vat_source: (draft.vat_source ?? "FROM_ORDER") as VatSource | null,
      };
      if (isCreate) {
        const created = await createDocumentSeries(tenantId, warehouseId, body);
        rememberDocumentsSeriesListContext({ type: body.type, subtype: body.subtype });
        const write = documentSeriesDtoToWrite(created);
        setDraft(write);
        setBaseline(cloneDocumentSeriesWrite(write));
        onSaved(created, "create");
      } else if (seriesId) {
        const updated = await updateDocumentSeries(seriesId, tenantId, warehouseId, body);
        rememberDocumentsSeriesListContext({ type: body.type, subtype: body.subtype });
        const write = documentSeriesDtoToWrite(updated);
        setDraft(write);
        setBaseline(cloneDocumentSeriesWrite(write));
        onSaved(updated, "update");
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "")
          : "";
      setErr(msg || "Zapis nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  return {
    draft,
    setDraft,
    setField,
    statuses,
    correctionOptions,
    warehouseSeriesOptions,
    loading,
    saving,
    loadingProfile,
    err,
    setErr,
    allowedSubtypes,
    isWarehouse,
    loadFromTenantProfile,
    cancel,
    save,
  };
}
