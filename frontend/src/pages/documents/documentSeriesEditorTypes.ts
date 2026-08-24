export type DocumentSeriesEditorTab =
  | "basics"
  | "document"
  | "numbering"
  | "automation"
  | "company";

export const DOCUMENT_SERIES_EDITOR_TABS: Array<{ id: DocumentSeriesEditorTab; label: string }> = [
  { id: "basics", label: "Podstawowe" },
  { id: "document", label: "Dokument" },
  { id: "numbering", label: "Numeracja" },
  { id: "automation", label: "Automatyzacja" },
  { id: "company", label: "Dane na dokumencie" },
];
