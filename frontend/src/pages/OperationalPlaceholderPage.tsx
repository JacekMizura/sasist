import PageLayout from "../components/layout/PageLayout";
import { PageHeader } from "../components/layout/PageHeader";

export default function OperationalPlaceholderPage({ title }: { title: string }) {
  return (
    <PageLayout>
        <PageHeader title={title} />
        <p className="text-slate-600">Moduł w przygotowaniu.</p>
    </PageLayout>
  );
}
