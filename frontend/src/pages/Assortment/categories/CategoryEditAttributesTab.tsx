import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import {
  updateProductCategory,
  type ProductCategoryRead,
} from "../../../api/productCategoriesApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import { Checkbox, GhostButton, Input, PrimaryButton, Select } from "../../../design-system";
import { pimFieldLabelClass, pimHintClass, pimPanelClass } from "../pimUi";

export type CategoryAttrType = "text" | "number" | "list" | "color" | "toggle";

export type CategoryAttributeDef = {
  key: string;
  name: string;
  type: CategoryAttrType;
  required: boolean;
  options?: string[];
};

type Props = {
  tenantId: number;
  category: ProductCategoryRead;
  onSaved: (next: ProductCategoryRead) => void;
};

function newKey() {
  return `attr_${Math.random().toString(36).slice(2, 9)}`;
}

function parseSchema(raw: unknown): CategoryAttributeDef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const type = (["text", "number", "list", "color", "toggle"].includes(String(o.type))
        ? o.type
        : "text") as CategoryAttrType;
      return {
        key: String(o.key || newKey()),
        name: String(o.name || ""),
        type,
        required: Boolean(o.required),
        options: Array.isArray(o.options) ? o.options.map((x) => String(x)) : undefined,
      } satisfies CategoryAttributeDef;
    })
    .filter(Boolean) as CategoryAttributeDef[];
}

/**
 * Category attribute schema editor — stored in attributes_schema_json (no product validation yet).
 */
export function CategoryEditAttributesTab({ tenantId, category, onSaved }: Props) {
  const [attrs, setAttrs] = useState<CategoryAttributeDef[]>(() =>
    parseSchema(category.attributes_schema_json),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAttrs(parseSchema(category.attributes_schema_json));
  }, [category]);

  const onSave = async () => {
    setSaving(true);
    try {
      const payload = attrs
        .filter((a) => a.name.trim())
        .map((a) => ({
          key: a.key,
          name: a.name.trim(),
          type: a.type,
          required: a.required,
          options:
            a.type === "list"
              ? (a.options || []).map((x) => x.trim()).filter(Boolean)
              : undefined,
        }));
      const updated = await updateProductCategory({
        tenantId,
        categoryId: category.id,
        body: { attributes_schema_json: payload },
      });
      onSaved(updated);
      toast.success("Zapisano atrybuty kategorii.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się zapisać atrybutów."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <section className={pimPanelClass}>
        <h2 className="text-sm font-semibold text-slate-900">Atrybuty kategorii</h2>
        <p className={pimHintClass}>
          Schemat pól pod przyszłe formularze produktów. Walidacja na karcie produktu — później.
        </p>

        <ul className="mt-4 space-y-3">
          {attrs.map((a, idx) => (
            <li key={a.key} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <label className={pimFieldLabelClass}>Nazwa pola</label>
                  <Input
                    value={a.name}
                    onChange={(e) =>
                      setAttrs((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    density="comfortable"
                    focusTone="brand"
                    placeholder="np. Długość"
                  />
                </div>
                <div>
                  <label className={pimFieldLabelClass}>Typ</label>
                  <Select
                    value={a.type}
                    onChange={(e) =>
                      setAttrs((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, type: e.target.value as CategoryAttrType } : x,
                        ),
                      )
                    }
                    density="comfortable"
                    focusTone="brand"
                    className="bg-white"
                  >
                    <option value="text">Tekst</option>
                    <option value="number">Liczba</option>
                    <option value="list">Lista</option>
                    <option value="color">Kolor</option>
                    <option value="toggle">Przełącznik</option>
                  </Select>
                </div>
                <div className="flex items-end justify-between gap-2 pb-1">
                  <label className="flex items-center gap-2 text-sm text-slate-800">
                    <Checkbox
                      checked={a.required}
                      onChange={(e) =>
                        setAttrs((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, required: e.target.checked } : x)),
                        )
                      }
                    />
                    Wymagane
                  </label>
                  <GhostButton
                    type="button"
                    density="compact"
                    onClick={() => setAttrs((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </GhostButton>
                </div>
              </div>
              {a.type === "list" ? (
                <div className="mt-2">
                  <label className={pimFieldLabelClass}>Opcje (przecinek)</label>
                  <Input
                    value={(a.options || []).join(", ")}
                    onChange={(e) =>
                      setAttrs((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? {
                                ...x,
                                options: e.target.value.split(",").map((s) => s.trim()),
                              }
                            : x,
                        ),
                      )
                    }
                    density="comfortable"
                    focusTone="brand"
                    placeholder="Czerwony, Niebieski, Zielony"
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        <GhostButton
          type="button"
          density="compact"
          className="mt-3"
          onClick={() =>
            setAttrs((prev) => [
              ...prev,
              { key: newKey(), name: "", type: "text", required: false },
            ])
          }
        >
          <Plus className="mr-1 h-4 w-4" strokeWidth={2.5} aria-hidden />
          Dodaj pole
        </GhostButton>
      </section>

      <PrimaryButton type="button" density="compact" disabled={saving} onClick={() => void onSave()}>
        {saving ? "Zapisywanie…" : "Zapisz atrybuty"}
      </PrimaryButton>
    </div>
  );
}
