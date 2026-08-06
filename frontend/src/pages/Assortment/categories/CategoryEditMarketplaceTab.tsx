import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import {
  updateProductCategory,
  type ProductCategoryRead,
} from "../../../api/productCategoriesApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import { Input, PrimaryButton, Textarea } from "../../../design-system";
import { pimFieldLabelClass, pimHintClass, pimPanelClass } from "../pimUi";

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
    <div className="max-w-3xl space-y-4">
      <section className={pimPanelClass}>
        <h2 className="text-sm font-semibold text-slate-900">Marketplace</h2>
        <p className={pimHintClass}>
          Miejsce na przyszłe mapowanie kategorii. Bez synchronizacji — tylko zapis lokalnej struktury.
        </p>
      </section>

      {CHANNELS.map((ch) => (
        <section key={ch.id} className={pimPanelClass}>
          <h3 className="text-sm font-semibold text-slate-900">{ch.label}</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={pimFieldLabelClass}>ID zewnętrzne</label>
              <Input
                value={mapping[ch.id].external_id}
                onChange={(e) =>
                  setMapping((prev) => ({
                    ...prev,
                    [ch.id]: { ...prev[ch.id], external_id: e.target.value },
                  }))
                }
                density="comfortable"
                focusTone="brand"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label className={pimFieldLabelClass}>Ścieżka / kategoria marketplace</label>
              <Input
                value={mapping[ch.id].path}
                onChange={(e) =>
                  setMapping((prev) => ({
                    ...prev,
                    [ch.id]: { ...prev[ch.id], path: e.target.value },
                  }))
                }
                density="comfortable"
                focusTone="brand"
                placeholder="np. Dom i ogród › …"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={pimFieldLabelClass}>Notatki</label>
              <Textarea
                value={mapping[ch.id].notes}
                onChange={(e) =>
                  setMapping((prev) => ({
                    ...prev,
                    [ch.id]: { ...prev[ch.id], notes: e.target.value },
                  }))
                }
                rows={2}
                density="comfortable"
                focusTone="brand"
              />
            </div>
          </div>
        </section>
      ))}

      <PrimaryButton type="button" density="compact" disabled={saving} onClick={() => void onSave()}>
        {saving ? "Zapisywanie…" : "Zapisz marketplace"}
      </PrimaryButton>
    </div>
  );
}
