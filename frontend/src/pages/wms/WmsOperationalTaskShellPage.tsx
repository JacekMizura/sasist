import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Play } from "lucide-react";
import { getWmsOperationalTaskDetail } from "../../api/wmsOperationalTasksApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WMS_ROUTES } from "./wmsRoutes";
import { CrossdockFlowBanner } from "../../components/wms/operational/CrossdockFlowBanner";
import { OperationalWorkflowTimeline } from "../../components/wms/operational/OperationalWorkflowTimeline";
import { OperationalLiveStatusStrip } from "../../components/wms/operational/OperationalLiveStatusStrip";
import { nextOperationalAction } from "../../components/wms/operational/operationalWorkflow";
import { ScanExecutionShell } from "../../components/wms/execution/ScanExecutionShell";
import { ScanStepHero } from "../../components/wms/execution/ScanStepHero";
import { ExecutionBottomBar } from "../../components/wms/execution/ExecutionBottomBar";
import { ExecutionTouchButton } from "../../components/wms/execution/ExecutionTouchButton";
import { executionContextFromOperationalDetail } from "../../components/wms/execution/syncExecutionContext";
import { useWmsPageScanHandler } from "../../components/wms/execution/useWmsPageScanHandler";
import { useScanFeedback } from "../../components/wms/execution/useScanFeedback";
import { useAuth } from "../../context/AuthContext";
import { useWarehouseExecution } from "../../context/WarehouseExecutionContext";
import { formatOperatorDisplayName } from "../../components/wms/execution/activeOperationContext";
import { formatOperationalError } from "../../components/wms/execution/formatOperationalError";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

export default function WmsOperationalTaskShellPage() {
  const { taskId: taskIdParam } = useParams();
  const taskId = Number(taskIdParam);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setActiveContext } = useWarehouseExecution();
  const scanFx = useScanFeedback();

  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getWmsOperationalTaskDetail>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(taskId) || taskId < 1) return;
    setLoading(true);
    setErr(null);
    try {
      const d = await getWmsOperationalTaskDetail(DAMAGE_TENANT_ID, taskId);
      setDetail(d);
    } catch (e: unknown) {
      setDetail(null);
      setErr(formatOperationalError(e, "Nie udało się wczytać zadania operacyjnego."));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detail) return;
    setActiveContext(
      executionContextFromOperationalDetail(detail, {
        operatorName: detail.relocation_session?.operator_name ?? formatOperatorDisplayName(user),
      }),
    );
    return () => setActiveContext(null);
  }, [detail, setActiveContext, user]);

  const startRecollect = useCallback(() => {
    if (!detail?.order_id) return;
    scanFx.success("Start dogrywki");
    navigate(WMS_ROUTES.pickingRecovery(detail.order_id));
  }, [detail?.order_id, navigate, scanFx]);

  const onScan = useCallback(
    (raw: string) => {
      if (!detail) return;
      const code = normalizeScanEan(raw);
      if (!code) return;
      const ean = detail.product_ean?.trim();
      const sku = detail.product_sku?.trim();
      if (detail.task_type === "SHORTAGE_RECOLLECT" && detail.order_id) {
        if ((ean && code === ean) || (sku && code === sku) || code === String(detail.order_id)) {
          startRecollect();
          return;
        }
        scanFx.warning("Zeskanuj produkt z tego zadania lub użyj przycisku poniżej");
        return;
      }
      scanFx.warning("To zadanie nie wymaga skanu — czeka na system lub przyjęcie");
    },
    [detail, scanFx, startRecollect],
  );

  useWmsPageScanHandler(onScan, Boolean(detail));

  if (loading) {
    return (
      <div className="flex min-h-[50vh] justify-center py-20 bg-white">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (!detail) {
    return (
      <ScanExecutionShell title="Zadanie" backTo={WMS_ROUTES.operatorHome}>
        <p className="text-red-800 bg-white">{err ?? "Brak zadania."}</p>
      </ScanExecutionShell>
    );
  }

  const next = nextOperationalAction(detail);
  const isRecollect = detail.task_type === "SHORTAGE_RECOLLECT";
  const isWaiting = detail.task_type === "WAITING_SUPPLY";
  const rem = Math.max(0, (detail.quantity_required || 0) - (detail.quantity_done || 0));

  return (
    <ScanExecutionShell
      title={detail.product_name}
      backTo={WMS_ROUTES.operatorHome}
      bottom={
        isRecollect && detail.order_id ? (
          <ExecutionBottomBar>
            <ExecutionTouchButton variant="success" fullWidth onClick={startRecollect}>
              <Play size={18} />
              Start dogrywki zbierki
            </ExecutionTouchButton>
          </ExecutionBottomBar>
        ) : undefined
      }
    >
      <ScanStepHero
        title={next.label}
        scanHint={next.scanHint}
        sourceLabel={detail.picked_from_location ?? detail.location_hint}
        targetLabel={isWaiting ? "Magazyn / PZ" : isRecollect ? `Zam. ${detail.order_number ?? detail.order_id}` : undefined}
        remainingQty={rem}
      />

      <CrossdockFlowBanner detail={detail} />

      <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-black uppercase text-slate-500 bg-white">Status na żywo</p>
        <div className="mt-3 bg-white">
          <OperationalLiveStatusStrip task={detail} detail={detail} />
        </div>
      </section>

      <OperationalWorkflowTimeline detail={detail} />

      {isWaiting && (detail.payload_refs?.length ?? 0) > 0 ? (
        <section className="mt-3 rounded-2xl border border-amber-250 bg-white p-4">
          <p className="text-xs font-black uppercase text-amber-900 bg-white">Zamówienia czekające</p>
          <ul className="mt-2 space-y-1 text-sm bg-white">
            {(detail.payload_refs ?? []).slice(0, 12).map((r) => (
              <li key={`${r.order_id}:${r.order_item_id}`} className="flex justify-between bg-white">
                <span className="bg-white">Zam. #{r.order_id}</span>
                <span className="font-bold bg-white">{fmtQty(r.qty)} szt.</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </ScanExecutionShell>
  );
}