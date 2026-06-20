import { useEffect } from "react";
import toast from "react-hot-toast";

import { moduleAutomationShellClass } from "../../components/layout/flatSectionTokens";
import { moduleListEmptyStateClass } from "../../components/listPage/moduleList";
import { AutomationModuleActivatorSettingsForm } from "../../components/orders/automation/AutomationModuleActivatorSettingsForm";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../context/AuthContext";
import { useOrderAutomationModuleSettings } from "../../hooks/useOrderAutomationModuleSettings";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";

export default function OrderAutomationSettingsPage() {
  const { warehouse } = useWarehouse();
  const wid = warehouse?.id ?? null;
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("settings.automation");
  const { settings, hydrated, reload, updateSettings } = useOrderAutomationModuleSettings(DAMAGE_TENANT_ID, wid);

  useEffect(() => {
    reload();
  }, [reload]);

  if (wid == null) {
    return <p className="text-sm text-slate-600">Wybierz magazyn w nagłówku aplikacji.</p>;
  }

  if (!canWrite) {
    return (
      <p className="text-sm text-slate-600">
        Brak uprawnienia <span className="font-mono text-[11px]">settings.automation</span>.
      </p>
    );
  }

  if (!hydrated) {
    return <div className={moduleListEmptyStateClass}>Ładowanie ustawień…</div>;
  }

  return (
    <div className={`${moduleAutomationShellClass} w-full max-w-3xl`}>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">Ustawienia aktywatorów</h2>
        <p className="mt-1 text-sm text-slate-600">
          Parametry dotyczą wszystkich reguł z ręcznym uruchamianiem w tym magazynie. Zmiany zapisują się automatycznie.
        </p>
      </div>

      <AutomationModuleActivatorSettingsForm
        activatorType={settings.activatorType}
        conditionFilterMode={settings.conditionFilterMode}
        onChangeActivatorType={(v) => {
          updateSettings({ activatorType: v });
          toast.success("Zapisano.");
        }}
        onChangeConditionFilterMode={(v) => {
          updateSettings({ conditionFilterMode: v });
          toast.success("Zapisano.");
        }}
      />
    </div>
  );
}
