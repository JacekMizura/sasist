import type { DocumentTemplateListItemDto } from "../../../api/documentTemplatesApi";
import {
  ProductionRowActionsMenu,
  type ProductionRowAction,
} from "../../Production/components/ProductionRowActionsMenu";

type Props = {
  row: DocumentTemplateListItemDto;
  onEdit: (row: DocumentTemplateListItemDto) => void;
  onDuplicate: (row: DocumentTemplateListItemDto) => void;
  onHistory: (row: DocumentTemplateListItemDto) => void;
  onExport: (row: DocumentTemplateListItemDto) => void;
  onDelete: (row: DocumentTemplateListItemDto) => void;
  onPublish: (row: DocumentTemplateListItemDto) => void;
};

export function DocumentTemplatesListRowActions({
  row,
  onEdit,
  onDuplicate,
  onHistory,
  onExport,
  onDelete,
  onPublish,
}: Props) {
  const actions: ProductionRowAction[] = [
    { id: "edit", label: "Edytuj", onClick: () => onEdit(row) },
    { id: "duplicate", label: "Duplikuj", onClick: () => onDuplicate(row) },
    { id: "history", label: "Historia wersji", onClick: () => onHistory(row) },
    { id: "export", label: "Eksport", onClick: () => onExport(row) },
  ];

  if (row.draft_version) {
    actions.push({ id: "publish", label: "Publikuj", onClick: () => onPublish(row) });
  }

  if (row.can_delete) {
    actions.push({
      id: "delete",
      label: "Usuń",
      danger: true,
      onClick: () => onDelete(row),
    });
  }

  return <ProductionRowActionsMenu ariaLabel={`Akcje szablonu ${row.name}`} actions={actions} />;
}
