import { useCallback, useEffect, useState, type ReactNode } from "react";
import toast from "react-hot-toast";

import {
  fetchScopeAssignments,
  upsertScopeAssignment,
} from "@/api/documentTemplatesApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { SettingInfoButton } from "../../SettingInfoButton";
import { DocumentTemplateSelect } from "./DocumentTemplateSelect";

export type ScopeKindConfig = {
  kindCode: string;
  label: string;
  variantCode?: string;
  /** Optional contextual help for this document kind. */
  info?: { title: string; description: ReactNode; tip?: ReactNode };
};

type Props = {
  tenantId: number;
  scopeType: string;
  scopeId: number;
  title?: string;
  /** Pass `null` to hide the subtitle under the section title. */
  description?: string | null;
  kinds: ScopeKindConfig[];
  /** When true, kind label is a heading above DocumentTemplateSelect (Firma screen). */
  kindAsHeading?: boolean;
  titleClassName?: string;
  titleInfo?: { title: string; description: ReactNode; tip?: ReactNode };
};

export function DocumentTemplateScopeSection({
  tenantId,
  scopeType,
  scopeId,
  title = "Szablony wydruków",
  description = "Wybierz opublikowane wersje szablonów dla tego modułu.",
  kinds,
  kindAsHeading = false,
  titleClassName,
  titleInfo,
}: Props) {
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchScopeAssignments(tenantId, scopeType, scopeId);
      const map: Record<string, number | null> = {};
      for (const k of kinds) {
        const hit = items.find((i) => i.kind_code === k.kindCode);
        map[k.kindCode] = hit?.version_id ?? null;
      }
      setValues(map);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się wczytać przypisań szablonów."));
    } finally {
      setLoading(false);
    }
  }, [tenantId, scopeType, scopeId, kinds]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onChange(kindCode: string, variantCode: string | undefined, versionId: number | null) {
    setValues((prev) => ({ ...prev, [kindCode]: versionId }));
    try {
      await upsertScopeAssignment(tenantId, {
        kind_code: kindCode,
        scope_type: scopeType,
        scope_id: scopeId,
        version_id: versionId,
        variant_code: variantCode ?? "standard",
      });
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się zapisać przypisania."));
      void load();
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Wczytywanie szablonów…</p>;
  }

  return (
    <div className="space-y-4">
      {(title.trim() || titleInfo || description) ? (
        <div>
          {(title.trim() || titleInfo) ? (
            <div className="flex items-center gap-1.5">
              {title.trim() ? (
                <h3 className={titleClassName?.trim() || "text-sm font-semibold text-slate-900"}>{title}</h3>
              ) : null}
              {titleInfo ? (
                <SettingInfoButton
                  title={titleInfo.title}
                  description={titleInfo.description}
                  tip={titleInfo.tip}
                />
              ) : null}
            </div>
          ) : null}
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2">
        {kinds.map((k) =>
          kindAsHeading ? (
            <div key={k.kindCode} className="min-w-0">
              <div className="mb-2 flex items-center gap-1.5">
                <p className="text-sm font-bold text-slate-900">{k.label}</p>
                {k.info ? (
                  <SettingInfoButton title={k.info.title} description={k.info.description} tip={k.info.tip} />
                ) : null}
              </div>
              <DocumentTemplateSelect
                tenantId={tenantId}
                kindCode={k.kindCode}
                variantCode={k.variantCode}
                value={values[k.kindCode] ?? null}
                onChange={(versionId) => void onChange(k.kindCode, k.variantCode, versionId)}
              />
            </div>
          ) : (
            <div key={k.kindCode} className="block text-xs font-medium text-slate-600">
              <div className="flex items-center gap-1.5">
                <span>{k.label}</span>
                {k.info ? (
                  <SettingInfoButton title={k.info.title} description={k.info.description} tip={k.info.tip} />
                ) : null}
              </div>
              <div className="mt-1">
                <DocumentTemplateSelect
                  tenantId={tenantId}
                  kindCode={k.kindCode}
                  variantCode={k.variantCode}
                  value={values[k.kindCode] ?? null}
                  onChange={(versionId) => void onChange(k.kindCode, k.variantCode, versionId)}
                />
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
