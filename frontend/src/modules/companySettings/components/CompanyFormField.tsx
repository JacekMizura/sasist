import { FormField, type FormFieldProps } from "@/design-system";

type Props = Omit<FormFieldProps, "label"> & {
  label: string;
};

/** Thin shim — prefer FormField from @/design-system in new code. */
export function CompanyFormField({ label, children, className = "", ...rest }: Props) {
  return (
    <FormField label={label} className={className} {...rest}>
      {children}
    </FormField>
  );
}
