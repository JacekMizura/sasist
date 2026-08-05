import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { fetchTenantsList } from "../../../api/tenantsApi";
import {
  createProductCustomField,
  getProductCustomField,
  listProductAttachmentKinds,
  updateProductCustomField,
  type ProductAttachmentKind,
} from "../../../api/productCustomFieldsApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import { ListPageHeader } from "../../../components/listPage/ListPageHeader";
import PageLayout from "../../../components/layout/PageLayout";
import { Checkbox, GhostButton, Input, PrimaryButton, Select } from "../../../design-system";
import { UI_STRINGS } from "../../../constants/uiStrings";

type UiKind = "TEXT" | "NUMBER" | "FILES" | "LIST" | "GPSR_ATTACHMENTS" | "ATTACHMENTS";

const FIELD_TYPE_OPTIONS: { value: UiKind; label: string }[] = [
  { value: "TEXT", label: "Pole tekstowe" },
  { value: "NUMBER", label: "Pole liczbowe" },
  { value: "FILES", label: "Pliki" },
  { value: "LIST", label: "Lista" },
  { value: "GPSR_ATTACHMENTS", label: "Instrukcja bezpieczeństwa (GPSR - załączniki)" },
  { value: "ATTACHMENTS", label: "Załączniki" },
];

function backendType(kind: UiKind, listMulti: boolean): string {
  if (kind === "LIST") return listMulti ? "SELECT_MULTI" : "SELECT_SINGLE";
  return kind;
}

function fromBackend(t: string): { kind: UiKind; listMulti: boolean } {
  if (t === "SELECT_SINGLE") return { kind: "LIST", listMulti: false };
  if (t === "SELECT_MULTI") return { kind: "LIST", listMulti: true };
  if (t === "TEXT" || t === "NUMBER" || t === "FILES" || t === "GPSR_ATTACHMENTS" || t === "ATTACHMENTS") {
    return { kind: t, listMulti: false };
  }
  return { kind: "TEXT", listMulti: false };
}

type OptionDraft = { id?: number; label: string };

