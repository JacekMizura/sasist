import type { WmsPackingOrderDetailApi, WmsPackingPostPackStepApi } from "../../../../api/wmsPackingApi";
import type { WmsPackingAutoActions } from "../../../../types/wmsPackingSettings";
import { packingCourierLabelCount } from "../packingHelpers";

export type AutoActionStepKey = "create_document" | "generate_shipment" | "change_order_status";

export type AutoActionStepUiState = "PENDING" | "RUNNING" | "SUCCESS" | "ERROR" | "SKIPPED";

export type AutoActionDisplayStep = {
  key: AutoActionStepKey;
  label: string;
  state: AutoActionStepUiState;
  message?: string | null;
};

const STEP_META: { key: AutoActionStepKey; label: string; setting: keyof WmsPackingAutoActions; pipeline: string[] }[] =
  [
    {
      key: "create_document",
      label: "Wystawiam dokument sprzedaży",
      setting: "create_document",
      pipeline: ["create_document"],
    },
    {
      key: "generate_shipment",
      label: "Generuję i drukuję list przewozowy",
      setting: "generate_shipment",
      pipeline: ["generate_shipment", "print_label"],
    },
    {
      key: "change_order_status",
      label: "Zmieniam status zamówienia",
      setting: "change_order_status",
      pipeline: ["change_order_status"],
    },
  ];

export function isPackingCashOnDelivery(detail: WmsPackingOrderDetailApi): boolean {
  const paymentMethodLower = (detail.payment_method_text ?? "").trim().toLowerCase();
  return (
    paymentMethodLower.includes("pobran") ||
    paymentMethodLower.includes("cash on delivery") ||
    paymentMethodLower.includes("cod")
  );
}

function findPipelineStep(
  pipeline: WmsPackingPostPackStepApi[] | null | undefined,
  names: string[],
): WmsPackingPostPackStepApi | undefined {
  if (!pipeline?.length) return undefined;
  const set = new Set(names);
  return pipeline.find((s) => set.has(s.step));
}

function stateFromPipeline(
  step: WmsPackingPostPackStepApi | undefined,
  finalized: boolean,
): AutoActionStepUiState {
  if (!step) return finalized ? "SKIPPED" : "PENDING";
  if (step.skipped) return "SKIPPED";
  if (step.ok) return "SUCCESS";
  return "ERROR";
}

/** Kroki widoczne wg włączonych akcji w ustawieniach pakowania. */
export function enabledAutoActionMetas(autoActions: WmsPackingAutoActions | null | undefined) {
  // Brak ustawień (ładowanie) → pełny zestaw, żeby uniknąć pustego flashu UI.
  if (autoActions == null) return STEP_META;
  return STEP_META.filter((m) => Boolean(autoActions[m.setting]));
}

/**
 * Buduje listę kroków do UI z konfiguracji + rzeczywistego pipeline POST …/finish.
 * Gdy `runningIndex` ≥ 0 (ekran finalizacji), pierwszy „żywy” krok jest RUNNING.
 */
export function buildAutoActionDisplaySteps(opts: {
  detail: WmsPackingOrderDetailApi;
  autoActions: WmsPackingAutoActions | null | undefined;
  pipeline?: WmsPackingPostPackStepApi[] | null;
  /** Indeks wśród włączonych kroków — tylko gdy finish jeszcze trwa. */
  runningIndex?: number | null;
  finishFailed?: boolean;
}): AutoActionDisplayStep[] {
  const finalized = Boolean(opts.detail.wms_packing_automation_finished_at);
  const metas = enabledAutoActionMetas(opts.autoActions);
  const runningIndex =
    opts.runningIndex != null && Number.isFinite(opts.runningIndex) ? Math.max(0, Math.floor(opts.runningIndex)) : null;

  return metas.map((meta, idx) => {
    const pipe = findPipelineStep(opts.pipeline, meta.pipeline);
    let state: AutoActionStepUiState;

    if (opts.finishFailed && runningIndex != null && idx === runningIndex) {
      state = "ERROR";
    } else if (pipe) {
      state = stateFromPipeline(pipe, finalized);
    } else if (runningIndex != null && !finalized) {
      if (idx < runningIndex) state = "SUCCESS";
      else if (idx === runningIndex) state = "RUNNING";
      else state = "PENDING";
    } else if (finalized) {
      // Fallback gdy pipeline nie zwrócił kroku — heurystyka jak wcześniej.
      if (meta.key === "create_document") {
        const label = (opts.detail.sales_document_label ?? "").trim();
        state = label ? "SUCCESS" : "SKIPPED";
      } else if (meta.key === "generate_shipment") {
        state = packingCourierLabelCount(opts.detail) > 0 ? "SUCCESS" : "SKIPPED";
      } else {
        state = "SUCCESS";
      }
    } else {
      state = "PENDING";
    }

    return {
      key: meta.key,
      label: meta.label,
      state,
      message: pipe?.message,
    };
  });
}

export const AUTO_ACTIONS_FINAL_SCAN =
  "Zeskanuj kolejny produkt, aby przejść do kolejnego zamówienia";

export const AUTO_ACTIONS_ORANGE = "#e65100";
export const AUTO_ACTIONS_NOTE_RED = "#d32f2f";
