import { appFieldLabelClass, appInputClass } from "../../../components/app-shell";

type Props = {
  label: string;
  children: React.ReactNode;
  className?: string;
};

export function CompanyFormField({ label, children, className = "" }: Props) {
  return (
    <label className={`block min-w-0 ${className}`.trim()}>
      <span className={appFieldLabelClass}>{label}</span>
      {children}
    </label>
  );
}

export { appInputClass as companyInputClass };
