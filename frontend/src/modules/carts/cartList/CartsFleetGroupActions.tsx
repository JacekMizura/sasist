import {
  filterToolbarBtnApply,
  filterToolbarBtnSecondary,
} from "../../../components/filters/filterUiTokens";
import { listSellasistInputClass } from "../../../components/listPage/listSellasistTokens";
import { cartsDangerBtnClass } from "../cartsModuleTokens";

type Props = {
  editing: boolean;
  editingName: string;
  onEditingNameChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDeleteGroup: () => void;
  onAddCart: () => void;
  editLabel: string;
  deleteLabel: string;
  addCartLabel: string;
  saveLabel: string;
  cancelLabel: string;
};

export function CartsFleetGroupActions({
  editing,
  editingName,
  onEditingNameChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onDeleteGroup,
  onAddCart,
  editLabel,
  deleteLabel,
  addCartLabel,
  saveLabel,
  cancelLabel,
}: Props) {
  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${listSellasistInputClass} !h-9 w-auto min-w-[10rem] max-w-[14rem]`}
          value={editingName}
          onChange={(e) => onEditingNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSaveEdit()}
        />
        <button type="button" onClick={onSaveEdit} className={filterToolbarBtnApply}>
          {saveLabel}
        </button>
        <button type="button" onClick={onCancelEdit} className={filterToolbarBtnSecondary}>
          {cancelLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onStartEdit} className={filterToolbarBtnSecondary}>
        {editLabel}
      </button>
      <button type="button" onClick={onDeleteGroup} className={cartsDangerBtnClass}>
        {deleteLabel}
      </button>
      <button type="button" onClick={onAddCart} className={filterToolbarBtnApply}>
        {addCartLabel}
      </button>
    </div>
  );
}
