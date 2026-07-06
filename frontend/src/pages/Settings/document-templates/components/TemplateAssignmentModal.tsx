import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  bindDocumentTemplate,
  fetchPublishedTemplateOptions,
  fetchTemplateUsage,
  type PublishedTemplateOptionDto,
} from "../../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../../api/apiErrorMessage";
import { DEFAULT_TENANT_ID } from "../constants";
import { allAssignableKinds, kindLabel } from "../utils/assignableDocumentKinds";

type Props = {
  templateId: number;
  templateKindCode: string | null;
  templateKindName: string | null;
  publishedVersionId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function TemplateAssignmentModal({
  templateId,
  templateKindCode,
  templateKindName,
  publishedVersionId,
  open,
  onClose,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [savingKind, setSavingKind] = useState<string | null>(null);
  const [bindings, setBindings] = useState<Record<string, PublishedTemplateOptionDto | null>>({});
  const [usedHere, setUsedHere] = useState<Set<string>>(new Set());

  const kinds = useMemo(() => allAssignableKinds(), []);

  const groups = useMemo(() => {
    const map = new Map<string, typeof kinds>();
    for (const k of kinds) {
      const list = map.get(k.group) ?? [];
      list.push(k);
      map.set(k.group, list);
    }
    return [...map.entries()];
  }, [kinds]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchTemplateUsage(DEFAULT_TENANT_ID, templateId),
      ...kinds.map(async (k) => {
        const items = await fetchPublishedTemplateOptions(DEFAULT_TENANT_ID, { kind_code: k.kindCode });
        const bound = items.find((i) => i.is_default_binding) ?? items[0] ?? null;
        return [k.kindCode, bound] as const;
      }),
    ])
      .then(([usage, ...bindingPairs]) => {
        if (cancelled) return;
        const used = new Set<string>();
        for (const item of usage.items) {
          if (item.kind_code) used.add(item.kind_code);
        }
        setUsedHere(used);
        const map: Record<string, PublishedTemplateOptionDto | null> = {};
        for (const [code, opt] of bindingPairs) map[code] = opt;
        setBindings(map);
      })
      .catch(() => {
        if (!cancelled) toast.error("Nie udało się wczytać przypisań.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, templateId, kinds]);

  if (!open) return null;

  async function assignKind(kindCode: string) {
    if (!publishedVersionId) {
      toast.error("Opublikuj szablon, aby móc go przypisać do dokumentów.");
      return;
    }
    if (kindCode !== templateKindCode) return;
    setSavingKind(kindCode);
    try {
      await bindDocumentTemplate(DEFAULT_TENANT_ID, {
        kind_code: kindCode,
        template_id: templateId,
        version_id: publishedVersionId,
      });
      toast.success(`Przypisano do: ${kindLabel(kindCode)}`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się zapisać przypisania."));
    } finally {
      setSavingKind(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Przypisz szablon do dokumentów</h2>
          <p className="mt-1 text-sm text-slate-600">
            Wybierz dokumenty ERP, które mają korzystać z tego wydruku.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-slate-500">Wczytywanie…</p>
          ) : (
            <div className="space-y-6">
              {groups.map(([group, groupKinds]) => (
                <section key={group}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h3>
                  <div className="space-y-3">
                    {groupKinds.map((k) => (
                      <DocumentKindCard
                        key={k.kindCode}
                        label={k.label}
                        description={k.description}
                        kindCode={k.kindCode}
                        templateId={templateId}
                        templateKindCode={templateKindCode}
                        templateKindName={templateKindName}
                        publishedVersionId={publishedVersionId}
                        binding={bindings[k.kindCode] ?? null}
                        isUsedHere={usedHere.has(k.kindCode)}
                        saving={savingKind === k.kindCode}
                        onAssign={() => void assignKind(k.kindCode)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-3">
          <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={onClose}>
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentKindCard({
  label,
  description,
  kindCode,
  templateId,
  templateKindCode,
  templateKindName,
  publishedVersionId,
  binding,
  isUsedHere,
  saving,
  onAssign,
}: {
  label: string;
  description: string;
  kindCode: string;
  templateId: number;
  templateKindCode: string | null;
  templateKindName: string | null;
  publishedVersionId: number | null;
  binding: PublishedTemplateOptionDto | null;
  isUsedHere: boolean;
  saving: boolean;
  onAssign: () => void;
}) {
  const isMatch = kindCode === templateKindCode;
  const isCurrent =
    isMatch &&
    (binding?.template_id === templateId || isUsedHere);
  const otherTemplate =
    isMatch && binding && binding.template_id !== templateId
      ? `${binding.template_name} v${binding.version_number}`
      : null;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <span className="text-xl" aria-hidden>
          📄
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-slate-900">{label}</h4>
          <p className="mt-1 text-xs text-slate-600">{description}</p>

          {!isMatch ? (
            <p className="mt-3 text-xs text-slate-500">
              Ten szablon jest typu „{templateKindName ?? templateKindCode ?? "—"}”. Aby przypisać „{label}”, utwórz
              osobny szablon tego typu dokumentu.
            </p>
          ) : isCurrent ? (
            <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
              <span aria-hidden>✓</span> Aktualnie używany
            </p>
          ) : otherTemplate ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-600">
                Ten dokument korzysta obecnie z:
                <br />
                <span className="font-medium text-slate-800">{otherTemplate}</span>
              </p>
              <button
                type="button"
                disabled={saving || !publishedVersionId}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                onClick={onAssign}
              >
                Zastąp
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={saving || !publishedVersionId}
              className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              onClick={onAssign}
            >
              Użyj tego szablonu
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
