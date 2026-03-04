import { useWarehouseDesigner } from "../../context/WarehouseDesignerContext";

export default function RackConfiguratorPanel() {
  const { rackConfig, setRackConfig } = useWarehouseDesigner();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
      <div className="text-xs font-black uppercase text-slate-500 mb-2">Właściwości regału</div>
      <div className="space-y-2 text-sm">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase">Poziomy</label>
          <input
            type="number"
            min={1}
            max={20}
            value={rackConfig.levels}
            onChange={(e) => setRackConfig({ levels: Number(e.target.value) || 1 })}
            className="w-full rounded border border-slate-200 px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase">Przegrody / poziom</label>
          <input
            type="number"
            min={1}
            max={50}
            value={rackConfig.bins_per_level}
            onChange={(e) => setRackConfig({ bins_per_level: Number(e.target.value) || 1 })}
            className="w-full rounded border border-slate-200 px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase">Głęb. (cm)</label>
          <input
            type="number"
            min={1}
            value={rackConfig.depth_cm}
            onChange={(e) => setRackConfig({ depth_cm: Number(e.target.value) || 1 })}
            className="w-full rounded border border-slate-200 px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase">Szer. (cm)</label>
          <input
            type="number"
            min={1}
            value={rackConfig.width_cm}
            onChange={(e) => setRackConfig({ width_cm: Number(e.target.value) || 1 })}
            className="w-full rounded border border-slate-200 px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase">Wys. (cm)</label>
          <input
            type="number"
            min={1}
            value={rackConfig.height_cm}
            onChange={(e) => setRackConfig({ height_cm: Number(e.target.value) || 1 })}
            className="w-full rounded border border-slate-200 px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase">Typ</label>
          <select
            value={rackConfig.rack_type}
            onChange={(e) => setRackConfig({ rack_type: e.target.value as "picking" | "pallet" | "consolidation" })}
            className="w-full rounded border border-slate-200 px-2 py-1"
          >
            <option value="picking">Picking (standard)</option>
            <option value="pallet">Paletowy (ciężki)</option>
            <option value="consolidation">Kompletacyjny (wieloelem.)</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase">Alejka (litera)</label>
          <input
            type="text"
            maxLength={2}
            value={rackConfig.aisle_letter}
            onChange={(e) => setRackConfig({ aisle_letter: e.target.value || "A" })}
            className="w-full rounded border border-slate-200 px-2 py-1"
          />
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        Adresy: {rackConfig.aisle_letter}-01-01-01 …
      </p>
    </div>
  );
}
