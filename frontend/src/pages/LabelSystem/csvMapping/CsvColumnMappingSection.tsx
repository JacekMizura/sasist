import { useMemo } from "react";
import { Check } from "lucide-react";

import type { LabelTemplate } from "../../../types/labelSystem";
import { mappedTargetFields, polishLabelCsvFieldForUi } from "../labelCsvImport";
import CsvFieldMappingCombobox from "./CsvFieldMappingCombobox";
import {
  buildCsvMappingFieldGroups,
  csvColumnMappingStatus,
  csvMappingStatusLabel,
  csvTemplateFieldMappingStatus,
  resolveTemplateAvailableVariables,
  resolveTemplateUsedVariables,
  type CsvMappingStatus,
} from "./labelCsvMappingFields";

type Props = {
  csvHeaders: string[];
  csvColumnToField: Record<string, string>;
  onMappingChange: (header: string, field: string) => void;
  template: LabelTemplate | null;
  templateType?: string | null;
  apiAvailableVariables?: string[] | null;
  bindingKeys: Iterable<string>;
};

function StatusBadge({ status }: { status: CsvMappingStatus }) {
  const label = csvMappingStatusLabel(status);
  const cls =
    status === "required"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : status === "optional"
        ? "bg-slate-50 text-slate-600 border-slate-200"
        : "bg-amber-50 text-amber-900 border-amber-200";
  return (
    <span className={`inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

/**
 * Template field checklist + searchable CSV column mapping table.
 */
export default function CsvColumnMappingSection({
  csvHeaders,
  csvColumnToField,
  onMappingChange,
  template,
  templateType,
  apiAvailableVariables,
  bindingKeys,
}: Props) {
  const usedFields = useMemo(
    () =>
      resolveTemplateUsedVariables({
        template,
        apiAvailableVariables,
        bindingKeys,
      }),
    [template, apiAvailableVariables, bindingKeys],
  );

  const availableVariables = useMemo(
    () =>
      resolveTemplateAvailableVariables({
        template,
        apiAvailableVariables,
        bindingKeys,
        templateType,
      }),
    [template, apiAvailableVariables, bindingKeys, templateType],
  );

  const availableSet = useMemo(() => new Set(availableVariables), [availableVariables]);
  const mappedTargets = useMemo(() => mappedTargetFields(csvColumnToField), [csvColumnToField]);

  const groups = useMemo(
    () => buildCsvMappingFieldGroups({ availableVariables, templateType }),
    [availableVariables, templateType],
  );

  const checklistFields = usedFields.length > 0 ? usedFields : availableVariables;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
        <p className="mb-2 text-xs font-semibold text-slate-700">Ten szablon używa pól:</p>
        {checklistFields.length === 0 ? (
          <p className="text-xs text-slate-500">
            Ten szablon nie ma rozpoznanych zmiennych do mapowania — sprawdź pola w projektancie.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {checklistFields.map((field) => {
              const status = csvTemplateFieldMappingStatus(field, mappedTargets);
              const covered = status === "required";
              return (
                <li key={field} className="flex items-center gap-2 text-xs text-slate-700">
                  <span
                    className={[
                      "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                      covered ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-transparent",
                    ].join(" ")}
                    aria-hidden
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{polishLabelCsvFieldForUi(field)}</span>
                  <StatusBadge status={covered ? "required" : "missing"} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="max-h-72 overflow-auto rounded border border-[#E2E8F0]">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-[#E2E8F0] bg-slate-50">
            <tr>
              <th className="px-2 py-1.5 font-medium text-slate-600">Kolumna CSV</th>
              <th className="px-2 py-1.5 font-medium text-slate-600">Pole etykiety</th>
              <th className="px-2 py-1.5 font-medium text-slate-600 w-[7.5rem]">Status</th>
            </tr>
          </thead>
          <tbody>
            {csvHeaders.map((h) => {
              const mapped = csvColumnToField[h] ?? "";
              const status = csvColumnMappingStatus(mapped, availableSet);
              return (
                <tr key={h} className="border-b border-slate-100">
                  <td className="px-2 py-1.5 text-slate-800 align-middle font-medium">{h}</td>
                  <td className="px-2 py-1 align-middle">
                    <CsvFieldMappingCombobox
                      value={mapped}
                      groups={groups}
                      templateType={templateType}
                      onChange={(field) => onMappingChange(h, field)}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <StatusBadge status={status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
