import type { ProductCategoryTreeNode } from "../../api/productCategoriesApi";

export function flattenCategoryTree(nodes: ProductCategoryTreeNode[]): ProductCategoryTreeNode[] {
  const out: ProductCategoryTreeNode[] = [];
  const walk = (list: ProductCategoryTreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function filterCategoryTree(
  nodes: ProductCategoryTreeNode[],
  query: string,
): { tree: ProductCategoryTreeNode[]; autoExpandIds: Set<number> } {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { tree: nodes, autoExpandIds: new Set() };
  }

  const autoExpandIds = new Set<number>();

  const filterNode = (node: ProductCategoryTreeNode): ProductCategoryTreeNode | null => {
    const childHits = (node.children ?? [])
      .map(filterNode)
      .filter((c): c is ProductCategoryTreeNode => c != null);
    const selfHit = node.name.toLowerCase().includes(q) || (node.description ?? "").toLowerCase().includes(q);
    if (!selfHit && childHits.length === 0) return null;
    if (childHits.length > 0 || selfHit) {
      for (const id of node.path_ids) autoExpandIds.add(id);
    }
    return { ...node, children: childHits };
  };

  const tree = nodes.map(filterNode).filter((n): n is ProductCategoryTreeNode => n != null);
  return { tree, autoExpandIds };
}

export function formatCategoryPath(names: string[] | null | undefined): string {
  if (!names?.length) return "—";
  return names.join(" › ");
}

export function collectAncestorIds(node: ProductCategoryTreeNode): number[] {
  return node.path_ids.slice(0, -1);
}
