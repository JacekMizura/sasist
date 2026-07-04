import type { ListViewPresetRecord, SavePresetInput } from "./listViewStateTypes";

/** Binding passed to FilterActionsBar / FilterToolbar / FilterPanelBodyWithActions. */
export type ListViewActionsBinding = {
  presets: ListViewPresetRecord[];
  onApplyPreset: (preset: ListViewPresetRecord) => void;
  onSavePreset: (input: SavePresetInput) => Promise<void>;
  onDeletePreset: (presetId: number) => Promise<void>;
  onSetDefaultPreset: (presetId: number) => Promise<void>;
  onResetView: () => Promise<void>;
};

export function listViewActionsFromHook(hook: {
  presets: ListViewPresetRecord[];
  applyPreset: (preset: ListViewPresetRecord) => void;
  saveCurrentAsPreset: (input: SavePresetInput) => Promise<void>;
  deletePreset: (presetId: number) => Promise<void>;
  setDefaultPreset: (presetId: number) => Promise<void>;
  resetView: () => Promise<void>;
}): ListViewActionsBinding {
  return {
    presets: hook.presets,
    onApplyPreset: hook.applyPreset,
    onSavePreset: hook.saveCurrentAsPreset,
    onDeletePreset: hook.deletePreset,
    onSetDefaultPreset: hook.setDefaultPreset,
    onResetView: hook.resetView,
  };
}
