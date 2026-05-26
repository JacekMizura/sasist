import { useCallback, useMemo } from "react";
import {
  LayoutGrid,
  MessageSquareWarning,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Undo2,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type CatModTreeNode = {
  id?: string;
  label: string;
  key?: string;
  children?: CatModTreeNode[];
};

function collectLeafKeys(node: CatModTreeNode): string[] {
  if (node.key) return [node.key];
  if (!node.children?.length) return [];
  return node.children.flatMap(collectLeafKeys);
}

function collectLeavesDeep(node: CatModTreeNode): CatModTreeNode[] {
  if (node.key && (!node.children || node.children.length === 0)) return [node];
  return (node.children ?? []).flatMap(collectLeavesDeep);
}

function nodeMatchesSearch(node: CatModTreeNode, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  if (node.label.toLowerCase().includes(s)) return true;
  if (node.key && node.key.toLowerCase().includes(s)) return true;
  if (node.children?.some((c) => nodeMatchesSearch(c, q))) return true;
  return false;
}

function filterTree(nodes: CatModTreeNode[], q: string): CatModTreeNode[] {
  if (!q.trim()) return nodes;
  const out: CatModTreeNode[] = [];
  for (const n of nodes) {
    if (n.children?.length) {
      const ch = filterTree(n.children, q);
      if (ch.length > 0) out.push({ ...n, children: ch });
      else if (nodeMatchesSearch(n, q)) out.push({ ...n });
    } else if (nodeMatchesSearch(n, q)) {
      out.push(n);
    }
  }
  return out;
}

type SectionBlock = {
  id: string;
  title: string;
  leaves: CatModTreeNode[];
};

/** Flattens API tree to module → sections → leaves (max 2 levels below module). */
function moduleSections(root: CatModTreeNode): SectionBlock[] {
  const out: SectionBlock[] = [];
  for (const child of root.children ?? []) {
    if (!child.children?.length) continue;
    const subs = child.children;
    const directLeavesOnly = subs.every((c) => Boolean(c.key) && !c.children?.length);
    if (directLeavesOnly) {
      const leaves = subs.filter((c): c is CatModTreeNode & { key: string } => Boolean(c.key));
      if (leaves.length === 0) continue;
      out.push({
        id: String(child.id ?? child.label),
        title: child.label,
        leaves,
      });
      continue;
    }
    for (const sub of subs) {
      if (sub.key && (!sub.children || sub.children.length === 0)) {
        out.push({
          id: String(sub.key),
          title: child.label,
          leaves: [sub],
        });
      } else if (sub.children?.length) {
        const leaves = collectLeavesDeep(sub).filter((n): n is CatModTreeNode & { key: string } => Boolean(n.key));
        if (leaves.length === 0) continue;
        out.push({
          id: String(sub.id ?? sub.label),
          title: sub.label,
          leaves,
        });
      }
    }
  }
  return out;
}

const ICON_BY_MODULE_ID: Record<string, LucideIcon> = {
  cat_orders: ShoppingCart,
  cat_warehouse: Warehouse,
  cat_products: Package,
  cat_purchasing: ShoppingBag,
  cat_settings: Settings,
  cat_complaints: MessageSquareWarning,
  cat_returns: Undo2,
  cat_audit: ShieldCheck,
};

type LeafProps = {
  node: CatModTreeNode & { key: string };
  selected: Set<string>;
  disabled: boolean;
  onToggleKey: (key: string, checked: boolean) => void;
};

function LeafRow({ node, selected, disabled, onToggleKey }: LeafProps) {
  const checked = selected.has(node.key);
  return (
    <label
      title={node.key}
      className="flex min-w-0 cursor-pointer items-start gap-2.5 rounded-lg py-1.5 hover:bg-slate-50/80"
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggleKey(node.key, e.target.checked)}
      />
      <span className="min-w-0 flex-1 text-left text-sm leading-snug text-slate-800">
        <span className="font-medium">{node.label}</span>
      </span>
    </label>
  );
}

type ModulePanelProps = {
  module: CatModTreeNode;
  selected: Set<string>;
  disabled: boolean;
  onToggleKey: (key: string, checked: boolean) => void;
  onToggleKeys: (keys: string[], checked: boolean) => void;
};

