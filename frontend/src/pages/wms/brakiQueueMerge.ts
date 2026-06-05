import type {
  OrderIssueTaskListItemApi,
  OrderIssueTaskSkippedItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import {
  normalizeShortageQueueCard,
  shortageCardFromSkipped,
  type NormalizedShortageQueueCard,
} from "./normalizeShortageQueueCard";

export type { NormalizedShortageQueueCard };

export function mergeQueueCards(
  tasks: OrderIssueTaskListItemApi[],
  skipped: OrderIssueTaskSkippedItemApi[],
): NormalizedShortageQueueCard[] {
  const seen = new Set<number>();
  const out: NormalizedShortageQueueCard[] = [];
  for (const t of tasks) {
    const card = normalizeShortageQueueCard(t);
    if (card.task_id > 0) {
      seen.add(card.task_id);
      out.push(card);
    }
  }
  for (const s of skipped) {
    if (seen.has(s.task_id)) continue;
    out.push(shortageCardFromSkipped(s));
  }
  return out;
}
