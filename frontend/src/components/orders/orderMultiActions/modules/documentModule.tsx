import { FileText } from "lucide-react";

import type { OrderMultiModuleDef, OrderModuleCardProps } from "../types";
import { pmaLab } from "../uiTokens";

export type DocumentConfig = {
  documentType: "INVOICE" | "PARAGON" | "";
};

function DocumentCard({ config, onChange, disabled }: OrderModuleCardProps<DocumentConfig>) {
  return (
    <fieldset disabled={disabled}>
      <legend className={pmaLab}>Typ dokumentu</legend>
      <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-800">
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="oma-document-type"
            checked={config.documentType === "INVOICE"}
            onChange={() => onChange({ documentType: "INVOICE" })}
          />
          Faktura
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="oma-document-type"
            checked={config.documentType === "PARAGON"}
            onChange={() => onChange({ documentType: "PARAGON" })}
          />
          Paragon
        </label>
      </div>
    </fieldset>
  );
}

export const documentModule: OrderMultiModuleDef<DocumentConfig> = {
  id: "document",
  label: "Dokument",
  group: "Dokumenty",
  stage: 1,
  icon: FileText,
  defaultConfig: () => ({ documentType: "INVOICE" }),
  validate: (cfg) => (cfg.documentType ? null : "Wybierz typ dokumentu."),
  Card: DocumentCard,
  toOps: (cfg) => [
    {
      kind: "issue_document",
      config: { issue_document: { documentType: cfg.documentType as "INVOICE" | "PARAGON" } },
    },
  ],
};
