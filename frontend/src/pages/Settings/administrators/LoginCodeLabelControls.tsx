import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Printer, RefreshCw } from "lucide-react";

import api from "../../../api/axios";
import { brandSoftButtonClass } from "../../../design-system/brandUi";
import {
  FORM_FIELD_DENSITY,
  FormField,
  FormHelperText,
  Input,
  Select,
} from "@/design-system";
import { DAMAGE_TENANT_ID } from "../../../constants/panelTenant";
import {
  downloadPdfBlob,
  generateBarcodeLoginCode,
  printOrDownloadUserLoginCode,
  renderUserLoginCodePdf,
} from "../../../utils/userLoginCodeLabel";

type LabelTpl = { id: number; name: string };

type Props = {
  userId: number | null;
  loginHint: string;
  firstName: string;
  lastName: string;
  code: string;
  onCodeChange: (v: string) => void;
  templateId: number | "";
  onTemplateIdChange: (v: number | "") => void;
};

export default function LoginCodeLabelControls({
  userId,
  loginHint,
  code,
  onCodeChange,
  templateId,
  onTemplateIdChange,
}: Props) {
  const [templates, setTemplates] = useState<LabelTpl[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .get<Array<{ id: number; name?: string }>>("/label-templates/by-type/user_login", {
        params: { tenant_id: DAMAGE_TENANT_ID },
      })
      .then((res) => {
        const rows = (res.data ?? []).map((r) => ({ id: r.id, name: r.name || `Szablon #${r.id}` }));
        setTemplates(rows);
      })
      .catch(() => setTemplates([]));
  }, []);

  const onGenerate = () => {
    onCodeChange(generateBarcodeLoginCode(loginHint));
  };

  const onPreviewOrPrint = async (mode: "preview" | "print") => {
    if (!code.trim()) {
      toast.error("Najpierw ustaw kod logowania.");
      return;
    }
    if (!userId) {
      toast.error("Zapisz użytkownika, aby wygenerować etykietę.");
      return;
    }
    if (templateId === "" && templates.length === 0) {
      toast.error("Brak szablonu typu „Kod logowania użytkownika”. Utwórz go w Szablonach etykiet.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "preview") {
        const blob = await renderUserLoginCodePdf({
          userId,
          templateId: templateId === "" ? null : Number(templateId),
        });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        await printOrDownloadUserLoginCode({
          userId,
          login: loginHint,
          templateId: templateId === "" ? null : Number(templateId),
        });
        toast.success("Wygenerowano PDF etykiety kodu logowania.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "NO_LOGIN_CODE") toast.error("Brak kodu logowania.");
      else if (msg === "NO_LOGIN_CODE_TEMPLATE") {
        toast.error("Brak szablonu etykiety dla kodu logowania (typ: user_login).");
      } else toast.error("Nie udało się wygenerować etykiety.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
      <FormField label="Kod logowania">
        <div className="flex gap-2">
          <Input
            density={FORM_FIELD_DENSITY}
            className="flex-1"
            value={code}
            onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
            placeholder="np. MAG123"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            title="Wygeneruj unikalny kod"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Generuj
          </button>
        </div>
        <FormHelperText>Identyfikator operatora (nie hasło). Musi być unikalny w systemie.</FormHelperText>
      </FormField>

      <FormField label="Szablon etykiety kodu logowania">
        <Select
          density={FORM_FIELD_DENSITY}
          value={templateId === "" ? "" : String(templateId)}
          onChange={(e) => onTemplateIdChange(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">— Domyślny / pierwszy dostępny —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        {templates.length === 0 ? (
          <FormHelperText className="text-amber-700">
            Brak szablonów typu „Kod logowania użytkownika”. Dodaj szablon w Szablonach etykiet i użyj zmiennej
            „Kod logowania”.
          </FormHelperText>
        ) : null}
      </FormField>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onPreviewOrPrint("preview")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Podgląd etykiety
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onPreviewOrPrint("print")}
          className={brandSoftButtonClass}
        >
          <Printer className="h-4 w-4" aria-hidden />
          Drukuj
        </button>
      </div>
    </div>
  );
}

/** Re-export helper for list menu (avoids unused import lint in this module). */
export { downloadPdfBlob };
