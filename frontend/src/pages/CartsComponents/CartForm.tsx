import { useState, useEffect } from "react";
import { log } from "../../utils/logger";
import api from "../../api/axios";

interface CartFormProps {
  groupId?: number;
  editId?: number | null;
  initialType?: 'BULK' | 'MULTI';
  onClose: () => void;
  onSuccess: () => void;
}

export default function CartForm({ groupId, editId, initialType = 'BULK', onClose, onSuccess }: CartFormProps) {
  const [type, setType] = useState<'BULK' | 'MULTI'>(initialType);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [dims, setDims] = useState({ l: 120, w: 80, h: 100 });

  // Resetuj typ przy otwarciu modala
  useEffect(() => {
    if (!editId) setType(initialType);
  }, [initialType, editId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setLoading(true);
    
    const baseData = {
      name: name.toUpperCase(),
      tenant_id: 1,
      warehouse_id: 1,
    };

    try {
      let res;
      if (type === 'BULK') {
        res = await api.post("/carts/bulk/", {
          ...baseData,
          group_id: groupId ?? null,
          length: dims.l,
          width: dims.w,
          height: dims.h
        });
      } else {
        const multiData = {
          ...baseData,
          group_id: groupId ?? null,
          baskets: [
            { row: 1, column: 1, length: 40, width: 40, height: 40, fill_ratio: 0.9 },
            { row: 1, column: 2, length: 40, width: 40, height: 40, fill_ratio: 0.9 },
            { row: 2, column: 1, length: 40, width: 40, height: 40, fill_ratio: 0.9 },
            { row: 2, column: 2, length: 40, width: 40, height: 40, fill_ratio: 0.9 }
          ]
        };
        res = await api.post("/carts/multi/", multiData);
      }
      log("[CartForm] POST success", res.status, res.data);
      try {
        onSuccess();
      } catch (stateErr) {
        console.error("[CartForm] onSuccess callback failed:", stateErr);
      }
    } catch (err: unknown) {
    // Sprawdzamy, czy błąd pochodzi z axios
    const errorData = (err as any)?.response?.data;
    console.error("BŁĄD API:", errorData);
    
    // Bezpieczne wyciąganie szczegółów błędu
    const errorMessage = typeof errorData?.detail === 'string' 
      ? errorData.detail 
      : JSON.stringify(errorData?.detail || "Serwer odrzucił dane");

    alert("Błąd: " + errorMessage);
  } finally {
    setLoading(false);
  }
  };

  return (
    <div className="p-10">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase italic leading-none">
            {editId ? 'Edycja' : 'Nowy Wózek'}
          </h2>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-2">
            {type === 'MULTI' ? 'Typ: Sekcyjny (Z koszykami)' : 'Typ: Standardowy (Bulk)'}
          </p>
        </div>
        <button onClick={onClose} className="text-slate-300 hover:text-red-500 font-bold">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {!editId && (
          <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
            {(['BULK', 'MULTI'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${type === t ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}
              >
                {t === 'BULK' ? 'Standard' : 'Z Koszykami'}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nazwa wózka</label>
          <input 
            required
            className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-600 rounded-2xl px-6 py-4 font-bold outline-none"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="NP. WÓZEK-A1"
          />
        </div>

        {type === 'BULK' ? (
          <div className="grid grid-cols-3 gap-4">
            {/* Wymiary dla wózka bez koszyków */}
            {(['l', 'w', 'h'] as const).map(d => (
              <div key={d} className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2">{d.toUpperCase()}</label>
                <input 
                  type="number"
                  className="w-full bg-slate-50 rounded-2xl px-4 py-3 font-bold outline-none"
                  value={dims[d]}
                  onChange={e => setDims({...dims, [d]: parseInt(e.target.value) || 0})}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 text-center">
            <p className="text-[10px] font-bold text-blue-600 uppercase">
              System wygeneruje automatycznie 4 sekcje (2x2).
            </p>
          </div>
        )}

        <button 
          disabled={loading}
          className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-black uppercase tracking-widest text-[11px] hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-100"
        >
          {loading ? 'Tworzenie...' : 'Zapisz w systemie'}
        </button>
      </form>
    </div>
  );
}