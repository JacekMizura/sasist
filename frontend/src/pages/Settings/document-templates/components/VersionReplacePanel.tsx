import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import {
  fetchPublishedTemplateOptions,
  fetchVersionReplaceImpact,
  replaceVersionAssignments,
  type DocumentTemplateVersionDto,
  type PublishedTemplateOptionDto,
  type TemplateAssignmentItem,
} from "@/api/documentTemplatesApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { DEFAULT_TENANT_ID } from "../constants";

type Props = {
  tenantId?: number;
  kindCode?: string | null;
  fromVersion: DocumentTemplateVersionDto;
  onReplaced?: () => void;
};

export function VersionReplacePanel({ tenantId = DEFAULT_TENANT_ID, kindCode, fromVersion, onReplaced }: Props) {
  const [impact, setImpact] = useState<{ assignment_count: number; items: TemplateAssignmentItem[] } | null>(null);
  const [options, setOptions] = useState<PublishedTemplateOptionDto[]>([]);
  const [toVersionId, setToVersionId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchVersionReplaceImpact(tenantId, fromVersion.id)
      .then(setImpact)
      .catch(() => setImpact(null));
    fetchPublishedTemplateOptions(tenantId, kindCode ? { kind_code: kindCode } : undefined)
      .then(setOptions)
      .catch(() => setOptions([]));
  }, [tenantId, kindCode, fromVersion.id]);

  async function handleReplace() {
    if (!toVersionId) {
      toast.error("Wybierz docelową wersję.");
      return;
    }
    if (!confirm) {
      toast.error("Zaznacz potwierdzenie.");
      return;
    }
    setBusy(true);
    try {
      const result = await replaceVersionAssignments(tenantId, fromVersion.id, toVersionId, true);
      toast.success(`Zaktualizowano ${result.updated_count} przypisań.`);
      onReplaced?.();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się podmienić przypisań."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
      <h4 className="text-sm font-semibold text-slate-900">
        Podmiana przypisań — v{fromVersion.version_number}
      </h4>
      <p className="text-xs text-slate-600">
        Dotyczy {impact?.assignment_count ?? 0} przypisań. Brak automatycznej migracji treści — tylko wskazanie innej opublikowanej wersji.
      </p>
      <select
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={toVersionId ?? ""}
        onChange={(e) => setToVersionId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">Wybierz docelową wersję…</option>
        {options
          .filter((o) => o.version_id !== fromVersion.id)
          .map((o) => (
            <option key={o.version_id} value={o.version_id}>
              {o.template_name} · v{o.version_number}
            </option>
          ))}
      </select>
      <label className="flex items-center gap-2 text-xs text-slate-700">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        Potwierdzam podmianę wszystkich przypisań
      </label>
      <button
        type="button"
        disabled={busy}
        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        onClick={() => void handleReplace()}
      >
        Podmień przypisania
      </button>
    </div>
  );
}
