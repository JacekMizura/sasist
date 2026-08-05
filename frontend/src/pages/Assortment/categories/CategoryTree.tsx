import type { ProductCategoryTreeNode } from "../../../api/productCategoriesApi";
import { CategoryTreeRow } from "./CategoryTreeRow";

type Props = {
  nodes: ProductCategoryTreeNode[];
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
  onAddChild: (parentId: number) => void;
  onEdit: (node: ProductCategoryTreeNode) => void;
  onDelete: (node: ProductCategoryTreeNode) => void;
  selectable?: boolean;
  selectedPrimaryId?: number | null;
  selectedAdditionalIds?: Set<number>;
  onSelectPrimary?: (id: number) => void;
  onToggleAdditional?: (id: number) => void;
  depth?: number;
};

export function CategoryTree({
  nodes,
  expandedIds,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
  selectable,
  selectedPrimaryId,
  selectedAdditionalIds,
  onSelectPrimary,
  onToggleAdditional,
  depth = 0,
}: Props) {
  return (
    <div className={depth === 0 ? "overflow-hidden rounded-xl border border-slate-200 bg-white" : ""}>
      {nodes.map((node) => {
        const hasChildren = (node.children?.length ?? 0) > 0;
        const expanded = expandedIds.has(node.id);
        return (
          <div key={node.id}>
            <CategoryTreeRow
              node={node}
              depth={depth}
              expanded={expanded}
              hasChildren={hasChildren}
              onToggle={() => onToggle(node.id)}
              onAddChild={() => onAddChild(node.id)}
              onEdit={() => onEdit(node)}
              onDelete={() => onDelete(node)}
              selectable={selectable}
              selectedPrimaryId={selectedPrimaryId}
              selectedAdditionalIds={selectedAdditionalIds}
              onSelectPrimary={onSelectPrimary}
              onToggleAdditional={onToggleAdditional}
            />
            {hasChildren && expanded ? (
              <CategoryTree
                nodes={node.children}
                expandedIds={expandedIds}
                onToggle={onToggle}
                onAddChild={onAddChild}
                onEdit={onEdit}
                onDelete={onDelete}
                selectable={selectable}
                selectedPrimaryId={selectedPrimaryId}
                selectedAdditionalIds={selectedAdditionalIds}
                onSelectPrimary={onSelectPrimary}
                onToggleAdditional={onToggleAdditional}
                depth={depth + 1}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