export default function ProductCustomFieldEditPage() {
  const { fieldId } = useParams();
  const navigate = useNavigate();
  const isNew = !fieldId || fieldId === "new";
  const numericId = !isNew ? Number(fieldId) : null;

  const [tenantId, setTenantId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<UiKind>("TEXT");
  const [listMulti, setListMulti] = useState(false);
  const [attachmentKind, setAttachmentKind] = useState("poradnik");
  const [attachmentKinds, setAttachmentKinds] = useState<ProductAttachmentKind[]>([]);
  const [attachmentFilter, setAttachmentFilter] = useState("");
  const [options, setOptions] = useState<OptionDraft[]>([{ label: "" }]);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchTenantsList()
      .then((list) => setTenantId(list[0]?.id ?? null))
      .catch(() => setTenantId(null));
    void listProductAttachmentKinds()
      .then(setAttachmentKinds)
      .catch(() => setAttachmentKinds([]));
  }, []);

  useEffect(() => {
    if (tenantId == null || isNew || numericId == null || !Number.isFinite(numericId)) return;
    setLoading(true);
    void getProductCustomField(tenantId, numericId)
      .then((f) => {
        setName(f.name);
        const ui = fromBackend(f.type);
        setKind(ui.kind);
        setListMulti(ui.listMulti);
        setIsActive(f.is_active);
        const att = (f.settings_json?.attachments as { kind?: string } | undefined)?.kind;
        if (att) setAttachmentKind(att);
        setOptions(
          f.options?.length
            ? f.options.map((o) => ({ id: o.id, label: o.label }))
            : [{ label: "" }],
        );
      })
      .catch((e) => {
        toast.error(extractApiErrorMessage(e, "Nie udało się wczytać pola."));
        navigate("/product-custom-fields");
      })
      .finally(() => setLoading(false));
  }, [tenantId, isNew, numericId, navigate]);

  const filteredAttachmentKinds = useMemo(() => {
    const q = attachmentFilter.trim().toLowerCase();
    if (!q) return attachmentKinds;
    return attachmentKinds.filter((k) => k.label.toLowerCase().includes(q) || k.value.includes(q));
  }, [attachmentKinds, attachmentFilter]);

  const onSave = async () => {
    if (tenantId == null) return;
    const cleaned = name.trim();
    if (!cleaned) {
      toast.error("Podaj nazwę pola.");
      return;
    }
    const type = backendType(kind, listMulti);
    const opts =
      kind === "LIST"
        ? options.map((o, i) => ({ id: o.id, label: o.label.trim(), sort_order: i })).filter((o) => o.label)
        : [];
    if (kind === "LIST" && !opts.length) {
      toast.error("Dodaj co najmniej jedną opcję listy.");
      return;
    }
    const settings_json: Record<string, unknown> =
      kind === "ATTACHMENTS"
        ? { files: { mode: "documents" }, attachments: { kind: attachmentKind } }
        : kind === "GPSR_ATTACHMENTS"
          ? { files: { mode: "documents" }, gpsr: true }
          : kind === "FILES"
            ? { files: { mode: "both" } }
            : kind === "NUMBER"
              ? { number: { min: null, max: null, decimals: 2 } }
              : kind === "LIST"
                ? { select: { multi: listMulti } }
                : { text: { subtype: "any", multiline: false } };

    setSaving(true);
    try {
      const body = {
        name: cleaned,
        type,
        settings_json,
        is_active: isActive,
        options: opts,
        sort_order: 0,
      };
      if (isNew) {
        const created = await createProductCustomField(tenantId, body);
        toast.success("Utworzono pole.");
        navigate(`/product-custom-fields/${created.id}/edit`, { replace: true });
      } else if (numericId != null) {
        await updateProductCustomField(tenantId, numericId, body);
        toast.success("Zapisano pole.");
      }
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Zapis nie powiódł się."));
    } finally {
      setSaving(false);
    }
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
        title={isNew ? "Dodajesz pole" : `Edytujesz pole: ${name || "—"}`}
        description="Rodzaje pól jak w Sellasist — tekst, liczba, pliki, lista, GPSR i załączniki."
        breadcrumbs={[
          { label: UI_STRINGS.navigation.assortment },
          { label: UI_STRINGS.navigation.productCustomFields, to: "/product-custom-fields" },
          { label: isNew ? "Nowe" : "Edycja" },
        ]}
        actions={
          <PrimaryButton type="button" density="compact" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Zapisywanie…" : "Zapisz"}
          </PrimaryButton>
        }
      />

      <section className="mt-6 max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Nazwa</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa pola" />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Rodzaj pola</span>
          <Select value={kind} onChange={(e) => setKind(e.target.value as UiKind)}>
            {FIELD_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>

        {kind === "LIST" ? (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Rodzaj opcji</span>
            <Select value={listMulti ? "multi" : "single"} onChange={(e) => setListMulti(e.target.value === "multi")}>
              <option value="single">Możliwość wybrania jednej opcji</option>
              <option value="multi">Możliwość wybrania kilku opcji</option>
            </Select>
          </label>
        ) : null}

        {kind === "ATTACHMENTS" ? (
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Typ załącznika</span>
            <Input
              value={attachmentFilter}
              onChange={(e) => setAttachmentFilter(e.target.value)}
              placeholder="Znajdź"
              className="mb-2"
            />
            <Select value={attachmentKind} onChange={(e) => setAttachmentKind(e.target.value)}>
              {filteredAttachmentKinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Pole aktywne
        </label>
      </section>

      {kind === "LIST" ? (
        <section className="mt-6 max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Opcje</h2>
            <GhostButton type="button" density="compact" onClick={() => setOptions((p) => [...p, { label: "" }])}>
              <Plus className="mr-1 h-4 w-4" strokeWidth={2.5} aria-hidden />
              Dodaj opcję
            </GhostButton>
          </div>
          <ul className="space-y-2">
            {options.map((opt, idx) => (
              <li key={opt.id ?? `opt-${idx}`} className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={opt.label}
                  onChange={(e) =>
                    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, label: e.target.value } : o)))
                  }
                  placeholder="Nazwa"
                />
                <GhostButton
                  type="button"
                  density="compact"
                  onClick={() => setOptions((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </GhostButton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-6 text-sm text-slate-500">
        Po zapisaniu pole pojawi się na karcie produktu → Podstawowe (nad historią).{" "}
        <Link to="/product-custom-fields" className="text-blue-700 hover:underline">
          Wróć do listy
        </Link>
      </p>
    </PageLayout>
  );
}
