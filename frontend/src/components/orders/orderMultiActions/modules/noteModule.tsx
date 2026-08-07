import { StickyNote } from "lucide-react";

import type { OrderMultiModuleDef, OrderModuleCardProps } from "../types";
import { pmaInp, pmaLab } from "../uiTokens";

export type NoteConfig = {
  text: string;
};

function NoteCard({ config, onChange, disabled }: OrderModuleCardProps<NoteConfig>) {
  return (
    <label className={pmaLab}>
      Treść notatki
      <textarea
        className={`${pmaInp} min-h-[5rem]`}
        disabled={disabled}
        value={config.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="Notatka zostanie dopisana do każdego zamówienia."
      />
    </label>
  );
}

export const noteModule: OrderMultiModuleDef<NoteConfig> = {
  id: "note",
  label: "Notatka",
  group: "Inne",
  stage: 1,
  icon: StickyNote,
  defaultConfig: () => ({ text: "" }),
  validate: (cfg) => ((cfg.text ?? "").trim() ? null : "Wpisz treść notatki."),
  Card: NoteCard,
  toOps: (cfg) => [
    {
      kind: "add_note",
      config: { add_note: { text: cfg.text.trim() } },
    },
  ],
};
