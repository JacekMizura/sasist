import { cartsBtnApply, cartsInputClass } from "./cartsModuleTokens";

type CartsInlineGroupFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  submitLabel: string;
};

export function CartsInlineGroupForm({
  value,
  onChange,
  onSubmit,
  placeholder,
  submitLabel,
}: CartsInlineGroupFormProps) {
  return (
    <div className="rounded-lg border border-slate-200/90 bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          autoFocus
          placeholder={placeholder}
          className={cartsInputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        />
        <button type="button" onClick={onSubmit} className={`${cartsBtnApply} shrink-0 sm:min-w-[7rem]`}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
