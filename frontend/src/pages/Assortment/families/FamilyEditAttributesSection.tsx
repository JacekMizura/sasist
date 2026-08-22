import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import type { FamilyDisplayType } from "../../../api/productFamiliesApi";
import {
  Checkbox,
  FormSection,
  FORM_FIELD_DENSITY,
  IconButton,
  Input,
  SecondaryButton,
  Select,
} from "../../../design-system";
import {
  displayTypeLabel,
  emptyAttr,
  emptyValue,
  type DraftAttr,
} from "./familyEditDraft";

type Props = {
  attributes: DraftAttr[];
  setAttributes: React.Dispatch<React.SetStateAction<DraftAttr[]>>;
};

/**
 * Family dashboard — each attribute as its own card with value chips.
 */
export function FamilyEditAttributesSection({ attributes, setAttributes }: Props) {
  const moveAttr = (index: number, dir: -1 | 1) => {
    setAttributes((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next;
    });
  };

  const moveValue = (attrIndex: number, valueIndex: number, dir: -1 | 1) => {
    setAttributes((prev) =>
      prev.map((ax, ai) => {
        if (ai !== attrIndex) return ax;
        const values = [...ax.values];
        const j = valueIndex + dir;
        if (j < 0 || j >= values.length) return ax;
        const tmp = values[valueIndex]!;
        values[valueIndex] = values[j]!;
        values[j] = tmp;
        return { ...ax, values };
      }),
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Cechy rodziny</h2>
          <p className="mt-0.5 text-xs text-slate-500">Każda cecha to osobna karta z listą wartości.</p>
        </div>
        <SecondaryButton type="button" density="compact" onClick={() => setAttributes((p) => [...p, emptyAttr()])}>
          <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} aria-hidden />
          Dodaj cechę
        </SecondaryButton>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {attributes.map((ax, ai) => (
          <FormSection key={ax.key} className="flex flex-col">
            <div className="flex flex-wrap items-start gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Nazwa cechy</span>
                <Input
                  value={ax.name}
                  onChange={(e) =>
                    setAttributes((prev) => prev.map((x, i) => (i === ai ? { ...x, name: e.target.value } : x)))
                  }
                  placeholder="Nazwa cechy (np. Rozmiar)"
                  density={FORM_FIELD_DENSITY}
                  focusTone="brand"
                  className="font-semibold"
                />
              </label>
              <div className="flex gap-1 pt-1">
                <IconButton
                  type="button"
                  density="compact"
                  title="Wyżej"
                  aria-label="Przenieś cechę wyżej"
                  onClick={() => moveAttr(ai, -1)}
                >
                  <ArrowUp className="h-4 w-4" strokeWidth={2} aria-hidden />
                </IconButton>
                <IconButton
                  type="button"
                  density="compact"
                  title="Niżej"
                  aria-label="Przenieś cechę niżej"
                  onClick={() => moveAttr(ai, 1)}
                >
                  <ArrowDown className="h-4 w-4" strokeWidth={2} aria-hidden />
                </IconButton>
                <IconButton
                  type="button"
                  density="compact"
                  tone="danger"
                  title="Usuń cechę"
                  aria-label="Usuń cechę"
                  onClick={() =>
                    setAttributes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== ai)))
                  }
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                </IconButton>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Typ</span>
                <Select
                  value={ax.display_type}
                  onChange={(e) =>
                    setAttributes((prev) =>
                      prev.map((x, i) =>
                        i === ai ? { ...x, display_type: e.target.value as FamilyDisplayType } : x,
                      ),
                    )
                  }
                  density="compact"
                  className="bg-white"
                >
                  <option value="text">Tekst</option>
                  <option value="color">Kolor</option>
                  <option value="image">Grafika</option>
                </Select>
              </label>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {displayTypeLabel(ax.display_type)}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
              <label className="inline-flex items-center gap-1.5">
                <Checkbox
                  checked={ax.show_in_filters}
                  onChange={(e) =>
                    setAttributes((prev) =>
                      prev.map((x, i) => (i === ai ? { ...x, show_in_filters: e.target.checked } : x)),
                    )
                  }
                />
                W filtrach
              </label>
              <label className="inline-flex items-center gap-1.5">
                <Checkbox
                  checked={ax.sort_alpha}
                  onChange={(e) =>
                    setAttributes((prev) =>
                      prev.map((x, i) => (i === ai ? { ...x, sort_alpha: e.target.checked } : x)),
                    )
                  }
                />
                Sort. alfabetycznie
              </label>
            </div>

            <ul className="mt-4 flex-1 space-y-1.5">
              {ax.values.map((v, vi) => (
                <li
                  key={v.key}
                  className="group flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5"
                >
                  {ax.display_type === "color" ? (
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-200"
                      style={{ backgroundColor: v.color_hex.trim() || "#cbd5e1" }}
                      aria-hidden
                    />
                  ) : (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
                  )}
                  <Input
                    className="min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus:ring-0"
                    value={v.name}
                    onChange={(e) =>
                      setAttributes((prev) =>
                        prev.map((x, i) =>
                          i !== ai
                            ? x
                            : {
                                ...x,
                                values: x.values.map((vv, j) =>
                                  j === vi ? { ...vv, name: e.target.value } : vv,
                                ),
                              },
                        ),
                      )
                    }
                    placeholder="Wartość"
                    density="compact"
                  />
                  {ax.display_type === "color" ? (
                    <Input
                      className="w-24 font-mono text-xs"
                      value={v.color_hex}
                      onChange={(e) =>
                        setAttributes((prev) =>
                          prev.map((x, i) =>
                            i !== ai
                              ? x
                              : {
                                  ...x,
                                  values: x.values.map((vv, j) =>
                                    j === vi ? { ...vv, color_hex: e.target.value } : vv,
                                  ),
                                },
                          ),
                        )
                      }
                      placeholder="#hex"
                      density="compact"
                    />
                  ) : null}
                  <div className="flex shrink-0 opacity-60 transition group-hover:opacity-100">
                    <IconButton
                      type="button"
                      density="compact"
                      title="Wyżej"
                      aria-label="Przenieś wartość wyżej"
                      onClick={() => moveValue(ai, vi, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </IconButton>
                    <IconButton
                      type="button"
                      density="compact"
                      title="Niżej"
                      aria-label="Przenieś wartość niżej"
                      onClick={() => moveValue(ai, vi, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </IconButton>
                    <IconButton
                      type="button"
                      density="compact"
                      tone="danger"
                      title="Usuń wartość"
                      aria-label="Usuń wartość"
                      onClick={() =>
                        setAttributes((prev) =>
                          prev.map((x, i) =>
                            i !== ai
                              ? x
                              : {
                                  ...x,
                                  values: x.values.length <= 1 ? x.values : x.values.filter((_, j) => j !== vi),
                                },
                          ),
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>

            <SecondaryButton
              type="button"
              density="compact"
              className="mt-3 self-start"
              onClick={() =>
                setAttributes((prev) =>
                  prev.map((x, i) => (i === ai ? { ...x, values: [...x.values, emptyValue()] } : x)),
                )
              }
            >
              <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} aria-hidden />
              Dodaj wartość
            </SecondaryButton>
          </FormSection>
        ))}
      </div>
    </section>
  );
}
