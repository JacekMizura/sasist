import { useMemo, useState } from "react";

import type { VariableFieldDto, VariableTreeNode } from "../../../../api/documentTemplatesApi";

type Props = {
  nodes: VariableTreeNode[];
  fields: VariableFieldDto[];
  favorites: string[];
  selectedInsert?: string;
  expandedSections: Set<string>;
  onToggleSection: (label: string) => void;
  onSelect: (field: VariableFieldDto | null) => void;
  onInsert: (snippet: string) => void;
  onOpenDocs: (field: VariableFieldDto) => void;
  onToggleFavorite: (insert: string) => void;
};

function countLeaves(node: VariableTreeNode): number {
  if (node.insert) return 1;
  return (node.children ?? []).reduce((sum, c) => sum + countLeaves(c), 0);
}

export function VariableExplorerPanel({
  nodes,
  fields,
  favorites,
  selectedInsert,
  expandedSections,
  onToggleSection,
  onSelect,
  onInsert,
  onOpenDocs,
  onToggleFavorite,
}: Props) {
  const [sectionSearch, setSectionSearch] = useState<Record<string, string>>({});

  const fieldByInsert = useMemo(() => {
    const m = new Map<string, VariableFieldDto>();
    for (const f of fields) if (f.insert) m.set(f.insert, f);
    return m;
  }, [fields]);

  const favoriteFields = useMemo(() => {
    return favorites
      .map((ins) => fieldByInsert.get(ins))
      .filter((f): f is VariableFieldDto => Boolean(f));
  }, [favorites, fieldByInsert]);

  function resolveField(node: VariableTreeNode): VariableFieldDto | null {
    if (node.insert && fieldByInsert.has(node.insert)) return fieldByInsert.get(node.insert)!;
    if (!node.path) return null;
    return {
      path: node.path,
      label: node.label,
      type: node.type ?? "string",
      insert: node.insert,
      description: node.description,
      sample_value: node.sample_value,
      provider_label: node.provider_label,
      is_collection: node.is_collection,
      loop_usable: node.loop_usable,
    };
  }

  return (
    <div className="space-y-2">
      {favoriteFields.length > 0 ? (
        <section className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-2">
          <h3 className="mb-1 text-[10px] font-semibold text-amber-900">Ulubione</h3>
          <div className="space-y-0.5">
            {favoriteFields.map((field) => (
              <VariableRow
                key={field.insert}
                field={field}
                node={{ label: field.label, insert: field.insert }}
                selected={field.insert === selectedInsert}
                isFavorite
                onSelect={() => onSelect(field)}
                onInsert={() => field.insert && onInsert(field.insert)}
                onOpenDocs={() => onOpenDocs(field)}
                onToggleFavorite={() => field.insert && onToggleFavorite(field.insert)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {nodes.map((section, idx) => {
        const label = section.label;
        const isOpen = expandedSections.has(label);
        const total = countLeaves(section);
        const q = (sectionSearch[label] ?? "").trim().toLowerCase();

        return (
          <section key={`${label}-${idx}`} className="rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-slate-50"
              onClick={() => onToggleSection(label)}
            >
              <span className="text-[10px] text-slate-400">{isOpen ? "▼" : "▶"}</span>
              <span className="flex-1 font-medium text-slate-800">{label}</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{total}</span>
            </button>
            {isOpen ? (
              <div className="border-t border-slate-100 px-2 pb-2">
                <input
                  className="mb-2 mt-2 w-full rounded border border-slate-200 px-2 py-1 text-[11px]"
                  placeholder={`Szukaj w „${label}”…`}
                  value={sectionSearch[label] ?? ""}
                  onChange={(e) => setSectionSearch((prev) => ({ ...prev, [label]: e.target.value }))}
                />
                <SectionNodes
                  nodes={section.children ?? []}
                  depth={0}
                  search={q}
                  fieldByInsert={fieldByInsert}
                  favorites={favorites}
                  selectedInsert={selectedInsert}
                  onSelect={onSelect}
                  onInsert={onInsert}
                  onOpenDocs={onOpenDocs}
                  onToggleFavorite={onToggleFavorite}
                  resolveField={resolveField}
                />
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function SectionNodes({
  nodes,
  depth,
  search,
  fieldByInsert,
  favorites,
  selectedInsert,
  onSelect,
  onInsert,
  onOpenDocs,
  onToggleFavorite,
  resolveField,
}: {
  nodes: VariableTreeNode[];
  depth: number;
  search: string;
  fieldByInsert: Map<string, VariableFieldDto>;
  favorites: string[];
  selectedInsert?: string;
  onSelect: (field: VariableFieldDto | null) => void;
  onInsert: (snippet: string) => void;
  onOpenDocs: (field: VariableFieldDto) => void;
  onToggleFavorite: (insert: string) => void;
  resolveField: (node: VariableTreeNode) => VariableFieldDto | null;
}) {
  return (
    <>
      {nodes.map((node, idx) => {
        const field = node.insert ? fieldByInsert.get(node.insert) ?? resolveField(node) : resolveField(node);
        const hay = `${node.label} ${node.path ?? ""} ${node.insert ?? ""}`.toLowerCase();
        const children = node.children ?? [];
        const childMatch = children.some((c) => nodeMatches(c, search));
        const selfMatch = !search || hay.includes(search);
        if (search && !selfMatch && !childMatch) return null;

        if (children.length > 0 && !node.insert) {
          return (
            <div key={`${node.label}-${idx}`} style={{ paddingLeft: depth * 8 }}>
              <div className="py-1 text-[10px] font-medium text-slate-500">{node.label}</div>
              <SectionNodes
                nodes={children}
                depth={depth + 1}
                search={search}
                fieldByInsert={fieldByInsert}
                favorites={favorites}
                selectedInsert={selectedInsert}
                onSelect={onSelect}
                onInsert={onInsert}
                onOpenDocs={onOpenDocs}
                onToggleFavorite={onToggleFavorite}
                resolveField={resolveField}
              />
            </div>
          );
        }

        if (!field && !node.insert && !node.path) return null;

        return (
          <div key={`${node.label}-${idx}`} style={{ paddingLeft: depth * 8 }}>
            <VariableRow
              field={field}
              node={node}
              selected={node.insert === selectedInsert}
              isFavorite={node.insert ? favorites.includes(node.insert) : false}
              onSelect={() => onSelect(field)}
              onInsert={() => node.insert && onInsert(node.insert)}
              onOpenDocs={() => field && onOpenDocs(field)}
              onToggleFavorite={() => node.insert && onToggleFavorite(node.insert)}
            />
          </div>
        );
      })}
    </>
  );
}

function nodeMatches(node: VariableTreeNode, search: string): boolean {
  if (!search) return true;
  const hay = `${node.label} ${node.path ?? ""} ${node.insert ?? ""}`.toLowerCase();
  if (hay.includes(search)) return true;
  return (node.children ?? []).some((c) => nodeMatches(c, search));
}

function VariableRow({
  field,
  node,
  selected,
  isFavorite,
  onSelect,
  onInsert,
  onOpenDocs,
  onToggleFavorite,
}: {
  field: VariableFieldDto | null;
  node: VariableTreeNode;
  selected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onInsert: () => void;
  onOpenDocs: () => void;
  onToggleFavorite: () => void;
}) {
  const tooltip = field
    ? [
        field.type ? `Typ: ${field.type}` : null,
        field.sample_value != null && field.sample_value !== "" ? `Przykład: ${String(field.sample_value)}` : null,
        field.description ? field.description : null,
      ]
        .filter(Boolean)
        .join("\n")
    : undefined;

  return (
    <div
      className={`group relative flex items-center gap-1 rounded px-1 py-0.5 ${
        selected ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"
      }`}
      title={tooltip}
    >
      {node.insert ? (
        <button
          type="button"
          className={`shrink-0 text-[10px] ${isFavorite ? "text-amber-500" : "text-slate-300 group-hover:text-slate-400"}`}
          title={isFavorite ? "Usuń z ulubionych" : "Przypnij"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      ) : (
        <span className="w-3" />
      )}
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => {
          onSelect();
          onInsert();
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          onOpenDocs();
        }}
        disabled={!node.insert && !node.path}
      >
        <span className={node.insert ? "font-medium text-blue-800" : "text-slate-600"}>{node.label}</span>
        {field?.type ? (
          <span className="ml-1 text-[9px] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
            {typeIcon(field.type)}
          </span>
        ) : null}
      </button>
      {field && tooltip ? (
        <div className="pointer-events-none absolute left-full top-0 z-20 ml-1 hidden w-48 rounded-md border border-slate-200 bg-white p-2 text-[10px] text-slate-600 shadow-lg group-hover:block">
          <div className="font-medium text-slate-800">{field.type ?? "string"}</div>
          {field.sample_value != null && field.sample_value !== "" ? (
            <div className="mt-1 font-mono text-slate-700">{String(field.sample_value)}</div>
          ) : null}
          {field.description ? <div className="mt-1 text-slate-500">{field.description}</div> : null}
        </div>
      ) : null}
    </div>
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
