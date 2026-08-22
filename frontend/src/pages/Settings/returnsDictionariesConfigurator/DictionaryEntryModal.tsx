import { useEffect, useRef, useState } from "react";
import {
  FORM_FIELD_DENSITY,
  FormField,
  GhostButton,
  Input,
  PrimaryButton,
} from "@/design-system";
import toast from "react-hot-toast";

import { uploadReturnOrderSourceLogo } from "../../../api/returnModuleConfigApi";
import type { ReturnCustomerReturnTypeDto, ReturnOrderSourceDto } from "../../../types/returnModuleConfig";
import { ReturnsConfiguratorModalShell } from "../returnsStatusesConfigurator/ReturnsConfiguratorModalShell";
import { OrderSourceLogo } from "./OrderSourceLogo";
import {
  ORDER_SOURCE_LOGO_ACCEPT,
  validateOrderSourceLogoFile,
} from "./orderSourceUtils";

type ReturnTypeModalProps = {
  open: boolean;
  mode: "create" | "edit";
  row: ReturnCustomerReturnTypeDto | null;
  onClose: () => void;
  onSave: (entry: ReturnCustomerReturnTypeDto) => void;
};

export function ReturnTypeEntryModal({ open, mode, row, onClose, onSave }: ReturnTypeModalProps) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (open) setLabel(row?.label ?? "");
  }, [open, row]);

  return (
    <ReturnsConfiguratorModalShell
      open={open}
      title={mode === "create" ? "Nowy rodzaj zwrotu" : "Edytuj rodzaj zwrotu"}
      subtitle="Nazwa widoczna dla klienta w formularzu zwrotu."
      onClose={onClose}
      footer={
        <>
          <GhostButton type="button" onClick={onClose}>
            Anuluj
          </GhostButton>
          <PrimaryButton
            type="button"
            disabled={!label.trim()}
            onClick={() => row && onSave({ ...row, label: label.trim() })}
          >
            Zapisz
          </PrimaryButton>
        </>
      }
    >
      <FormField label="Nazwa">
        <Input density={FORM_FIELD_DENSITY} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      </FormField>
    </ReturnsConfiguratorModalShell>
  );
}

type SourceModalProps = {
  open: boolean;
  mode: "create" | "edit";
  row: ReturnOrderSourceDto | null;
  tenantId: number;
  warehouseId: number | null;
  onClose: () => void;
  onSave: (entry: ReturnOrderSourceDto) => void;
};

export function OrderSourceEntryModal({
  open,
  mode,
  row,
  tenantId,
  warehouseId,
  onClose,
  onSave,
}: SourceModalProps) {
  const [draft, setDraft] = useState<ReturnOrderSourceDto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(row);
    setPendingFile(null);
    setPreviewUrl(null);
  }, [open, row]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const clearLogo = () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
    setDraft((d) => (d ? { ...d, logo_url: null } : d));
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickFile = (file: File | null) => {
    if (!file) return;
    const err = validateOrderSourceLogoFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!draft || !draft.label.trim()) return;
    setUploading(true);
    try {
      let logoUrl = draft.logo_url ?? null;
      if (pendingFile) {
        logoUrl = await uploadReturnOrderSourceLogo(pendingFile, { tenantId, warehouseId });
      }
      onSave({
        ...draft,
        label: draft.label.trim(),
        logo_url: logoUrl,
      });
    } catch {
      toast.error("Nie udało się wgrać logo.");
    } finally {
      setUploading(false);
    }
  };

  if (!draft) return null;

  return (
    <ReturnsConfiguratorModalShell
      open={open}
      title={mode === "create" ? "Nowe źródło" : "Edytuj źródło"}
      onClose={onClose}
      footer={
        <>
          <GhostButton type="button" onClick={onClose}>
            Anuluj
          </GhostButton>
          <PrimaryButton
            type="button"
            disabled={!draft.label.trim() || uploading}
            onClick={() => void handleSave()}
          >
            {uploading ? "Zapisywanie…" : "Zapisz"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-5">
        <FormField label="Nazwa źródła">
          <Input
            density={FORM_FIELD_DENSITY}
            value={draft.label}
            onChange={(e) => setDraft((d) => (d ? { ...d, label: e.target.value } : d))}
            autoFocus
            placeholder="np. Sklep internetowy, Allegro, B2B"
          />
        </FormField>

        <div>
          <p className="mb-1.5 block text-xs font-medium text-slate-600">Logo (opcjonalne)</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <OrderSourceLogo label={draft.label} logoUrl={draft.logo_url} previewUrl={previewUrl} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => fileRef.current?.click()}
              >
                Wybierz plik…
              </button>
              {draft.logo_url || previewUrl ? (
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
                  onClick={clearLogo}
                >
                  Usuń logo
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={ORDER_SOURCE_LOGO_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                onPickFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">PNG, JPG, WebP lub SVG — max 2 MB. Obraz zostanie dopasowany do listy.</p>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={draft.is_active}
            onChange={(e) => setDraft((d) => (d ? { ...d, is_active: e.target.checked } : d))}
          />
          Aktywne
        </label>
      </div>
    </ReturnsConfiguratorModalShell>
  );
}
