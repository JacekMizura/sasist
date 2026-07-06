import { useEffect, useMemo, useState } from "react";

import type { EditorContextDto, VariableFieldDto } from "../../../../api/documentTemplatesApi";
import { useLeftPanelPersistence } from "../hooks/useLeftPanelPersistence";
import { useVariableFavorites } from "../hooks/useVariableFavorites";
import { HelperCatalogPanel } from "./HelperCatalogPanel";
import { VariableExplorerPanel } from "./VariableExplorerPanel";
import { VariableInspectorPanel } from "./VariableInspectorPanel";
import { TemplateAssignmentsPanel } from "./TemplateAssignmentsPanel";

const TAB_ICONS: Record<string, string> = {
  variables: "{ }",
  helpers: "ƒ",
  tags: "#",
  partials: "◧",
  base: "B",
  assignments: "⊕",
};

type Props = {
  templateId: number;
  collapsed: boolean;
  onExpand: () => void;
  assignmentsFocusToken?: number;
  ctx: EditorContextDto;
  onInsert: (snippet: string) => void;
  extendsVersionId: number | null;
  partialPins: Record<string, number>;
  onBaseVersionChange: (versionId: number | null) => void;
  onPartialPinChange: (code: string, versionId: number | null) => void;
  onSearchUsage?: (symbol: string) => void;
};

