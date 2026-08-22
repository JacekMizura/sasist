import { useEffect, useMemo, useState } from "react";
import {
  createDefaultDocumentSeriesWrite,
  createDocumentSeries,
  subtypesForDocumentSeriesType,
  type DocumentSeriesSubtype,
  type DocumentSeriesType,
} from "../../api/documentSeriesApi";
import { rememberDocumentsSeriesListContext } from "../../pages/documents/documentSeriesContext";
import { documentSeriesSubtypeLabelPl, documentSeriesTypeLabelPl } from "../../pages/documents/documentSeriesUiLabels";
import {
  Dialog,
  FormError,
  FormField,
  FormHelperText,
  FORM_FIELD_DENSITY,
  formStackClass,
  GhostButton,
  Input,
  PrimaryButton,
  Select,
} from "@/design-system";

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  warehouseId: number;
  /** Prefill subtype from order panel doc type (PARAGON → RECEIPT, else INVOICE). */
  panelDocType: string;
  onCreated: (seriesId: string) => void;
};

export default function DocumentSeriesQuickCreateModal({
  open,
  onClose,
  tenantId,
  warehouseId,
  panelDocType,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<DocumentSeriesType>("SALE");
  const [subtype, setSubtype] = useState<DocumentSeriesSubtype>("INVOICE");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allowed = useMemo(() => subtypesForDocumentSeriesType(type), [type]);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setSaving(false);
    setName("");
    setType("SALE");
    const st: DocumentSeriesSubtype =
      panelDocType === "PARAGON" ? "RECEIPT" : panelDocType === "INVOICE" ? "INVOICE" : "INVOICE";
    setSubtype(st);
  }, [open, panelDocType]);

  useEffect(() => {
    if (!allowed.includes(subtype)) {
      setSubtype(allowed[0]);
    }
  }, [allowed, subtype]);

  const save = async () => {
    const nm = name.trim();
    if (!nm) {
      setErr("Podaj nazwę serii.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const base = createDefaultDocumentSeriesWrite();
      const created = await createDocumentSeries(tenantId, warehouseId, {
        ...base,
        name: nm,
        type,
        subtype,
      });
      rememberDocumentsSeriesListContext({ type, subtype });
      onCreated(created.id);
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "")
          : "";
      setErr(msg || "Nie udało się utworzyć serii.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nowa seria dokumentów"
      size="md"
      footer={
        <>
          <GhostButton type="button" density="compact" onClick={onClose} disabled={saving}>
            Anuluj
          </GhostButton>
          <PrimaryButton type="button" density="compact" disabled={saving} onClick={() => void save()}>
            {saving ? "…" : "Utwórz serię"}
          </PrimaryButton>
        </>
      }
    >
      <div className={formStackClass}>
        <FormHelperText className="mt-0 text-sm text-slate-500">
          Uzupełnij podstawowe pola — pełną konfigurację uzupełnisz w sekcji{" "}
          <span className="font-semibold text-slate-700">Dokumenty, Serie dokumentów</span>.
        </FormHelperText>
        <FormField label="Nazwa">
          <Input
            density={FORM_FIELD_DENSITY}
            focusTone="brand"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </FormField>
        <FormField label="Typ">
          <Select
            density={FORM_FIELD_DENSITY}
            focusTone="brand"
            className="bg-white"
            value={type}
            onChange={(e) => setType(e.target.value as DocumentSeriesType)}
          >
            <option value="SALE">{documentSeriesTypeLabelPl("SALE")}</option>
            <option value="WAREHOUSE">{documentSeriesTypeLabelPl("WAREHOUSE")}</option>
            <option value="CORRECTION">{documentSeriesTypeLabelPl("CORRECTION")}</option>
          </Select>
        </FormField>
        <FormField label="Podtyp">
          <Select
            density={FORM_FIELD_DENSITY}
            focusTone="brand"
            className="bg-white"
            value={subtype}
            onChange={(e) => setSubtype(e.target.value as DocumentSeriesSubtype)}
          >
            {allowed.map((s) => (
              <option key={s} value={s}>
                {documentSeriesSubtypeLabelPl(s)}
              </option>
            ))}
          </Select>
        </FormField>
        {err ? <FormError className="mt-0 text-sm">{err}</FormError> : null}
      </div>
    </Dialog>
  );
}
