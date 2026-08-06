import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { fetchTenantsList } from "../../../api/tenantsApi";
import {
  createProductFamily,
  deleteProductFamily,
  getProductFamily,
  updateProductFamily,
  type FamilyAttribute,
  type FamilyDisplayType,
  type FamilyAttributeValue,
  type ProductFamilyMember,
} from "../../../api/productFamiliesApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import { ListPageHeader } from "../../../components/listPage/ListPageHeader";
import PageLayout from "../../../components/layout/PageLayout";
import { Checkbox, GhostButton, Input, PrimaryButton, Select } from "../../../design-system";
import { UI_STRINGS } from "../../../constants/uiStrings";

type DraftAttr = {
  key: string;
  id?: number;
  name: string;
  display_type: FamilyDisplayType;
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

function emptyAttr(): DraftAttr {
  return {
    key: newKey(),
    name: "",
    display_type: "text",
    show_in_filters: false,
    sort_alpha: false,
    values: [emptyValue()],
  };
}

function fromApiAttributes(attrs: FamilyAttribute[]): DraftAttr[] {
  if (!attrs.length) return [emptyAttr()];
  return attrs.map((ax) => ({
    key: `a-${ax.id ?? newKey()}`,
    id: ax.id,
    name: ax.name,
    display_type: (ax.display_type as FamilyDisplayType) || "text",
    show_in_filters: !!ax.show_in_filters,
    sort_alpha: !!ax.sort_alpha,
    values: (ax.values?.length ? ax.values : [{ name: "" } as FamilyAttributeValue]).map((v) => ({
      key: `v-${v.id ?? newKey()}`,
      id: v.id,
      name: v.name || "",
      color_hex: v.color_hex || "",
    })),
  }));
}

export default function ProductFamilyEditPage() {
  const { familyId } = useParams();
  const navigate = useNavigate();
  const isNew = !familyId || familyId === "new";
  const numericId = !isNew ? Number(familyId) : null;

  const [tenantId, setTenantId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [baseProductId, setBaseProductId] = useState("");
  const [baseProductName, setBaseProductName] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<DraftAttr[]>([emptyAttr()]);
  const [members, setMembers] = useState<ProductFamilyMember[]>([]);
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
    void getProductFamily(tenantId, numericId)
      .then((g) => {
        setName(g.name);
        setIsActive(g.is_active);
        setBaseProductId(g.base_product_id != null ? String(g.base_product_id) : "");
        setBaseProductName(g.base_product_name ?? null);
        setAttributes(fromApiAttributes(g.attributes));
        setMembers(g.members ?? []);
      })
      .catch((e) => {
        toast.error(extractApiErrorMessage(e, "Nie udało się wczytać rodziny."));
        navigate("/product-families");
      })
      .finally(() => setLoading(false));
  }, [tenantId, isNew, numericId, navigate]);

  const toPayload = useCallback(() => {
    const trimmedBase = baseProductId.trim();
    const parsedBase = trimmedBase ? Number(trimmedBase) : null;
    return {
      name: name.trim(),
      is_active: isActive,
      base_product_id: parsedBase != null && Number.isFinite(parsedBase) ? parsedBase : null,
      attributes: attributes
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
  }, [name, isActive, baseProductId, attributes]);

  const onSave = async () => {
    if (tenantId == null) return;
    const payload = toPayload();
    if (!payload.name) {
      toast.error("Podaj nazwę rodziny.");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createProductFamily(tenantId, payload);
        toast.success("Utworzono rodzinę produktów.");
        navigate(`/product-families/${created.id}/edit`, { replace: true });
      } else if (numericId != null) {
        const updated = await updateProductFamily(tenantId, numericId, payload);
        setBaseProductName(updated.base_product_name ?? null);
        setMembers(updated.members ?? []);
        toast.success("Zapisano rodzinę produktów.");
      }
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Zapis nie powiódł się."));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (tenantId == null || numericId == null) return;
    if (!window.confirm(`Usunąć rodzinę „${name || "bez nazwy"}”?`)) return;
    try {
      await deleteProductFamily(tenantId, numericId);
      toast.success("Usunięto.");
      navigate("/product-families");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Usuwanie nie powiodło się."));
    }
  };

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
        title={isNew ? "Nowa rodzina produktów" : `Edycja: ${name || "—"}`}
        description="Cecha = wymiar (Kolor, Rozmiar). Produkt bazowy to tylko źródło kopiowania dla generatora — bez live inheritance."
        breadcrumbs={[
          { label: UI_STRINGS.navigation.assortment },
          { label: UI_STRINGS.navigation.productFamilies, to: "/product-families" },
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
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Nazwa rodziny</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Sznurowadła CAT" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Produkt bazowy (ID, opcjonalnie)
          </span>
          <Input
            value={baseProductId}
            onChange={(e) => setBaseProductId(e.target.value)}
            placeholder="ID produktu źródłowego do kopiowania"
            inputMode="numeric"
          />
          {baseProductName ? (
            <p className="mt-1 text-xs text-slate-500">Aktualnie: {baseProductName}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">
              Nie parent/master — wyłącznie źródło danych dla kreatora produktów.
            </p>
          )}
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Rodzina aktywna
        </label>
      </section>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">Cechy rodziny</h2>
        <GhostButton type="button" density="compact" onClick={() => setAttributes((p) => [...p, emptyAttr()])}>
          <Plus className="mr-1 h-4 w-4" strokeWidth={2.5} aria-hidden />
          Dodaj cechę
        </GhostButton>
      </div>

      <div className="mt-3 space-y-4">
        {attributes.map((ax, ai) => (
          <section key={ax.key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start gap-3">
              <label className="min-w-[200px] flex-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Nazwa cechy</span>
                <Input
                  value={ax.name}
                  onChange={(e) =>
                    setAttributes((prev) => prev.map((x, i) => (i === ai ? { ...x, name: e.target.value } : x)))
                  }
                  placeholder="np. Rozmiar, Kolor, Długość"
                />
              </label>
              <label className="w-40">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Typ</span>
                <Select
                  value={ax.display_type}
                  onChange={(e) =>
                    setAttributes((prev) =>
                      prev.map((x, i) =>
                        i === ai ? { ...x, display_type: e.target.value as FamilyDisplayType } : x,
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
                <GhostButton type="button" density="compact" title="Wyżej" onClick={() => moveAttr(ai, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </GhostButton>
                <GhostButton type="button" density="compact" title="Niżej" onClick={() => moveAttr(ai, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </GhostButton>
                <GhostButton
                  type="button"
                  density="compact"
                  title="Usuń cechę"
                  onClick={() =>
                    setAttributes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== ai)))
                  }
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
                    setAttributes((prev) =>
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
                    setAttributes((prev) =>
                      prev.map((x, i) => (i === ai ? { ...x, sort_alpha: e.target.checked } : x)),
                    )
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
                      placeholder="np. 90 cm, Czerwony"
                    />
                    {ax.display_type === "color" ? (
                      <Input
                        className="w-28"
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
                  setAttributes((prev) =>
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

      {!isNew && members.length > 0 ? (
        <section className="mt-8 max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Produkty w rodzinie ({members.length})</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <Link to={`/products/list?productId=${m.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                    {m.name}
                  </Link>
                  <p className="truncate text-xs text-slate-500">
                    {[m.sku, m.attribute_summary].filter(Boolean).join(" · ") || "—"}
                    {m.is_base ? " · produkt bazowy" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-6 text-sm text-slate-500">
        Rodzina jest opcjonalna — produkt bez niej działa jak dotychczas.{" "}
        <Link to="/product-families" className="text-blue-700 hover:underline">
          Wróć do listy
        </Link>
      </p>
    </PageLayout>
  );
}
