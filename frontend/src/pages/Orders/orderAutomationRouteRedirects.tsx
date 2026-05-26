import { Navigate, useParams } from "react-router-dom";

/** Stare URL-e `/orders/automation/:id/edit` → kanonicznie pod `orders/`. */
export function RedirectLegacyAutomationRuleEdit() {
  const { ruleId } = useParams<{ ruleId: string }>();
  return <Navigate to={`/orders/automation/orders/${ruleId ?? ""}/edit`} replace />;
}

export function RedirectAssortmentRuleEditToInventory() {
  const { ruleId } = useParams<{ ruleId: string }>();
  return <Navigate to={`/orders/automation/inventory/${ruleId ?? ""}/edit`} replace />;
}
