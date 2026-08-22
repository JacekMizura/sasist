import { useEffect, useState } from "react";
import { createReturnPanelSubgroup } from "../../../api/returnUiStatusApi";
import type { ReturnUiMainGroup } from "../../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { RETURN_MAIN_GROUP_LABELS, RETURN_MAIN_GROUP_ORDER } from "./constants";
import { ReturnsConfiguratorModalShell } from "./ReturnsConfiguratorModalShell";
import {
  FORM_FIELD_DENSITY,
  FormField,
  GhostButton,
  Input,
  PrimaryButton,
  Select,
} from "@/design-system";

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
          <GhostButton type="button" disabled={busy} onClick={onClose}>
            Anuluj
          </GhostButton>
          <PrimaryButton type="button" disabled={busy || !name.trim()} onClick={() => void onSubmit()}>
            {busy ? "Dodawanie…" : "Dodaj podgrupę"}
          </PrimaryButton>
        </>
      }
    >
      {err ? <p className="mb-3 text-sm text-red-700">{err}</p> : null}
      <FormField label="Grupa główna">
        <Select
          density={FORM_FIELD_DENSITY}
          value={mainGroup}
          onChange={(e) => setMainGroup(e.target.value as ReturnUiMainGroup)}
        >
          {RETURN_MAIN_GROUP_ORDER.map((g) => (
            <option key={g} value={g}>
              {RETURN_MAIN_GROUP_LABELS[g]}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Nazwa podgrupy" className="mt-4">
        <Input
          density={FORM_FIELD_DENSITY}
          value={name}
          placeholder="Np. Sklep, Magazyn…"
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
    </ReturnsConfiguratorModalShell>
  );
}
