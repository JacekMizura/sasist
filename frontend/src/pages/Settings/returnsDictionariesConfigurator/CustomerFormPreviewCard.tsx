import type { ReturnModuleConfigDto } from "../../../types/returnModuleConfig";
import { RETURN_TYPE_ICONS, ORDER_SOURCE_ICONS } from "./constants";

type Props = {
  cfg: ReturnModuleConfigDto;
  selectedTypeCode: string | null;
  selectedSourceCode: string | null;
  onSelectType: (code: string) => void;
  onSelectSource: (code: string) => void;
};

export function CustomerFormPreviewCard({ cfg, selectedTypeCode, selectedSourceCode, onSelectType, onSelectSource }: Props) {
  const types = [...cfg.customer_return_types]
    .filter((t) => t.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
  const sources = [...cfg.order_sources]
    .filter((s) => s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  const activeType = selectedTypeCode ?? types[0]?.code ?? null;
  const activeSource = selectedSourceCode ?? sources[0]?.code ?? null;

  return (
    <section className="sticky top-4 rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Podgląd formularza klienta</h3>
        <p className="mt-1 text-xs text-slate-500">Symulacja wyboru powodu i źródła przy tworzeniu zwrotu.</p>
      </header>
      <div className="px-4 py-4">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
          <p className="mb-4 text-center text-xs font-bold uppercase tracking-widest text-slate-400">Formularz zwrotu</p>

          <fieldset className="mb-5">
            <legend className="mb-2 text-sm font-semibold text-slate-800">Powód zwrotu</legend>
            <ul className="space-y-2">
              {types.map((t, i) => (
                <li key={t.code}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-800 transition hover:border-slate-300">
                    <input
                      type="radio"
                      name="preview-return-type"
                      className="text-slate-900"
                      checked={activeType === t.code}
                      onChange={() => onSelectType(t.code)}
                    />
                    <span aria-hidden>{RETURN_TYPE_ICONS[i % RETURN_TYPE_ICONS.length]}</span>
                    <span>{t.label}</span>
                  </label>
                </li>
              ))}
              {types.length === 0 ? <li className="text-xs text-slate-400 italic">Brak aktywnych rodzajów</li> : null}
            </ul>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-800">Źródło zamówienia</legend>
            <ul className="space-y-2">
              {sources.map((s, i) => (
                <li key={s.code}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-800 transition hover:border-slate-300">
                    <input
                      type="radio"
                      name="preview-order-source"
                      className="text-slate-900"
                      checked={activeSource === s.code}
                      onChange={() => onSelectSource(s.code)}
                    />
                    <span aria-hidden>{ORDER_SOURCE_ICONS[i % ORDER_SOURCE_ICONS.length]}</span>
                    <span>{s.label}</span>
                  </label>
                </li>
              ))}
              {sources.length === 0 ? <li className="text-xs text-slate-400 italic">Brak aktywnych źródeł</li> : null}
            </ul>
          </fieldset>
        </div>
      </div>
    </section>
  );
}
