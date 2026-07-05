import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, XCircle } from "lucide-react";

import { fetchBomTree, type BomTreeNode } from "@/api/productionShortageApi";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { ProductThumb } from "./ProductThumb";

type Props = {
  tenantId: number;
  warehouseId: number;
  compositionId: number;
  plannedQuantity: number;
};

const STATUS_UI = {
  OK: { label: "Dostępny", icon: CheckCircle2, className: "text-emerald-700 bg-emerald-50 ring-emerald-200" },
  PARTIAL: { label: "Częściowo", icon: AlertTriangle, className: "text-amber-800 bg-amber-50 ring-amber-200" },
  BLOCKED: { label: "Brak", icon: XCircle, className: "text-rose-800 bg-rose-50 ring-rose-200" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_UI[status as keyof typeof STATUS_UI] ?? STATUS_UI.OK;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${cfg.className}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {cfg.label}
    </span>
  );
}

function TreeNodeRow({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  selectedId,
}: {
  node: BomTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onSelect: (node: BomTreeNode) => void;
  selectedId: number | null;
}) {
  const key = `${node.product_id}-${node.level}-${node.composition_id ?? 0}`;
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isOpen = expanded.has(key);
  const isSelected = selectedId === node.product_id;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node)}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition ${
          isSelected ? "bg-violet-100 ring-1 ring-violet-300" : "hover:bg-slate-50"
        }`}
        style={{ paddingLeft: `${8 + depth * 20}px` }}
      >
        {hasChildren ? (
          <span
            role="presentation"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(key);
            }}
            className="shrink-0 rounded p-0.5 hover:bg-slate-200"
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <ProductThumb imageUrl={node.product_image_url} name={node.product_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{node.product_name}</p>
          <p className="text-xs text-slate-500">
            {node.product_sku || "—"} · {node.required_qty ?? node.quantity_per_root} {node.unit || "szt."}
            {node.is_manufactured ? " · półprodukt" : ""}
          </p>
        </div>
        <StatusBadge status={node.material_status} />
      </button>
      {hasChildren && isOpen ? (
        <div className="border-l border-slate-200 ml-4">
          {node.children!.map((ch) => (
            <TreeNodeRow
              key={`${ch.product_id}-${ch.level}`}
              node={ch}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NodeDetailPanel({ node }: { node: BomTreeNode | null }) {
  if (!node) {
    return <p className="text-sm text-slate-500">Kliknij element drzewa BOM, aby zobaczyć stany i zamienniki.</p>;
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-3">
        <ProductThumb imageUrl={node.product_image_url} name={node.product_name} size="md" />
        <div>
          <p className="font-bold text-slate-900">{node.product_name}</p>
          <p className="text-xs text-slate-500">{node.product_sku || "—"}</p>
          <StatusBadge status={node.material_status} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-slate-500">Wymagane</p>
          <p className="font-bold tabular-nums">{node.required_qty ?? node.quantity_per_root}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-slate-500">Dostępne</p>
          <p className="font-bold tabular-nums">{node.available_qty ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-slate-500">Stan</p>
          <p className="font-bold tabular-nums">{node.on_hand_qty ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-slate-500">Rezerwacje</p>
          <p className="font-bold tabular-nums">{node.reserved_qty ?? "—"}</p>
        </div>
      </div>
      {node.expected_availability_date ? (
        <p className="text-xs text-slate-600">ETA dostawy: {node.expected_availability_date}</p>
      ) : null}
      {node.locations?.length ? (
        <div>
          <p className="mb-1 text-xs font-bold uppercase text-slate-500">Lokalizacje / partie</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {node.locations.map((loc, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded border border-slate-100 px-2 py-1">
                <LocationBadge code={loc.location_code} type="PICK" />
                <span className="tabular-nums">{loc.available_qty} dost.</span>
                {loc.batch_number ? <span className="text-slate-500">Partia: {loc.batch_number}</span> : null}
                {loc.expiry_date ? <span className="text-slate-500">Ważn.: {loc.expiry_date}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {node.substitute_proposals?.length ? (
        <div>
          <p className="mb-1 text-xs font-bold uppercase text-violet-600">Zamienniki</p>
          <ul className="space-y-1 text-xs">
            {node.substitute_proposals.map((s) => (
              <li key={s.substitute_product_id} className="rounded border border-violet-100 bg-violet-50/50 px-2 py-1">
                {s.substitute_product_name} · współcz. {s.conversion_ratio}
                {s.can_cover_shortage ? " · pokrywa brak" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function BomTreeVisualization({ tenantId, warehouseId, compositionId, plannedQuantity }: Props) {
  const [tree, setTree] = useState<BomTreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<BomTreeNode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBomTree(tenantId, warehouseId, compositionId, plannedQuantity);
      setTree(data.tree);
      setSelected(data.tree);
      const rootKey = `${data.tree.product_id}-${data.tree.level}-${data.tree.composition_id ?? 0}`;
      setExpanded(new Set([rootKey]));
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, compositionId, plannedQuantity]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) return <p className="text-sm text-slate-500">Wczytywanie drzewa BOM…</p>;
  if (!tree) return <p className="text-sm text-slate-500">Brak danych BOM.</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Struktura receptury</p>
        <TreeNodeRow
          node={tree}
          depth={0}
          expanded={expanded}
          onToggle={toggle}
          onSelect={setSelected}
          selectedId={selected?.product_id ?? null}
        />
      </div>
      <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Szczegóły składnika</p>
        <NodeDetailPanel node={selected} />
      </div>
    </div>
  );
}
