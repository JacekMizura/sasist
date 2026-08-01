import type { CustomerRefundMethod } from "./customerReturnFormTypes";

export {
  ORDER_CASE_CONDITIONS,
  ORDER_CASE_RETURN_REASONS,
} from "../caseCreate/orderCaseCreateConstants";

export const CUSTOMER_REFUND_METHODS: { id: CustomerRefundMethod; label: string; hint: string }[] = [
  { id: "bank_transfer", label: "Przelew bankowy", hint: "Zwrot na konto bankowe" },
  { id: "store_credit", label: "Zwrot na saldo", hint: "Środki na koncie sklepu" },
  { id: "other", label: "Inna metoda", hint: "Ustalimy kontaktowo" },
];

export const CUSTOMER_RETURN_FIELD_CLASS =
  "h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3 text-[13px] text-slate-800 outline-none transition-[border-color,box-shadow] focus:border-slate-300 focus:ring-2 focus:ring-slate-100";

export const CUSTOMER_RETURN_TEXTAREA_CLASS =
  "w-full resize-none rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-[13px] text-slate-800 outline-none transition-[border-color,box-shadow] focus:border-slate-300 focus:ring-2 focus:ring-slate-100";

export const CUSTOMER_RETURN_LABEL_CLASS =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
