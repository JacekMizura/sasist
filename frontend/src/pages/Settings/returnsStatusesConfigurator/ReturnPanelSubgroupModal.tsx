import { useEffect, useState } from "react";

import { createReturnPanelSubgroup } from "../../../api/returnUiStatusApi";
import type { ReturnUiMainGroup } from "../../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { RETURN_MAIN_GROUP_LABELS, RETURN_MAIN_GROUP_ORDER } from "./constants";
import { ReturnsConfiguratorModalShell } from "./ReturnsConfiguratorModalShell";

const inp = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300";
const lab = "block text-xs font-medium text-slate-600";

type Props = {
  open: boolean;
  initialMainGroup?: ReturnUiMainGroup;
  warehouseId: number;
  onClose: () => void;
  onCreated: () => void;
};

export function ReturnPanelSubgroupModal({ open, initialMainGroup = "NEW", warehouseId, onClose, onCreated }: Props) {
  const [mainGroup, setMainGroup] = useState<ReturnUiMainGroup>(initialMainGroup);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMainGroup(initialMainGroup);
      setName("");
      setErr(null);
    }
  }, [open, initialMainGroup]);

  const onSubmit = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setErr(null);
    try {
      await createReturnPanelSubgroup(DAMAGE_TENANT_ID, { main_group: mainGroup, name: n }, warehouseId);
      onCreated();
      onClose();
    } catch {
      setErr("Nie udało się dodać podgrupy (nazwa musi być unikalna w grupie).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ReturnsConfiguratorModalShell
      open={open}
      busy={busy}
      title="Dodaj podgrupę"
      subtitle="Podgrupy organizuj statusy w panelu bocznym listy zwrotów."
      onClose={onClose}
      footer={
        <>
          <button type="button" disabled={busy} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-45"
            onClick={() => void onSubmit()}
          >
            {busy ? "Dodawanie…" : "Dodaj podgrupę"}
          </button>
        </>
      }
    >
      {err ? <p className="mb-3 text-sm text-red-700">{err}</p> : null}
      <label className={lab}>
        Grupa główna
        <select className={inp} value={mainGroup} onChange={(e) => setMainGroup(e.target.value as ReturnUiMainGroup)}>
          {RETURN_MAIN_GROUP_ORDER.map((g) => (
            <option key={g} value={g}>
              {RETURN_MAIN_GROUP_LABELS[g]}
            </option>
          ))}
        </select>
      </label>
      <label className={`${lab} mt-4`}>
        Nazwa podgrupy
        <input className={inp} value={name} placeholder="Np. Sklep, Magazyn…" onChange={(e) => setName(e.target.value)} />
      </label>
    </ReturnsConfiguratorModalShell>
  );
}
