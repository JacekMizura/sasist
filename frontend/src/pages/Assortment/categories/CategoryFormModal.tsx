import { useEffect, useMemo, useState } from "react";

import type { ProductCategoryTreeNode } from "../../../api/productCategoriesApi";
import { Checkbox, Dialog, GhostButton, Input, PrimaryButton, Select, Textarea } from "../../../design-system";
import { flattenCategoryTree } from "../../../modules/productCategories/categoryTreeUtils";

type Mode = "create" | "edit";

const DEFAULT_TPL = "{CODE}-{NNNNN}";

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
    sku_code: string;
    catalog_code: string;
    sku_template: string;
    catalog_template: string;
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
  const [skuCode, setSkuCode] = useState("");
  const [catalogCode, setCatalogCode] = useState("");
  const [skuTemplate, setSkuTemplate] = useState(DEFAULT_TPL);
  const [catalogTemplate, setCatalogTemplate] = useState(DEFAULT_TPL);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setName(initial.name);
      setParentId(initial.parent_id ?? "");
      setDescription(initial.description ?? "");
      setIsActive(initial.is_active);
      setSortOrder(initial.sort_order ?? 0);
      setSkuCode(initial.sku_code ?? "");
      setCatalogCode(initial.catalog_code ?? "");
      setSkuTemplate(initial.sku_template?.trim() || DEFAULT_TPL);
      setCatalogTemplate(initial.catalog_template?.trim() || DEFAULT_TPL);
    } else {
      setName("");
      setParentId(defaultParentId ?? "");
      setDescription("");
      setIsActive(true);
      setSortOrder(0);
      setSkuCode("");
      setCatalogCode("");
      setSkuTemplate(DEFAULT_TPL);
      setCatalogTemplate(DEFAULT_TPL);
    }
  }, [open, mode, initial, defaultParentId]);

  const parentOptions = flat.filter((n) => (mode === "edit" && initial ? n.id !== initial.id : true));

  const skuPreview =
    skuCode.trim() && skuTemplate.includes("{CODE}")
      ? skuTemplate.replace(/\{CODE\}/g, skuCode.trim().toUpperCase()).replace(/\{NNNNN\}/g, "00001")
      : null;
  const catalogPreview =
    catalogCode.trim() && catalogTemplate.includes("{CODE}")
      ? catalogTemplate.replace(/\{CODE\}/g, catalogCode.trim().toUpperCase()).replace(/\{NNNNN\}/g, "00001")
      : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edytuj kategorię" : "Nowa kategoria"}
      size="lg"
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
                sku_code: skuCode.trim().toUpperCase(),
                catalog_code: catalogCode.trim().toUpperCase(),
                sku_template: skuTemplate.trim() || DEFAULT_TPL,
                catalog_template: catalogTemplate.trim() || DEFAULT_TPL,
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
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opcjonalny opis kategorii"
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Numeracja SKU / katalog</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Kod SKU</label>
              <Input
                density="comfortable"
                focusTone="brand"
                value={skuCode}
                onChange={(e) => setSkuCode(e.target.value.toUpperCase())}
                placeholder="np. WAN"
                className="font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Kod numeru katalogowego
              </label>
              <Input
                density="comfortable"
                focusTone="brand"
                value={catalogCode}
                onChange={(e) => setCatalogCode(e.target.value.toUpperCase())}
                placeholder="np. WAN"
                className="font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Szablon SKU</label>
              <Input
                density="comfortable"
                focusTone="brand"
                value={skuTemplate}
                onChange={(e) => setSkuTemplate(e.target.value)}
                placeholder="{CODE}-{NNNNN}"
                className="font-mono text-xs"
              />
              {skuPreview ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Przykład: <span className="font-mono font-medium text-slate-700">{skuPreview}</span>
                </p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Szablon numeru katalogowego
              </label>
              <Input
                density="comfortable"
                focusTone="brand"
                value={catalogTemplate}
                onChange={(e) => setCatalogTemplate(e.target.value)}
                placeholder="{CODE}-{NNNNN}"
                className="font-mono text-xs"
              />
              {catalogPreview ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Przykład: <span className="font-mono font-medium text-slate-700">{catalogPreview}</span>
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Tokeny v1: <code className="font-mono">{"{CODE}"}</code>, <code className="font-mono">{"{NNNNN}"}</code>.
            Numeracja jest osobna dla każdego szablonu/prefiksu.
          </p>
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
