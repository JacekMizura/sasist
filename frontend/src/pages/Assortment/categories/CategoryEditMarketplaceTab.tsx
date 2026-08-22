import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import {
  updateProductCategory,
  type ProductCategoryRead,
} from "../../../api/productCategoriesApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import {
  FormField,
  FormHelperText,
  FormSection,
  FORM_FIELD_DENSITY,
  formStackClass,
  Input,
  PrimaryButton,
  Textarea,
} from "../../../design-system";

const CHANNELS = [
  { id: "allegro", label: "Allegro" },
  { id: "empik", label: "Empik" },
  { id: "erli", label: "Erli" },
  { id: "amazon", label: "Amazon" },
] as const;

type ChannelId = (typeof CHANNELS)[number]["id"];

type ChannelMapping = {
  external_id: string;
  path: string;
  notes: string;
};

type MappingState = Record<ChannelId, ChannelMapping>;

const emptyChannel = (): ChannelMapping => ({ external_id: "", path: "", notes: "" });

function parseMapping(raw: unknown): MappingState {
  const base: MappingState = {
    allegro: emptyChannel(),
    empik: emptyChannel(),
    erli: emptyChannel(),
    amazon: emptyChannel(),
  };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const ch of CHANNELS) {
    const v = obj[ch.id];
    if (v && typeof v === "object") {
      const m = v as Record<string, unknown>;
      base[ch.id] = {
        external_id: String(m.external_id ?? ""),
        path: String(m.path ?? ""),
        notes: String(m.notes ?? ""),
      };
    }
  }
  return base;
}

type Props = {
  tenantId: number;
  category: ProductCategoryRead;
  onSaved: (next: ProductCategoryRead) => void;
};

/**
 * Marketplace mapping hooks — architecture only, no sync.
 */
export function CategoryEditMarketplaceTab({ tenantId, category, onSaved }: Props) {
  const [mapping, setMapping] = useState<MappingState>(() =>
    parseMapping(category.marketplace_mapping_json),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMapping(parseMapping(category.marketplace_mapping_json));
  }, [category]);

  const onSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, ChannelMapping> = {};
      for (const ch of CHANNELS) {
        const m = mapping[ch.id];
        if (m.external_id.trim() || m.path.trim() || m.notes.trim()) {
          payload[ch.id] = {
            external_id: m.external_id.trim(),
            path: m.path.trim(),
            notes: m.notes.trim(),
          };
        }
      }
      const updated = await updateProductCategory({
        tenantId,
        categoryId: category.id,
        body: { marketplace_mapping_json: payload },
      });
      onSaved(updated);
      toast.success("Zapisano mapowanie marketplace.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się zapisać mapowania."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`max-w-3xl ${formStackClass}`}>
      <FormHelperText className="mt-0">
        Miejsce na przyszłe mapowanie kategorii. Bez synchronizacji — tylko zapis lokalnej struktury.
      </FormHelperText>

      {CHANNELS.map((ch) => (
        <FormSection key={ch.id} title={ch.label}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="ID zewnętrzne">
              <Input
                value={mapping[ch.id].external_id}
                onChange={(e) =>
                  setMapping((prev) => ({
                    ...prev,
                    [ch.id]: { ...prev[ch.id], external_id: e.target.value },
                  }))
                }
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                className="font-mono text-xs"
              />
            </FormField>
            <FormField label="Ścieżka / kategoria marketplace">
              <Input
                value={mapping[ch.id].path}
                onChange={(e) =>
                  setMapping((prev) => ({
                    ...prev,
                    [ch.id]: { ...prev[ch.id], path: e.target.value },
                  }))
                }
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                placeholder="np. Dom i ogród › …"
              />
            </FormField>
            <FormField label="Notatki" className="sm:col-span-2">
              <Textarea
                value={mapping[ch.id].notes}
                onChange={(e) =>
                  setMapping((prev) => ({
                    ...prev,
                    [ch.id]: { ...prev[ch.id], notes: e.target.value },
                  }))
                }
                rows={2}
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
              />
            </FormField>
          </div>
        </FormSection>
      ))}

      <PrimaryButton type="button" density="compact" disabled={saving} onClick={() => void onSave()}>
        {saving ? "Zapisywanie…" : "Zapisz marketplace"}
      </PrimaryButton>
    </div>
  );
}
