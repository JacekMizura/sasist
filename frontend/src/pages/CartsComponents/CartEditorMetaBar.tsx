import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { FORM_FIELD_DENSITY, FormField, FormLabel, Input, Select } from "../../design-system";
import { formatScanCodeLabel } from "../../modules/warehouse-structure/labels";
import CartImageUrlField from "./ui/CartImageUrlField";

type CartGroup = { id: number; name: string };

type Props = {
  cartId: number | null;
  cartName: string;
  cartCode: string;
  cartScanCode: string | null;
  imageUrl: string;
  groupId: number | null;
  availableGroups: CartGroup[];
  sectionCount: number;
  totalVolumeDm3: number;
  onNameChange: (v: string) => void;
  onCodeChange: (v: string) => void;
  onImageChange: (v: string) => void;
  onGroupChange: (id: number | null) => void;
  nameLabel: string;
  namePlaceholder: string;
  unassignedLabel: string;
};

export function CartEditorMetaBar({
  cartId,
  cartName,
  cartCode,
  cartScanCode,
  imageUrl,
  groupId,
  availableGroups,
  sectionCount,
  totalVolumeDm3,
  onNameChange,
  onCodeChange,
  onImageChange,
  onGroupChange,
  nameLabel,
  namePlaceholder,
  unassignedLabel,
}: Props) {
  const [techOpen, setTechOpen] = useState(false);

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
          <FormField label={nameLabel} htmlFor="cart-meta-name">
            <Input
              id="cart-meta-name"
              density={FORM_FIELD_DENSITY}
              className={`text-base font-semibold ${!cartName.trim() ? "border-red-300" : ""}`}
              value={cartName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={namePlaceholder}
            />
          </FormField>
          <FormField label={`Kod${cartId ? "" : " (opcjonalnie)"}`} htmlFor="cart-meta-code">
            <Input
              id="cart-meta-code"
              density={FORM_FIELD_DENSITY}
              className="font-mono"
              value={cartCode}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder={cartId ? "" : "Puste = wygeneruj kod"}
            />
          </FormField>
        </div>

        <div className="flex flex-wrap gap-2 text-[13px]">
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <span className="text-slate-500">Sekcje: </span>
            <span className="font-bold tabular-nums text-slate-900">{sectionCount}</span>
          </div>
          <div className="rounded-md border border-emerald-200/80 bg-emerald-50/50 px-3 py-2">
            <span className="text-emerald-800/80">Pojemność: </span>
            <span className="font-bold tabular-nums text-emerald-900">{totalVolumeDm3.toFixed(1)} dm³</span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setTechOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 hover:text-slate-900"
        >
          {techOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Informacje techniczne
        </button>
        {techOpen ? (
          <div className="mt-3 grid gap-4 rounded-lg border border-slate-200/90 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
            {cartId ? (
              <div>
                <FormLabel>Identyfikator</FormLabel>
                <p className="mt-1 font-mono text-sm tabular-nums text-slate-700">{cartId}</p>
              </div>
            ) : null}
            {cartScanCode ? (
              <div>
                <FormLabel>Kod terminala WMS</FormLabel>
                <p className="mt-1 font-mono text-sm text-slate-700">{formatScanCodeLabel(cartScanCode)}</p>
              </div>
            ) : null}
            <FormField label="Grupa wózków">
              <Select
                density={FORM_FIELD_DENSITY}
                value={groupId === null ? "" : String(groupId)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") onGroupChange(null);
                  else {
                    const n = Number(v);
                    onGroupChange(Number.isNaN(n) ? null : n);
                  }
                }}
              >
                <option value="">{unassignedLabel}</option>
                {availableGroups.map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="sm:col-span-2 lg:col-span-3">
              <FormLabel>Zdjęcie wózka</FormLabel>
              <div className="mt-1 max-w-md">
                <CartImageUrlField value={imageUrl} onChange={onImageChange} />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
