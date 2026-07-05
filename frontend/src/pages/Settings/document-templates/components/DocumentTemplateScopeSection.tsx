import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import {
  fetchScopeAssignments,
  upsertScopeAssignment,
} from "@/api/documentTemplatesApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { DocumentTemplateSelect } from "./DocumentTemplateSelect";

export type ScopeKindConfig = {
  kindCode: string;
  label: string;
  variantCode?: string;
};

type Props = {
  tenantId: number;
  scopeType: string;
  scopeId: number;
  title?: string;
  description?: string;
  kinds: ScopeKindConfig[];
};

export function DocumentTemplateScopeSection({
  tenantId,
  scopeType,
  scopeId,
  title = "Szablony dokumentów",
  description = "Wybierz opublikowane wersje szablonów dla tego modułu.",
  kinds,
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
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {kinds.map((k) => (
          <label key={k.kindCode} className="block text-xs font-medium text-slate-600">
            {k.label}
            <div className="mt-1">
              <DocumentTemplateSelect
                tenantId={tenantId}
                kindCode={k.kindCode}
                variantCode={k.variantCode}
                value={values[k.kindCode] ?? null}
                onChange={(versionId) => void onChange(k.kindCode, k.variantCode, versionId)}
              />
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
