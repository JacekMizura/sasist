import StickySaveBar from "./StickySaveBar";

export type WmsSettingsFooterProps = {
  visible: boolean;
  saving?: boolean;
  onCancel: () => void;
  onSave: () => void;
  className?: string;
};

/**
 * Shared sticky save / discard bar for all WMS settings modules.
 * Visible when any registered module reports dirty state.
 */
export function WmsSettingsFooter({
  visible,
  saving,
  onCancel,
  onSave,
  className = "-mx-4 sm:-mx-5",
}: WmsSettingsFooterProps) {
  return (
    <StickySaveBar
      className={className}
      visible={visible}
      saving={saving}
      onCancel={onCancel}
      onSave={onSave}
    />
  );
}
