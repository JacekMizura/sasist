import { useMemo, useState } from "react";

import type { EditorCatalogItem, EditorContextDto, VariableFieldDto, VariableTreeNode } from "../../../../api/documentTemplatesApi";
import { VariableInspectorPanel } from "./VariableInspectorPanel";
import { TemplateAssignmentsPanel } from "./TemplateAssignmentsPanel";

type Tab = "variables" | "helpers" | "tags" | "partials" | "base" | "assignments";

type Props = {
  ctx: EditorContextDto;
  onInsert: (snippet: string) => void;
  extendsVersionId: number | null;
  partialPins: Record<string, number>;
  onBaseVersionChange: (versionId: number | null) => void;
  onPartialPinChange: (code: string, versionId: number | null) => void;
  onSearchUsage?: (symbol: string) => void;
};

export function EditorLeftPanel({
  ctx,
  onInsert,
  extendsVersionId,
  partialPins,
  onBaseVersionChange,
  onPartialPinChange,
  onSearchUsage,
}: Props) {
  const [tab, setTab] = useState<Tab>("variables");
  const [search, setSearch] = useState("");
  const [selectedField, setSelectedField] = useState<VariableFieldDto | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: "variables", label: "Zmienne" },
    { id: "helpers", label: "Funkcje" },
    { id: "tags", label: "Tagi" },
    { id: "partials", label: "Fragmenty" },
    { id: "base", label: "Szablon bazowy" },
    { id: "assignments", label: "Przypisania" },
  ];

  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-slate-50/80">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 p-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-2 py-1 text-[11px] font-medium ${
              tab === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {(tab === "variables" || tab === "helpers" || tab === "tags") && (
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
          <VariableTree
            nodes={ctx.variable_tree}
            fields={ctx.variable_fields ?? []}
            search={search}
            selectedInsert={selectedField?.insert}
            onSelect={(field) => setSelectedField(field)}
            onInsert={onInsert}
          />
        )}
        {tab === "helpers" && (
          <CatalogList items={ctx.catalog.helpers} search={search} onInsert={onInsert} />
        )}
        {tab === "tags" && (
          <CatalogList items={ctx.catalog.tags} search={search} onInsert={onInsert} />
        )}
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
        {tab === "assignments" && (
          <TemplateAssignmentsPanel items={ctx.erp_assignments ?? []} />
        )}
      </div>
      {tab === "variables" && (
        <VariableInspectorPanel
          field={selectedField}
          onInsert={onInsert}
          onSearchUsage={onSearchUsage}
        />
      )}
    </div>
  );
}

function VariableTree({
  nodes,
  fields,
  search,
  selectedInsert,
  onSelect,
  onInsert,
  depth = 0,
}: {
  nodes: VariableTreeNode[];
  fields: VariableFieldDto[];
  search: string;
  selectedInsert?: string;
  onSelect: (field: VariableFieldDto | null) => void;
  onInsert: (s: string) => void;
  depth?: number;
}) {
  const fieldByInsert = useMemo(() => {
    const m = new Map<string, VariableFieldDto>();
    for (const f of fields) if (f.insert) m.set(f.insert, f);
    return m;
  }, [fields]);

  const q = search.trim().toLowerCase();
  return (
    <>
      {nodes.map((node, idx) => {
        const match = !q || node.label.toLowerCase().includes(q) || (node.path ?? "").toLowerCase().includes(q);
        const children = node.children ?? [];
        if (!match && !children.some((c) => c.label.toLowerCase().includes(q))) return null;
        const field = node.insert ? fieldByInsert.get(node.insert) : null;
        const isSelected = node.insert && node.insert === selectedInsert;
        return (
          <div key={`${node.label}-${idx}`}>
            <button
              type="button"
              className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-white ${
                isSelected ? "bg-blue-50 ring-1 ring-blue-200" : ""
              }`}
              style={{ paddingLeft: `${depth * 10 + 4}px` }}
              onClick={() => {
                if (field) onSelect(field);
                else if (node.path)
                  onSelect({
                    path: node.path,
                    label: node.label,
                    type: node.type ?? "string",
                    insert: node.insert,
                    description: node.description,
                    sample_value: node.sample_value,
                    provider_label: node.provider_label,
                    is_collection: node.is_collection,
                    loop_usable: node.loop_usable,
                  });
              }}
              onDoubleClick={() => node.insert && onInsert(node.insert)}
              disabled={!node.insert && !node.path}
            >
              <span>{node.icon ?? (node.type ? typeIcon(node.type) : "·")}</span>
              <span className={node.insert ? "font-medium text-blue-800" : "text-slate-600"}>{node.label}</span>
            </button>
            {children.length > 0 && (
              <VariableTree
                nodes={children}
                fields={fields}
                search={search}
                selectedInsert={selectedInsert}
                onSelect={onSelect}
                onInsert={onInsert}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function typeIcon(type: string) {
  const map: Record<string, string> = {
    string: "Aa",
    number: "#",
    money: "zł",
    date: "📅",
    image: "🖼",
    array: "[]",
    object: "{}",
  };
  return map[type] ?? "·";
}

function CatalogList({
  items,
  search,
  onInsert,
}: {
  items: EditorCatalogItem[];
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
          onDoubleClick={() => onInsert(item.insert)}
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
      <p className="text-[11px] text-slate-500">Fragmenty używane w szablonie — przypnij opublikowaną wersję.</p>
      {partialsUsed.map((p) => {
        const tpl = partialTemplates.find((t) => t.template_code === p.partial_code);
        const versions = tpl?.published_versions ?? [];
        return (
          <div key={p.partial_code} className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-800">{p.partial_code}</span>
              <button
                type="button"
                className="text-[10px] text-blue-700"
                onClick={() => onInsert(p.partial_code)}
                onDoubleClick={() => onInsert(p.partial_code)}
              >
                Wstaw
              </button>
            </div>
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
            {p.has_newer_version ? (
              <p className="mt-1 text-[10px] text-amber-700">Dostępna nowsza wersja fragmentu</p>
            ) : null}
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
      <p className="text-[11px] text-slate-500">Wybierz opublikowaną wersję szablonu bazowego.</p>
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
