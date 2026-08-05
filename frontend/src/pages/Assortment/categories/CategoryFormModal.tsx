import { useEffect, useMemo, useState } from "react";

import type { ProductCategoryTreeNode } from "../../../api/productCategoriesApi";
import { Checkbox, Dialog, GhostButton, Input, PrimaryButton, Select, Textarea } from "../../../design-system";
import { flattenCategoryTree } from "../../../modules/productCategories/categoryTreeUtils";

type Mode = "create" | "edit";

type Props = {
  open: boolean;
  mode: Mode;
  tree: ProductCategoryTreeNode[];
  initial?: ProductCategoryTreeNode | null;
  /** Pre-selected parent when adding a child. */
  defaultParentId?: number | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    parent_id: number | null;
    clear_parent: boolean;
    description: string;
    is_active: boolean;
    sort_order: number;
  }) => Promise<void> | void;
};

export function CategoryFormModal({
  open,
  mode,
  tree,
  initial,
  defaultParentId = null,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const flat = useMemo(() => flattenCategoryTree(tree), [tree]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setName(initial.name);
      setParentId(initial.parent_id ?? "");
      setDescription(initial.description ?? "");
      setIsActive(initial.is_active);
      setSortOrder(initial.sort_order ?? 0);
    } else {
      setName("");
      setParentId(defaultParentId ?? "");
      setDescription("");
      setIsActive(true);
      setSortOrder(0);
    }
  }, [open, mode, initial, defaultParentId]);

  const parentOptions = flat.filter((n) => (mode === "edit" && initial ? n.id !== initial.id : true));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edytuj kategorię" : "Nowa kategoria"}
      size="md"
      footer={
        <>
          <GhostButton type="button" density="compact" onClick={onClose} disabled={busy}>
            Anuluj
          </GhostButton>
          <PrimaryButton
            type="button"
            density="compact"
            disabled={busy || !name.trim()}
            onClick={() =>
              void onSubmit({
                name: name.trim(),
                parent_id: parentId === "" ? null : Number(parentId),
                clear_parent: parentId === "",
                description: description.trim(),
                is_active: isActive,
                sort_order: sortOrder,
              })
            }
          >
            {busy ? "Zapisywanie…" : "Zapisz"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Nazwa</label>
          <Input
            density="comfortable"
            focusTone="brand"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. Łazienka"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Rodzic</label>
          <Select
            density="comfortable"
            focusTone="brand"
            value={parentId}
            onChange={(e) => {
              const v = e.target.value;
              setParentId(v === "" ? "" : Number(v));
            }}
            className="bg-white"
          >
            <option value="">— Kategoria główna (korzeń) —</option>
            {parentOptions.map((n) => (
              <option key={n.id} value={n.id}>
                {n.path_names.join(" › ")}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Opis</label>
          <Textarea
            density="comfortable"
            focusTone="brand"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opcjonalny opis kategorii"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Kolejność</label>
            <Input
              type="number"
              density="comfortable"
              focusTone="brand"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number.parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
              <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Aktywna
            </label>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