export function EditorLeftPanel({
  templateId,
  collapsed,
  onExpand,
  assignmentsFocusToken,
  ctx,
  onInsert,
  extendsVersionId,
  partialPins,
  onBaseVersionChange,
  onPartialPinChange,
  onSearchUsage,
}: Props) {
  const { tab, setTab, expandedSections, toggleSection } = useLeftPanelPersistence(templateId);
  const [search, setSearch] = useState("");
  const [selectedField, setSelectedField] = useState<VariableFieldDto | null>(null);
  const { favorites, toggleFavorite } = useVariableFavorites(templateId);

  useEffect(() => {
    if (assignmentsFocusToken) setTab("assignments");
  }, [assignmentsFocusToken, setTab]);

  const tabs = [
    { id: "variables" as const, label: "Zmienne" },
    { id: "helpers" as const, label: "Funkcje" },
    { id: "tags" as const, label: "Tagi" },
    { id: "partials" as const, label: "Fragmenty" },
    { id: "base" as const, label: "Baza" },
    { id: "assignments" as const, label: "Przypisania" },
  ];

  function openDocs(field: VariableFieldDto) {
    setSelectedField(field);
    if (field.path && onSearchUsage) onSearchUsage(field.path);
  }

  if (collapsed) {
    return (
      <aside className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-slate-100 py-2 transition-[width] duration-200 ease-in-out">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            className={`flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold ${
              tab === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"
            }`}
            onClick={() => {
              setTab(t.id);
              onExpand();
            }}
          >
            {TAB_ICONS[t.id]}
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 transition-[width] duration-200 ease-in-out">
      <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            onClick={() => setTab(t.id)}
            className={`rounded px-2 py-1 text-[10px] font-medium ${
              tab === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {(tab === "helpers" || tab === "tags") && (
        <div className="border-b border-slate-200 p-2">
          <input
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
            placeholder="Szukaj…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
        {tab === "variables" && (
          <VariableExplorerPanel
            nodes={ctx.variable_tree}
            fields={ctx.variable_fields ?? []}
            favorites={favorites}
            selectedInsert={selectedField?.insert}
            expandedSections={expandedSections}
            onToggleSection={toggleSection}
            onSelect={setSelectedField}
            onInsert={onInsert}
            onOpenDocs={openDocs}
            onToggleFavorite={toggleFavorite}
          />
        )}
        {tab === "helpers" && <HelperCatalogPanel items={ctx.catalog.helpers} search={search} onInsert={onInsert} />}
        {tab === "tags" && <CatalogList items={ctx.catalog.tags} search={search} onInsert={onInsert} />}
        {tab === "partials" && (
          <PartialsPanel
            partialsUsed={ctx.partials_used}
            partialTemplates={ctx.partial_templates}
            pins={partialPins}
            onPinChange={onPartialPinChange}
            onInsert={(code) => onInsert(`{% include_document "${code}" %}`)}
          />
        )}
        {tab === "base" && (
          <BasePanel
            baseTemplates={ctx.base_templates}
            extendsBase={ctx.extends_base}
            selectedVersionId={extendsVersionId}
            onVersionChange={onBaseVersionChange}
          />
        )}
        {tab === "assignments" && <TemplateAssignmentsPanel items={ctx.erp_assignments ?? []} />}
      </div>
      {tab === "variables" && (
        <VariableInspectorPanel field={selectedField} onInsert={onInsert} onSearchUsage={onSearchUsage} />
      )}
    </aside>
  );
}

function CatalogList({
  items,
  search,
  onInsert,
}: {
  items: { name: string; insert: string }[];
  search: string;
  onInsert: (s: string) => void;
}) {
  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => items.filter((i) => !q || i.name.toLowerCase().includes(q)),
    [items, q],
  );
  return (
    <div className="space-y-1">
      {filtered.map((item) => (
        <button
          key={item.name}
          type="button"
          className="block w-full rounded px-2 py-1.5 text-left hover:bg-white"
          onClick={() => onInsert(item.insert)}
        >
          <div className="font-medium text-slate-800">{item.name}</div>
          <div className="font-mono text-[10px] text-slate-500">{item.insert}</div>
        </button>
      ))}
    </div>
  );
}

function PartialsPanel({
  partialsUsed,
  partialTemplates,
  pins,
  onPinChange,
  onInsert,
}: {
  partialsUsed: EditorContextDto["partials_used"];
  partialTemplates: EditorContextDto["partial_templates"];
  pins: Record<string, number>;
  onPinChange: (code: string, versionId: number | null) => void;
  onInsert: (code: string) => void;
}) {
  return (
    <div className="space-y-3">
      {partialsUsed.length === 0 ? (
        <p className="text-[11px] text-slate-500">Brak dołączonych fragmentów w szablonie.</p>
      ) : null}
      {partialsUsed.map((p) => {
        const tpl = partialTemplates.find((t) => t.template_code === p.partial_code);
        const versions = tpl?.published_versions ?? [];
        const snippet = `{% include_document "${p.partial_code}" %}`;
        return (
          <div key={p.partial_code} className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-800">{p.partial_code}</span>
              <button type="button" className="text-[10px] font-medium text-blue-700" onClick={() => onInsert(p.partial_code)}>
                Wstaw
              </button>
            </div>
            <pre className="mt-1.5 overflow-x-auto rounded bg-slate-900 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-emerald-300">
              {snippet}
            </pre>
            <select
              className="mt-2 w-full rounded border border-slate-200 px-1 py-1 text-[11px]"
              value={pins[p.partial_code] ?? p.pinned_version?.id ?? ""}
              onChange={(e) => onPinChange(p.partial_code, e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— wybierz wersję —</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version_number} · {v.status_label ?? v.status}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function BasePanel({
  baseTemplates,
  extendsBase,
  selectedVersionId,
  onVersionChange,
}: {
  baseTemplates: EditorContextDto["base_templates"];
  extendsBase: EditorContextDto["extends_base"];
  selectedVersionId: number | null;
  onVersionChange: (id: number | null) => void;
}) {
  const selectedTpl = baseTemplates.find((t) => t.id === extendsBase?.template_id) ?? baseTemplates[0];
  const versions = selectedTpl?.published_versions ?? [];

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">Opublikowana wersja szablonu bazowego.</p>
      <select className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs" value={selectedTpl?.id ?? ""} disabled>
        {baseTemplates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select
        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
        value={selectedVersionId ?? ""}
        onChange={(e) => onVersionChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— bez szablonu bazowego —</option>
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {selectedTpl?.name} · wersja {v.version_number}
          </option>
        ))}
      </select>
    </div>
  );
}
