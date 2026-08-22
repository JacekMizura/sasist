import { Plus } from "lucide-react";

import { FORM_FIELD_DENSITY, FormField, Input } from "../../design-system";

type Props = {
  rowNumber: number;
  basketCount: number;
  length: number;
  width: number;
  height: number;
  onRowNumberChange: (n: number) => void;
  onBasketCountChange: (n: number) => void;
  onLengthChange: (n: number) => void;
  onWidthChange: (n: number) => void;
  onHeightChange: (n: number) => void;
  onAddRow: () => void;
  rowNumberLabel: string;
  basketsInRowLabel: string;
  lengthLabel: string;
  widthLabel: string;
  heightLabel: string;
  addRowButtonLabel: string;
};

export function CartRowAddToolbar({
  rowNumber,
  basketCount,
  length,
  width,
  height,
  onRowNumberChange,
  onBasketCountChange,
  onLengthChange,
  onWidthChange,
  onHeightChange,
  onAddRow,
  rowNumberLabel,
  basketsInRowLabel,
  lengthLabel,
  widthLabel,
  heightLabel,
  addRowButtonLabel,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200/90 bg-white px-4 py-3">
      <FormField label={rowNumberLabel} className="w-[5.5rem]">
        <Input
          type="number"
          density={FORM_FIELD_DENSITY}
          min={1}
          className="tabular-nums"
          value={rowNumber}
          onChange={(e) => onRowNumberChange(Math.max(1, Number(e.target.value) || 1))}
        />
      </FormField>
      <FormField label={basketsInRowLabel} className="w-[5.5rem]">
        <Input
          type="number"
          density={FORM_FIELD_DENSITY}
          min={1}
          max={20}
          className="tabular-nums"
          value={basketCount}
          onChange={(e) => onBasketCountChange(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
        />
      </FormField>
      <FormField label={lengthLabel} className="w-[5.5rem]">
        <Input
          type="number"
          density={FORM_FIELD_DENSITY}
          min={1}
          className="tabular-nums"
          value={length}
          onChange={(e) => onLengthChange(Math.max(1, Number(e.target.value) || 0))}
        />
      </FormField>
      <FormField label={widthLabel} className="w-[5.5rem]">
        <Input
          type="number"
          density={FORM_FIELD_DENSITY}
          min={1}
          className="tabular-nums"
          value={width}
          onChange={(e) => onWidthChange(Math.max(1, Number(e.target.value) || 0))}
        />
      </FormField>
      <FormField label={heightLabel} className="w-[5.5rem]">
        <Input
          type="number"
          density={FORM_FIELD_DENSITY}
          min={1}
          className="tabular-nums"
          value={height}
          onChange={(e) => onHeightChange(Math.max(1, Number(e.target.value) || 0))}
        />
      </FormField>
      <button
        type="button"
        onClick={onAddRow}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
      >
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
        {addRowButtonLabel}
      </button>
    </div>
  );
}
