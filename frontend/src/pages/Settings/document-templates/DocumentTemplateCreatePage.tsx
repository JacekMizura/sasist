import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import {
  cloneDocumentStarter,
  createDocumentTemplateFromStarter,
  exportDocumentStarter,
  fetchDocumentStarters,
  fetchDocumentTemplateCatalog,
  importDocumentStarter,
} from "../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";

export function DocumentTemplateCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [families, setFamilies] = useState<Awaited<ReturnType<typeof fetchDocumentTemplateCatalog>>>([]);
  const [familyCode, setFamilyCode] = useState("");
  const [kindCode, setKindCode] = useState("");
  const [name, setName] = useState("");
  const [variantCode, setVariantCode] = useState("standard");
  const [starterCode, setStarterCode] = useState("default");
  const [starters, setStarters] = useState<{ id: number; code: string; name_pl: string }[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const st = location.state as { duplicateFromName?: string; kindCode?: string } | null;
    if (st?.duplicateFromName) setName(st.duplicateFromName);
    if (st?.kindCode) setKindCode(st.kindCode);
  }, [location.state]);

  useEffect(() => {
    fetchDocumentTemplateCatalog()
      .then(setFamilies)
      .catch((err) => toast.error(extractApiErrorMessage(err, "Błąd katalogu.")));
  }, []);

  useEffect(() => {
    if (!kindCode) {
      setStarters([]);
      setStarterCode("default");
      return;
    }
    fetchDocumentStarters(kindCode)
      .then((items) => {
        setStarters(items);
        setStarterCode(items[0]?.code ?? "default");
      })
      .catch(() => setStarters([]));
  }, [kindCode]);

  const kinds = familyCode
    ? families.find((f) => f.code === familyCode)?.kinds ?? []
    : families.flatMap((f) => f.kinds);

  async function handleCreate() {
    if (!kindCode || !name.trim()) {
      toast.error("Wybierz typ dokumentu i podaj nazwę.");
      return;
    }
    setCreating(true);
    try {
      const created = await createDocumentTemplateFromStarter(DEFAULT_TENANT_ID, {
        kind_code: kindCode,
        name: name.trim(),
        starter_code: starterCode,
        variant_code: variantCode,
      });
      toast.success("Utworzono szablon.");
      navigate(`${LIST_BASE}/${created.id}`);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się utworzyć szablonu."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Nowy szablon wydruku</h2>
      <p className="mt-1 text-sm text-slate-500">Utwórz szablon ze startera systemowego.</p>
      <div className="mt-6 space-y-4">
        <Field label="Rodzina">
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={familyCode}
            onChange={(e) => { setFamilyCode(e.target.value); setKindCode(""); }}
          >
            <option value="">— wybierz —</option>
            {families.map((f) => (
              <option key={f.code} value={f.code}>{f.name_pl}</option>
            ))}
          </select>
        </Field>
        <Field label="Typ dokumentu">
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={kindCode}
            onChange={(e) => setKindCode(e.target.value)}
          >
            <option value="">— wybierz —</option>
            {kinds.map((k) => (
              <option key={k.code} value={k.code}>{k.name_pl}</option>
            ))}
          </select>
        </Field>
        <Field label="Starter">
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={starterCode}
            onChange={(e) => setStarterCode(e.target.value)}
            disabled={!kindCode || starters.length === 0}
          >
            {starters.map((s) => (
              <option key={s.id} value={s.code}>{s.name_pl}</option>
            ))}
          </select>
          {starters.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                onClick={async () => {
                  const s = starters.find((x) => x.code === starterCode);
                  if (!s) return;
                  const data = await exportDocumentStarter(s.id);
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `starter-${kindCode}-${s.code}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Eksport startera
              </button>
              <button
                type="button"
                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                onClick={async () => {
                  const s = starters.find((x) => x.code === starterCode);
                  if (!s) return;
                  try {
                    await cloneDocumentStarter(s.id);
                    toast.success("Sklonowano starter.");
                    setStarters(await fetchDocumentStarters(kindCode));
                  } catch (err) {
                    toast.error(extractApiErrorMessage(err, "Klonowanie nie powiodło się."));
                  }
                }}
              >
                Klonuj starter
              </button>
              <label className="cursor-pointer rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
                Import startera
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !kindCode) return;
                    try {
                      const text = await file.text();
                      const payload = JSON.parse(text) as Record<string, unknown>;
                      await importDocumentStarter({ kind_code: kindCode, payload });
                      toast.success("Zaimportowano starter.");
                      setStarters(await fetchDocumentStarters(kindCode));
                    } catch (err) {
                      toast.error(extractApiErrorMessage(err, "Import nie powiódł się."));
                    }
                  }}
                />
              </label>
            </div>
          )}
        </Field>
        <Field label="Wariant">
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={variantCode}
            onChange={(e) => setVariantCode(e.target.value)}
          >
            <option value="standard">standard</option>
            <option value="food">food</option>
            <option value="pharma">pharma</option>
            <option value="export">export</option>
            <option value="internal">internal</option>
          </select>
        </Field>
        <Field label="Nazwa szablonu">
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. Karta produkcyjna — standard"
          />
        </Field>
        <button
          type="button"
          disabled={creating}
          onClick={handleCreate}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Utwórz i otwórz edytor
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
