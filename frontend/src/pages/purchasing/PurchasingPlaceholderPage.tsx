type PurchasingPlaceholderPageProps = {
  title: string;
  description: string;
};

/** In-module placeholder (no extra PageLayout — parent PurchasingLayout already provides chrome). */
export default function PurchasingPlaceholderPage({ title, description }: PurchasingPlaceholderPageProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div>
  );
}
