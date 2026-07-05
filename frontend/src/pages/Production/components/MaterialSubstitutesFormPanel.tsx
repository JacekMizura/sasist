import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import {
  createMaterialSubstitute,
  deleteMaterialSubstitute,
  type MaterialSubstitute,
} from "@/api/productionShortageApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { ProductThumb } from "./ProductThumb";
import { ErpProductPicker, type ErpProductOption } from "./ErpProductPicker";

type Props = {
  tenantId: number;
  rows: MaterialSubstitute[];
  onChanged: () => void;
};

export function MaterialSubstitutesFormPanel({ tenantId, rows, onChanged }: Props) {
  const [component, setComponent] = useState<ErpProductOption | null>(null);
  const [substitute, setSubstitute] = useState<ErpProductOption | null>(null);
  const [priority, setPriority] = useState("10");
  const [ratio, setRatio] = useState("1");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!component || !substitute) {
      toast.error("Wybierz składnik receptury i produkt zastępczy.");
      return;
    }
    if (component.id === substitute.id) {
      toast.error("Zamiennik musi być innym produktem.");
      return;
    }
    setBusy(true);
    try {
      await createMaterialSubstitute(tenantId, {
        product_id: component.id,
        substitute_product_id: substitute.id,
        priority: Number(priority) || 10,
        conversion_ratio: Number(ratio) || 1,
        is_active: isActive,
        notes: notes.trim() || null,
      });
      toast.success("Zamiennik dodany.");
      setComponent(null);
      setSubstitute(null);
      setNotes("");
      onChanged();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się dodać zamiennika."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteMaterialSubstitute(tenantId, id);
      toast.success("Usunięto zamiennik.");
      onChanged();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się usunąć zamiennika."));
    }
  };

  return (
    <div className="mt-4 space-y-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <p className="mb-3 text-sm font-bold text-slate-800">Nowy zamiennik</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <ErpProductPicker
            tenantId={tenantId}
            label="Składnik receptury"
            value={component}
            onChange={setComponent}
            excludeProductId={substitute?.id}
          />
          <ErpProductPicker
            tenantId={tenantId}
            label="Produkt zastępczy"
            value={substitute}
            onChange={setSubstitute}
            excludeProductId={component?.id}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-semibold uppercase text-slate-500">Priorytet</label>
            <input
              type="number"
              min={1}
              max={999}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-slate-500">Współczynnik (1 A = X B)</label>
            <input
              type="number"
              step="0.01"
              min={0.0001}
              value={ratio}
              onChange={(e) => setRatio(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Aktywny
            </label>
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs font-semibold uppercase text-slate-500">Notatka technologiczna</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Np. dopuszczalny tylko przy produkcji serii testowej…"
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void add()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Dodaj zamiennik
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Brak zdefiniowanych zamienników.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase text-slate-400">Składnik</span>
                  <ProductThumb imageUrl={null} name={r.product_name} size="sm" />
                  <div>
                    <p className="text-sm font-semibold">{r.product_name}</p>
                    {r.product_sku ? <p className="font-mono text-xs text-slate-500">{r.product_sku}</p> : null}
                  </div>
                </div>
                <span className="text-slate-300">→</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase text-violet-500">Zamiennik</span>
                  <ProductThumb imageUrl={null} name={r.substitute_product_name} size="sm" />
                  <div>
                    <p className="text-sm font-semibold">{r.substitute_product_name}</p>
                    {r.substitute_product_sku ? (
                      <p className="font-mono text-xs text-slate-500">{r.substitute_product_sku}</p>
                    ) : null}
                  </div>
                </div>
                <div className="text-xs text-slate-600">
                  Priorytet {r.priority} · współcz. {r.conversion_ratio} · {r.is_active ? "aktywny" : "nieaktywny"}
                </div>
                {r.notes ? <p className="w-full text-xs italic text-slate-500">{r.notes}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => void remove(r.id)}
                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Usuń zamiennik"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
