import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { fetchTenantsList } from "../../../api/tenantsApi";
import {
  createVariantGroup,
  getVariantGroup,
  updateVariantGroup,
  deleteVariantGroup,
  type VariantAxis,
  type VariantDisplayType,
  type VariantValue,
} from "../../../api/productVariantsApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import { ListPageHeader } from "../../../components/listPage/ListPageHeader";
import PageLayout from "../../../components/layout/PageLayout";
import { Checkbox, GhostButton, Input, PrimaryButton, Select } from "../../../design-system";
import { UI_STRINGS } from "../../../constants/uiStrings";

type DraftAxis = {
  key: string;
  id?: number;
  name: string;
  display_type: VariantDisplayType;
  show_in_filters: boolean;
  sort_alpha: boolean;
  values: DraftValue[];
};

type DraftValue = {
  key: string;
  id?: number;
  name: string;
  color_hex: string;
};

function newKey() {
  return `k-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyValue(): DraftValue {
  return { key: newKey(), name: "", color_hex: "" };
}

function emptyAxis(): DraftAxis {
  return {
    key: newKey(),
    name: "",
    display_type: "text",
    show_in_filters: false,
    sort_alpha: false,
    values: [emptyValue()],
  };
}

function fromApiAxes(axes: VariantAxis[]): DraftAxis[] {
  if (!axes.length) return [emptyAxis()];
  return axes.map((ax) => ({
    key: `a-${ax.id ?? newKey()}`,
    id: ax.id,
    name: ax.name,
    display_type: (ax.display_type as VariantDisplayType) || "text",
    show_in_filters: !!ax.show_in_filters,
    sort_alpha: !!ax.sort_alpha,
    values: (ax.values?.length ? ax.values : [{ name: "" } as VariantValue]).map((v) => ({
      key: `v-${v.id ?? newKey()}`,
      id: v.id,
      name: v.name || "",
      color_hex: v.color_hex || "",
    })),
  }));
}

/**
 * Edycja grupy wariantów — osie jako karty, wartości jako czytelna lista (nie gęsta tabela Sellasist).
 */
export default function VariantGroupEditPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const isNew = !groupId || groupId === "new";
  const numericId = !isNew ? Number(groupId) : null;

  const [tenantId, setTenantId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [axes, setAxes] = useState<DraftAxis[]>([emptyAxis()]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchTenantsList()
      .then((list) => setTenantId(list[0]?.id ?? null))
      .catch(() => setTenantId(null));
  }, []);

  useEffect(() => {
    if (tenantId == null || isNew || numericId == null || !Number.isFinite(numericId)) return;
    setLoading(true);
    void getVariantGroup(tenantId, numericId)
      .then((g) => {
        setName(g.name);
        setIsActive(g.is_active);
        setAxes(fromApiAxes(g.axes));
      })
      .catch((e) => {
        toast.error(extractApiErrorMessage(e, "Nie udało się wczytać grupy."));
        navigate("/variants");
      })
      .finally(() => setLoading(false));
  }, [tenantId, isNew, numericId, navigate]);

  const toPayload = useCallback(() => {
    return {
      name: name.trim(),
      is_active: isActive,
      axes: axes
        .map((ax, ai) => ({
          id: ax.id,
          name: ax.name.trim(),
          sort_order: ai,
          display_type: ax.display_type,
          show_in_filters: ax.show_in_filters,
          sort_alpha: ax.sort_alpha,
          values: ax.values
            .map((v, vi) => ({
              id: v.id,
              name: v.name.trim(),
              sort_order: vi,
              color_hex: ax.display_type === "color" ? v.color_hex.trim() || null : null,
              image_url: null as string | null,
            }))
            .filter((v) => v.name),
        }))
        .filter((ax) => ax.name),
    };
  }, [name, isActive, axes]);

  const onSave = async () => {
    if (tenantId == null) return;
    const payload = toPayload();
    if (!payload.name) {
      toast.error("Podaj nazwę grupy.");
      return;
    }
    if (!payload.axes.length) {
      toast.error("Dodaj co najmniej jedną oś (np. Kolor lub Rozmiar).");
      return;
    }
    for (const ax of payload.axes) {
      if (!ax.values.length) {
        toast.error(`Oś „${ax.name}” potrzebuje co najmniej jednej wartości.`);
        return;
      }
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createVariantGroup(tenantId, payload);
        toast.success("Utworzono grupę wariantów.");
        navigate(`/variants/${created.id}/edit`, { replace: true });
      } else if (numericId != null) {
        await updateVariantGroup(tenantId, numericId, payload);
        toast.success("Zapisano grupę wariantów.");
      }
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Zapis nie powiódł się."));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (tenantId == null || numericId == null) return;
    if (!window.confirm(`Usunąć grupę „${name || "bez nazwy"}”?`)) return;
    try {
      await deleteVariantGroup(tenantId, numericId);
      toast.success("Usunięto.");
      navigate("/variants");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Usuwanie nie powiodło się."));
    }
  };

  const moveAxis = (index: number, dir: -1 | 1) => {
    setAxes((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next;
    });
  };

  const moveValue = (axisIndex: number, valueIndex: number, dir: -1 | 1) => {
    setAxes((prev) =>
      prev.map((ax, ai) => {
        if (ai !== axisIndex) return ax;
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

  if (loading) {
    return (
      <PageLayout>
        <p className="text-sm text-slate-500">Ładowanie…</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <ListPageHeader
        title={isNew ? "Nowa grupa wariantów" : `Edycja: ${name || "—"}`}
        description="Oś = wymiar (Kolor, Rozmiar). Wartości = konkretne opcje. Na produkcie powstaje iloczyn kombinacji."
        breadcrumbs={[
          { label: UI_STRINGS.navigation.assortment },
          { label: UI_STRINGS.navigation.variants, to: "/variants" },
          { label: isNew ? "Nowa" : "Edycja" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            {!isNew ? (
              <GhostButton type="button" density="compact" onClick={() => void onDelete()}>
                Usuń
              </GhostButton>
            ) : null}
            <PrimaryButton type="button" density="compact" disabled={saving} onClick={() => void onSave()}>
              {saving ? "Zapisywanie…" : "Zapisz"}
            </PrimaryButton>
          </div>
        }
      />

      <section className="mt-6 max-w-3xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Nazwa grupy</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Bluzy, Sznurowadła, Coca cola" />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Grupa aktywna
        </label>
      </section>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">Osie wariantów</h2>
        <GhostButton type="button" density="compact" onClick={() => setAxes((p) => [...p, emptyAxis()])}>
          <Plus className="mr-1 h-4 w-4" strokeWidth={2.5} aria-hidden />
          Dodaj oś
        </GhostButton>
      </div>

      <div className="mt-3 space-y-4">
        {axes.map((ax, ai) => (
          <section key={ax.key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start gap-3">
              <label className="min-w-[200px] flex-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Nazwa osi</span>
                <Input
                  value={ax.name}
                  onChange={(e) =>
                    setAxes((prev) => prev.map((x, i) => (i === ai ? { ...x, name: e.target.value } : x)))
                  }
                  placeholder="np. Rozmiar, Kolor, Długość"
                />
              </label>
              <label className="w-40">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Typ</span>
                <Select
                  value={ax.display_type}
                  onChange={(e) =>
                    setAxes((prev) =>
                      prev.map((x, i) =>
                        i === ai ? { ...x, display_type: e.target.value as VariantDisplayType } : x,
                      ),
                    )
                  }
                >
                  <option value="text">Tekstowy</option>
                  <option value="color">Kolor</option>
                  <option value="image">Graficzny</option>
                </Select>
              </label>
              <div className="flex gap-1 pt-5">
                <GhostButton type="button" density="compact" title="Wyżej" onClick={() => moveAxis(ai, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </GhostButton>
                <GhostButton type="button" density="compact" title="Niżej" onClick={() => moveAxis(ai, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </GhostButton>
                <GhostButton
                  type="button"
                  density="compact"
                  title="Usuń oś"
                  onClick={() => setAxes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== ai)))}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </GhostButton>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-700">
              <label className="inline-flex items-center gap-2">
                <Checkbox
                  checked={ax.show_in_filters}
                  onChange={(e) =>
                    setAxes((prev) =>
                      prev.map((x, i) => (i === ai ? { ...x, show_in_filters: e.target.checked } : x)),
                    )
                  }
                />
                Pokaż w filtrach
              </label>
              <label className="inline-flex items-center gap-2">
                <Checkbox
                  checked={ax.sort_alpha}
                  onChange={(e) =>
                    setAxes((prev) => prev.map((x, i) => (i === ai ? { ...x, sort_alpha: e.target.checked } : x)))
                  }
                />
                Sortuj alfabetycznie
              </label>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Wartości</p>
              <ul className="space-y-2">
                {ax.values.map((v, vi) => (
                  <li key={v.key} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="min-w-[160px] flex-1"
                      value={v.name}
                      onChange={(e) =>
                        setAxes((prev) =>
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
                      placeholder="np. S, M, L albo Czerwony"
                    />
                    {ax.display_type === "color" ? (
                      <Input
                        className="w-28"
                        value={v.color_hex}
                        onChange={(e) =>
                          setAxes((prev) =>
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
                        placeholder="#RRGGBB"
                      />
                    ) : null}
                    <GhostButton type="button" density="compact" onClick={() => moveValue(ai, vi, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </GhostButton>
                    <GhostButton type="button" density="compact" onClick={() => moveValue(ai, vi, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </GhostButton>
                    <GhostButton
                      type="button"
                      density="compact"
                      onClick={() =>
                        setAxes((prev) =>
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
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </GhostButton>
                  </li>
                ))}
              </ul>
              <GhostButton
                type="button"
                density="compact"
                className="mt-2"
                onClick={() =>
                  setAxes((prev) =>
                    prev.map((x, i) => (i === ai ? { ...x, values: [...x.values, emptyValue()] } : x)),
                  )
                }
              >
                <Plus className="mr-1 h-4 w-4" strokeWidth={2.5} aria-hidden />
                Dodaj wartość
              </GhostButton>
            </div>
          </section>
        ))}
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Po zapisaniu przypisz grupę na karcie produktu → zakładka <strong>Warianty</strong>.{" "}
        <Link to="/variants" className="text-blue-700 hover:underline">
          Wróć do listy
        </Link>
      </p>
    </PageLayout>
  );
}
