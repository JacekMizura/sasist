import { memo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

function PurchasingFilterBarInner({ children, actions, footer, className = "" }: Props) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${className}`.trim()}>
      <div className="flex flex-wrap items-end gap-2">
        {children}
        {actions ? <div className="ml-auto flex flex-wrap items-end gap-2">{actions}</div> : null}
      </div>
      {footer ? <div className="mt-2 border-t border-slate-100 pt-2">{footer}</div> : null}
    </div>
  );
}

export const PurchasingFilterBar = memo(PurchasingFilterBarInner);

type FieldProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

function PurchasingFilterFieldInner({ label, children, className = "" }: FieldProps) {
  return (
    <div className={`flex min-w-[140px] flex-col gap-1 ${className}`.trim()}>
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </div>
  );
}

export const PurchasingFilterField = memo(PurchasingFilterFieldInner);

export {
  purchasingBtnPrimary as purchasingFilterPrimaryButtonClass,
  purchasingBtnSecondary as purchasingFilterButtonClass,
} from "./purchasingButtonTokens";
