import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  fetchCategoryTree,
  updateProductCategory,
  type ProductCategoryRead,
  type ProductCategoryTreeNode,
} from "../../../api/productCategoriesApi";
import { listManufacturers } from "../../../api/manufacturersApi";
import { listSuppliers } from "../../../api/inboundSuppliersApi";
import api from "../../../api/axios";
import { extractApiErrorMessage } from "../../../api/authApi";
import { warehouseService } from "../../../services/warehouseService";
import {
  Checkbox,
  FormField,
  FormSection,
  FORM_FIELD_DENSITY,
  formStackClass,
  Input,
  PrimaryButton,
  Select,
  Textarea,
} from "../../../design-system";
import { flattenCategoryTree } from "../../../modules/productCategories/categoryTreeUtils";

type Props = {
  tenantId: number;
  category: ProductCategoryRead;
  onSaved: (next: ProductCategoryRead) => void;
};

type LabelTpl = { id: number; name?: string };

/**
 * Basics + product default settings (stored only — no inheritance yet).
 */
export function CategoryEditBasicTab({ tenantId, category, onSaved }: Props) {
  const [tree, setTree] = useState<ProductCategoryTreeNode[]>([]);
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? "");
  const [parentId, setParentId] = useState<number | "">(category.parent_id ?? "");
  const [isActive, setIsActive] = useState(category.is_active);
  const [sortOrder, setSortOrder] = useState(category.sort_order ?? 0);
  const [unit, setUnit] = useState(category.default_unit ?? "");
  const [vat, setVat] = useState(category.default_vat_rate != null ? String(category.default_vat_rate) : "");
  const [manufacturerId, setManufacturerId] = useState<number | "">(category.default_manufacturer_id ?? "");
  const [labelTemplateId, setLabelTemplateId] = useState<number | "">(category.default_label_template_id ?? "");
  const [warehouseId, setWarehouseId] = useState<number | "">(category.default_warehouse_id ?? "");
  const [supplierId, setSupplierId] = useState<number | "">(category.default_supplier_id ?? "");
  const [manufacturers, setManufacturers] = useState<{ id: number; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [labels, setLabels] = useState<LabelTpl[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(category.name);
    setDescription(category.description ?? "");
    setParentId(category.parent_id ?? "");
    setIsActive(category.is_active);
    setSortOrder(category.sort_order ?? 0);
    setUnit(category.default_unit ?? "");
    setVat(category.default_vat_rate != null ? String(category.default_vat_rate) : "");
    setManufacturerId(category.default_manufacturer_id ?? "");
    setLabelTemplateId(category.default_label_template_id ?? "");
    setWarehouseId(category.default_warehouse_id ?? "");
    setSupplierId(category.default_supplier_id ?? "");
  }, [category]);

  useEffect(() => {
    void fetchCategoryTree({ tenantId, includeInactive: true }).then(setTree).catch(() => setTree([]));
    void listManufacturers({ tenantId })
      .then((rows) => setManufacturers(rows.map((m) => ({ id: m.id, name: m.name || `#${m.id}` }))))
      .catch(() => setManufacturers([]));
    void listSuppliers(tenantId, { status: "all" })
      .then((rows) => setSuppliers(rows.map((s) => ({ id: s.id, name: s.name || `#${s.id}` }))))
      .catch(() => setSuppliers([]));
    void warehouseService
      .getAllWarehouses()
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setWarehouses(rows.map((w: { id: number; name?: string }) => ({ id: w.id, name: w.name || `#${w.id}` })));
      })
      .catch(() => setWarehouses([]));
    void api
      .get<LabelTpl[]>("/label-templates/", { params: { tenant_id: tenantId } })
      .then((res) => setLabels(Array.isArray(res.data) ? res.data : []))
      .catch(() => setLabels([]));
  }, [tenantId]);

  const parentOptions = useMemo(
    () => flattenCategoryTree(tree).filter((n) => n.id !== category.id),
    [tree, category.id],
  );

  const onSave = async () => {
    if (!name.trim()) {
      toast.error("Podaj nazwę kategorii.");
      return;
    }
    setSaving(true);
    try {
      const vatNum = vat.trim() === "" ? null : Number(vat);
      const updated = await updateProductCategory({
        tenantId,
        categoryId: category.id,
        body: {
          name: name.trim(),
          description: description.trim() || null,
          parent_id: parentId === "" ? null : Number(parentId),
          clear_parent: parentId === "",
          is_active: isActive,
          sort_order: sortOrder,
          default_unit: unit.trim() || null,
          default_vat_rate: vatNum != null && Number.isFinite(vatNum) ? vatNum : null,
          clear_default_vat_rate: vat.trim() === "",
          default_manufacturer_id: manufacturerId === "" ? null : Number(manufacturerId),
          clear_default_manufacturer_id: manufacturerId === "",
          default_label_template_id: labelTemplateId === "" ? null : Number(labelTemplateId),
          clear_default_label_template_id: labelTemplateId === "",
          default_warehouse_id: warehouseId === "" ? null : Number(warehouseId),
          default_supplier_id: supplierId === "" ? null : Number(supplierId),
        },
      });
      onSaved(updated);
      toast.success("Zapisano podstawowe dane kategorii.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się zapisać."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`max-w-3xl ${formStackClass}`}>
      <FormSection title="Podstawowe">
        <div className={formStackClass}>
          <FormField label="Nazwa">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
            />
          </FormField>
          <FormField label="Opis">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
            />
          </FormField>
          <FormField label="Rodzic">
            <Select
              value={parentId}
              onChange={(e) => setParentId(e.target.value === "" ? "" : Number(e.target.value))}
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
            >
              <option value="">— Kategoria główna (korzeń) —</option>
              {parentOptions.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.path_names.join(" › ")}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Kolejność">
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number.parseInt(e.target.value, 10) || 0)}
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
              />
            </FormField>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Aktywna
              </label>
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Domyślne ustawienia produktu"
        description="Zapisane na kategorii. Dziedziczenie na nowe produkty — w kolejnym etapie."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Jednostka">
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="np. szt"
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
            />
          </FormField>
          <FormField label="VAT %">
            <Input
              value={vat}
              onChange={(e) => setVat(e.target.value)}
              placeholder="np. 23"
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
            />
          </FormField>
          <FormField label="Producent">
            <Select
              value={manufacturerId}
              onChange={(e) => setManufacturerId(e.target.value === "" ? "" : Number(e.target.value))}
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
            >
              <option value="">— Brak —</option>
              {manufacturers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Szablon etykiety">
            <Select
              value={labelTemplateId}
              onChange={(e) => setLabelTemplateId(e.target.value === "" ? "" : Number(e.target.value))}
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
            >
              <option value="">— Brak —</option>
              {labels.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || `Szablon #${t.id}`}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Domyślny magazyn">
            <Select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value === "" ? "" : Number(e.target.value))}
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
            >
              <option value="">— Brak —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Domyślny dostawca">
            <Select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value === "" ? "" : Number(e.target.value))}
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
            >
              <option value="">— Brak —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </FormSection>

      <PrimaryButton type="button" density="compact" disabled={saving} onClick={() => void onSave()}>
        {saving ? "Zapisywanie…" : "Zapisz podstawowe"}
      </PrimaryButton>
    </div>
  );
}