function ModulePanel({ module, selected, disabled, onToggleKey, onToggleKeys }: ModulePanelProps) {
  const sections = useMemo(() => moduleSections(module), [module]);
  const keysUnder = useMemo(() => sections.flatMap((s) => s.leaves.map((l) => l.key!)), [sections]);
  const allChecked = keysUnder.length > 0 && keysUnder.every((k) => selected.has(k));
  const someChecked = keysUnder.some((k) => selected.has(k));

  const onModuleChange = useCallback(
    (checked: boolean) => {
      onToggleKeys(keysUnder, checked);
    },
    [keysUnder, onToggleKeys],
  );

  const Icon = ICON_BY_MODULE_ID[module.id ?? ""] ?? LayoutGrid;

  if (sections.length === 0) return null;

  return (
    <details
      className="group bg-white [&_summary::-webkit-details-marker]:hidden"
      defaultOpen
    >
      <summary className="sticky top-0 z-[5] flex h-[68px] cursor-pointer list-none items-center gap-2.5 bg-white px-4 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="text-slate-400 transition group-open:rotate-90" aria-hidden>
          ▸
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="text-base font-semibold tracking-tight text-slate-900">{module.label}</span>
          <span className="sr-only">
            {sections.length} {sections.length === 1 ? "sekcja" : "sekcje"}
          </span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900"
          checked={allChecked}
          ref={(el) => {
            if (el) el.indeterminate = !allChecked && someChecked;
          }}
          disabled={disabled || keysUnder.length === 0}
          onChange={(e) => {
            e.stopPropagation();
            onModuleChange(e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </summary>

      <div className="space-y-3 bg-white px-3 pb-3 pt-1.5">
        {sections.map((sec) => {
          const secKeys = sec.leaves.map((l) => l.key!);
          const secAll = secKeys.length > 0 && secKeys.every((k) => selected.has(k));
          const secSome = secKeys.some((k) => selected.has(k));
          return (
            <section
              key={sec.id}
              className="rounded-lg border border-slate-200 bg-white px-3 py-3"
            >
              <div className="mb-2 flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
                <h4 className="text-sm font-semibold text-slate-900">{sec.title}</h4>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900"
                  checked={secAll}
                  ref={(el) => {
                    if (el) el.indeterminate = !secAll && secSome;
                  }}
                  disabled={disabled || secKeys.length === 0}
                  onChange={(e) => onToggleKeys(secKeys, e.target.checked)}
                  aria-label={`Zaznacz całą sekcję ${sec.title}`}
                />
              </div>
              <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                {sec.leaves.map((leaf) => (
                  <LeafRow
                    key={leaf.key}
                    node={leaf as CatModTreeNode & { key: string }}
                    selected={selected}
                    disabled={disabled}
                    onToggleKey={onToggleKey}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </details>
  );
}

export type PermissionTreePanelProps = {
  tree: CatModTreeNode[];
  value: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
  search: string;
  onSearchChange: (q: string) => void;
};

export default function PermissionTreePanel({
  tree,
  value,
  onChange,
  disabled,
  search,
  onSearchChange,
}: PermissionTreePanelProps) {
  const selected = useMemo(() => new Set(value), [value]);

  const allLeafKeys = useMemo(() => tree.flatMap(collectLeafKeys), [tree]);
  const catalogKeySet = useMemo(() => new Set(allLeafKeys), [allLeafKeys]);
  const orphanKeys = useMemo(() => value.filter((k) => !catalogKeySet.has(k)).sort(), [value, catalogKeySet]);

  const filtered = useMemo(() => filterTree(tree, search.trim()), [tree, search]);

  const onToggleKey = useCallback(
    (key: string, checked: boolean) => {
      const next = new Set(value);
      if (checked) next.add(key);
      else next.delete(key);
      onChange([...next].sort());
    },
    [onChange, value],
  );

  const onToggleKeys = useCallback(
    (keys: string[], checked: boolean) => {
      const next = new Set(value);
      for (const k of keys) {
        if (checked) next.add(k);
        else next.delete(k);
      }
      onChange([...next].sort());
    },
    [onChange, value],
  );

  const clearOrphans = useCallback(() => {
    onChange(value.filter((k) => catalogKeySet.has(k)));
  }, [catalogKeySet, onChange, value]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="flex w-full shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          placeholder="Szukaj uprawnień…"
          className="h-11 w-full min-w-0 max-w-xl rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
            disabled={disabled}
            onClick={() => onChange([...allLeafKeys].sort())}
          >
            Zaznacz wszystko
          </button>
          <button
            type="button"
            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
            disabled={disabled}
            onClick={() => onChange([])}
          >
            Wyczyść
          </button>
        </div>
      </div>

      {orphanKeys.length > 0 ? (
        <div className="border-b border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium">Uprawnienia spoza bieżącego katalogu ({orphanKeys.length})</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
            Zwykle pozostałość po zmianie katalogu — możesz usunąć, aby zsynchronizować listę.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2 font-mono text-xs">
            {orphanKeys.map((k) => (
              <li key={k} className="rounded-md bg-white/80 px-2 py-1 ring-1 ring-amber-200/80">
                {k}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={disabled}
            className="mt-3 text-sm font-semibold text-amber-950 underline underline-offset-2 hover:text-amber-900 disabled:opacity-50"
            onClick={clearOrphans}
          >
            Usuń te klucze z wyboru
          </button>
        </div>
      ) : null}

      <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto bg-white">
        <div className="divide-y divide-slate-200 border-t border-slate-100">
          {filtered.map((n, i) => (
            <ModulePanel
              key={n.id ?? `root-${i}`}
              module={n}
              selected={selected}
              disabled={Boolean(disabled)}
              onToggleKey={onToggleKey}
              onToggleKeys={onToggleKeys}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
