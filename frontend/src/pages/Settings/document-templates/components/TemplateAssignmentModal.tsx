import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { bindDocumentTemplate, fetchTemplateUsage } from "../../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../../api/apiErrorMessage";
import { DEFAULT_TENANT_ID } from "../constants";
import { allAssignableKinds } from "../utils/assignableDocumentKinds";

type Props = {
  templateId: number;
  templateKindCode: string | null;
  publishedVersionId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function TemplateAssignmentModal({
  templateId,
  templateKindCode,
  publishedVersionId,
  open,
  onClose,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assignedKinds, setAssignedKinds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, ReturnType<typeof allAssignableKinds>>();
    for (const k of allAssignableKinds()) {
      const list = map.get(k.group) ?? [];
      list.push(k);
      map.set(k.group, list);
    }
    return [...map.entries()];
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void fetchTemplateUsage(DEFAULT_TENANT_ID, templateId)
      .then((data) => {
        if (cancelled) return;
        const codes = new Set<string>();
        for (const item of data.items) {
          if (item.kind_code) codes.add(item.kind_code);
        }
        if (templateKindCode) codes.add(templateKindCode);
        setAssignedKinds(codes);
        setSelected(new Set(codes));
      })
      .catch(() => {
        if (!cancelled && templateKindCode) {
          setSelected(new Set([templateKindCode]));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, templateId, templateKindCode]);

  if (!open) return null;

  async function handleSave() {
    if (!templateKindCode || !publishedVersionId) {
      toast.error("Opublikuj szablon, aby móc go przypisać do dokumentów.");
      return;
    }
    if (!selected.has(templateKindCode)) {
      toast.error(`Ten szablon jest typu „${templateKindCode}” — zaznacz odpowiadający dokument.`);
      return;
    }
    setSaving(true);
    try {
      await bindDocumentTemplate(DEFAULT_TENANT_ID, {
        kind_code: templateKindCode,
        template_id: templateId,
        version_id: publishedVersionId,
      });
      toast.success("Przypisano szablon.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się zapisać przypisania."));
    } finally {
      setSaving(false);
    }
  }

  function toggle(kindCode: string, enabled: boolean) {
    if (!enabled) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kindCode)) next.delete(kindCode);
      else next.add(kindCode);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Przypisz szablon do dokumentów</h2>
          <p className="mt-1 text-sm text-slate-600">
            Wybierz, w których wydrukach ERP ma być używany ten szablon.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-slate-500">Wczytywanie…</p>
          ) : (
            <div className="space-y-5">
              {groups.map(([group, kinds]) => (
                <section key={group}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h3>
                  <ul className="space-y-2">
                    {kinds.map((k) => {
                      const enabled = k.kindCode === templateKindCode;
                      const checked = selected.has(k.kindCode) || assignedKinds.has(k.kindCode);
                      return (
                        <li key={k.kindCode}>
                          <label
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${
                              enabled
                                ? "border-slate-200 bg-white hover:border-blue-300"
                                : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300"
                              checked={checked && enabled}
                              disabled={!enabled}
                              onChange={() => toggle(k.kindCode, enabled)}
                            />
                            <span className="text-sm font-medium text-slate-800">{k.label}</span>
                            {!enabled ? (
                              <span className="ml-auto text-[10px] text-slate-400">Inny typ szablonu</span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={saving || loading}
            className="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void handleSave()}
          >
            Zapisz przypisania
          </button>
        </div>
      </div>
    </div>
  );
}
