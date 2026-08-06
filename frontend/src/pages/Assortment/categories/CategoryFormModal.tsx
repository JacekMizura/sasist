import { useEffect, useMemo, useState } from "react";

import type { ProductCategoryTreeNode } from "../../../api/productCategoriesApi";
import { Dialog, GhostButton, Input, PrimaryButton, Select } from "../../../design-system";
import { flattenCategoryTree } from "../../../modules/productCategories/categoryTreeUtils";
import { pimFieldLabelClass } from "../pimUi";

type Props = {
  open: boolean;
  tree: ProductCategoryTreeNode[];
  /** Pre-selected parent when adding a child. */
  defaultParentId?: number | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; parent_id: number | null }) => Promise<void> | void;
};

/**
 * Quick-create only: name + parent. Full config lives on the category edit page.
 */
export function CategoryFormModal({
  open,
  tree,
  defaultParentId = null,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const flat = useMemo(() => flattenCategoryTree(tree), [tree]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<number | "">("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setParentId(defaultParentId ?? "");
  }, [open, defaultParentId]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nowa kategoria"
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
              })
            }
          >
            {busy ? "Tworzenie…" : "Utwórz"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Szybkie dodanie. Numerację, atrybuty i domyślne ustawienia skonfigurujesz na karcie kategorii.
        </p>
        <div>
          <label className={pimFieldLabelClass}>Nazwa</label>
          <Input
            density="comfortable"
            focusTone="brand"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. Sznurowadła"
            autoFocus
          />
        </div>
        <div>
          <label className={pimFieldLabelClass}>Rodzic</label>
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
            {flat.map((n) => (
              <option key={n.id} value={n.id}>
                {n.path_names.join(" › ")}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Dialog>
  );
}
