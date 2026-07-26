/**
 * UI stub — route `/waves` redirects to `/wms/picking` (Faza B).
 * File kept; backend wave APIs unchanged. Not mounted in App.tsx.
 */
import PageLayout from "../components/layout/PageLayout";
import { PageHeader } from "../components/layout/PageHeader";

export default function PickingWaves() {
  return (
    <PageLayout>
        <PageHeader title="Fale kompletacji" />
        <p className="text-slate-600">Zarządzanie falami pików.</p>
    </PageLayout>
  );
}
