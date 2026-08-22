import type { ReactNode } from "react";
import { FORM_FIELD_DENSITY, FormField, Input } from "@/design-system";

type Props = {
  children: ReactNode;
  title?: string;
};

/** Pola tylko dla integratorów — domyślnie zwinięte. */
export function IntegrationsApiPanel({ children, title = "⋯ Opcje techniczne" }: Props) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer select-none text-xs font-medium text-slate-400 hover:text-slate-600">
        {title}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

/** @deprecated */
export const AdvancedSettingsPanel = IntegrationsApiPanel;

export function IntegrationsCodeField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <FormField label={label} helperText={hint}>
      <Input
        density={FORM_FIELD_DENSITY}
        className="font-mono text-xs"
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}

/** @deprecated */
export const AdvancedCodeField = IntegrationsCodeField;
