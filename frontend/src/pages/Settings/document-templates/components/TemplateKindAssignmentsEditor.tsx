import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  fetchTemplateKindAssignments,
  saveTemplateKindAssignments,
  type TemplateKindAssignmentItem,
} from "../../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../../api/apiErrorMessage";
import { DEFAULT_TENANT_ID } from "../constants";

type Props = {
  templateId: number;
  publishedVersionId: number | null;
  onSaved?: () => void;
};

export function TemplateKindAssignmentsEditor({ templateId, publishedVersionId, onSaved }: Props) {
  const [items, setItems] = useState<TemplateKindAssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    void fetchTemplateKindAssignments(DEFAULT_TENANT_ID, templateId)
      .then(setItems)
      .catch(() => toast.error("Nie udało się wczytać przypisań."))
      .finally(() => setLoading(false));
  }, [templateId]);

  const assignedItems = useMemo(() => items.filter((i) => i.assigned), [items]);

  function toggleAssigned(kindCode: string, assigned: boolean) {
    setItems((prev) =>
      prev.map((row) => {
        if (row.kind_code !== kindCode) return row;
        return { ...row, assigned, is_default: assigned ? row.is_default : false };
      }),
    );
  }

  function toggleDefault(kindCode: string, isDefault: boolean) {
    setItems((prev) =>
      prev.map((row) => (row.kind_code === kindCode ? { ...row, is_default: isDefault } : row)),
    );
  }

  async function handleSave() {
    if (!publishedVersionId) {
      toast.error("Opublikuj szablon, aby zapisać przypisania.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveTemplateKindAssignments(DEFAULT_TENANT_ID, templateId, items);
      setItems(saved);
      toast.success("Zapisano przypisania.");
      onSaved?.();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się zapisać przypisań."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-xs text-slate-500">Wczytywanie przypisań…</p>;
  }

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold text-slate-900">Przypisania</h3>
        <p className="mt-1 text-xs text-slate-500">Zaznacz typy dokumentów, dla których ten szablon jest dostępny przy druku.</p>
        <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
          {items.map((row) => (
            <li key={row.kind_code}>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={row.assigned}
                  onChange={(e) => toggleAssigned(row.kind_code, e.target.checked)}
                />
                {row.kind_name}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-900">Domyślny dla</h3>
        <p className="mt-1 text-xs text-slate-500">Jeden domyślny szablon na typ dokumentu — używany automatycznie przy druku.</p>
        {assignedItems.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">Zaznacz co najmniej jedno przypisanie powyżej.</p>
        ) : (
          <ul className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3">
            {assignedItems.map((row) => (
              <li key={row.kind_code}>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    checked={row.is_default}
                    onChange={(e) => toggleDefault(row.kind_code, e.target.checked)}
                  />
                  {row.kind_name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        disabled={saving || !publishedVersionId}
        onClick={() => void handleSave()}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {saving ? "Zapisywanie…" : "Zapisz przypisania"}
      </button>
    </div>
  );
}
