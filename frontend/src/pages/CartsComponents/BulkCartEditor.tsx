import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";
import { useTranslation } from "../../locales";

/** Edytor wózka standardowego (bulk): nazwa, wymiary, grupa, zdjęcie. */

type BulkFormState = {
  name: string;
  length: number;
  width: number;
  height: number;
};

type CapacityMode = "volume" | "orders" | "mixed";

type CartGroup = { id: number; name: string };

export default function BulkCartEditor({
  cartId,
  onClose,
}: {
  cartId: number | null;
  onClose: () => void;
}) {
  const t = useTranslation();
  const { warehouse } = useWarehouse();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<BulkFormState>({
    name: "",
    length: 0,
    width: 0,
    height: 0,
  });
  const [imageUrl, setImageUrl] = useState<string>("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [availableGroups, setAvailableGroups] = useState<CartGroup[]>([]);
  const [capacityMode, setCapacityMode] = useState<CapacityMode>("volume");
  const [maxOrders, setMaxOrders] = useState<number | "">("");
  const [maxVolumeDm3, setMaxVolumeDm3] = useState<number | "">("");

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const resGroups = await api.get("/carts/groups/?tenant_id=1&cart_type=BULK");
        if (cancelled) return;

        const groupsRaw: unknown[] = Array.isArray(resGroups.data) ? resGroups.data : [];
        const groups: CartGroup[] = groupsRaw
          .map((g) => {
            const obj = g as { id?: unknown; name?: unknown };
            return { id: Number(obj.id), name: String(obj.name ?? "") };
          })
          .filter((g) => Number.isFinite(g.id) && g.id > 0);
        setAvailableGroups(groups);

        if (cartId) {
          const res = await api.get(`/carts/${cartId}/`);
          if (cancelled) return;

          const data = res.data;
          setFormData({
            name: data.name ?? "",
            length: Number(data.length) || 0,
            width: Number(data.width) || 0,
            height: Number(data.height) || 0,
          });
          setImageUrl(data.image_url ?? "");

          const rawGroupId = data.group_id;
          const initialGroupId =
            rawGroupId != null && rawGroupId !== "" && !Number.isNaN(Number(rawGroupId))
              ? Number(rawGroupId)
              : null;
          setGroupId(initialGroupId);
          setCapacityMode((data.capacity_mode ?? "volume") as CapacityMode);
          setMaxOrders(data.max_orders != null ? data.max_orders : "");
          setMaxVolumeDm3(data.max_volume_dm3 != null ? data.max_volume_dm3 : "");
        }
      } catch (err) {
        if (!cancelled) console.error("BulkCartEditor init error:", err);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [cartId]);

  const handleSave = async () => {
    if (!warehouse) return;
    setLoading(true);
    try {
      const vol = (Number(formData.length) * Number(formData.width) * Number(formData.height)) / 1000;
      const payload: Record<string, unknown> = {
        name: formData.name.toUpperCase(),
        tenant_id: 1,
        warehouse_id: warehouse.id,
        group_id: groupId,
        image_url: imageUrl.trim() || null,
        length: Number(formData.length),
        width: Number(formData.width),
        height: Number(formData.height),
        capacity_mode: capacityMode,
      };
      if (capacityMode === "orders" || capacityMode === "mixed") {
        payload.max_orders = maxOrders === "" ? null : Number(maxOrders);
      }
      if (capacityMode === "volume" || capacityMode === "mixed") {
        payload.max_volume_dm3 = maxVolumeDm3 === "" ? vol : Number(maxVolumeDm3);
      }

      let res;
      if (cartId) {
        res = await api.put(`/carts/${cartId}/`, payload);
      } else {
        res = await api.post("/carts/bulk/", payload);
      }
      console.log("[BulkCartEditor] Save success", res?.status, res?.data);
      try {
        onClose();
      } catch (e) {
        console.error("[BulkCartEditor] onClose failed:", e);
      }
    } catch (err) {
      console.error("[BulkCartEditor] Błąd zapisu:", err);
      alert(t.saveErrorBulk);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-10 bg-white rounded-[2.5rem] shadow-2xl border border-slate-100">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-black text-slate-800 uppercase italic">
          {cartId ? t.editBulkCart : t.newBulkCart}
        </h2>
        <button onClick={onClose} className="text-slate-300 font-black text-xs uppercase">{t.close}</button>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.name}</label>
          <input 
            className="w-full bg-slate-50 rounded-2xl px-6 py-4 border border-slate-100 font-black text-slate-700 outline-none focus:border-blue-500 transition-all"
            value={formData.name}
            onChange={e => setFormData({...formData, name: e.target.value})}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {['width', 'length', 'height'].map((f) => (
            <div key={f} className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                {f === 'width' ? t.width : f === 'length' ? t.length : t.height}
              </label>
              <input 
                type="number"
                /* Ukrycie strzałek góra/dół */
                className="w-full bg-slate-50 rounded-2xl py-4 border border-slate-100 font-black text-slate-700 text-center outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={formData[f as keyof typeof formData] || ''}
                onChange={e => setFormData({...formData, [f]: Number(e.target.value)})}
              />
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 pt-6">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">CAPACITY MODE</h3>
          <div className="flex flex-wrap gap-4 p-1 mb-4">
            {(["volume", "orders", "mixed"] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="capacityMode"
                  checked={capacityMode === mode}
                  onChange={() => setCapacityMode(mode)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-bold capitalize">{mode}</span>
              </label>
            ))}
          </div>
          {(capacityMode === "volume" || capacityMode === "mixed") && (
            <div className="mb-4">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-1">max_volume_dm3</label>
              <input
                type="number"
                min={0}
                step={0.1}
                className="w-full bg-slate-50 rounded-2xl px-4 py-2 font-bold outline-none border border-slate-200"
                value={maxVolumeDm3 === "" ? "" : maxVolumeDm3}
                onChange={(e) => setMaxVolumeDm3(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder={String(((formData.length * formData.width * formData.height) / 1000).toFixed(1))}
              />
            </div>
          )}
          {(capacityMode === "orders" || capacityMode === "mixed") && (
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-1">max_orders</label>
              <input
                type="number"
                min={1}
                className="w-full bg-slate-50 rounded-2xl px-4 py-2 font-bold outline-none border border-slate-200"
                value={maxOrders === "" ? "" : maxOrders}
                onChange={(e) => setMaxOrders(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g. 10"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
            {t.imageUrlLabel}
          </label>
          <input
            type="text"
            className="w-full bg-slate-50 rounded-2xl px-6 py-4 border border-slate-100 font-black text-slate-700 outline-none focus:border-blue-500 transition-all"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://... (optional)"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
            Grupa
          </label>
          <select
            className="w-full bg-slate-50 rounded-2xl py-3 px-4 border border-slate-100 font-black text-slate-700 outline-none focus:border-blue-500 text-xs"
            value={groupId === null ? "" : String(groupId)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                setGroupId(null);
              } else {
                const n = Number(v);
                setGroupId(Number.isNaN(n) ? null : n);
              }
            }}
          >
            <option value="">{t.unassigned.toUpperCase()}</option>
            {availableGroups.map((g) => (
              <option key={g.id} value={String(g.id)}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg transition-all"
        >
          {loading ? t.savingBulk : t.confirm}
        </button>
      </div>
    </div>
  );
}