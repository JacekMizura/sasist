import { useId, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";

import { resolvePublicUploadUrl } from "../../../components/admin/AvatarUploadField";
import { AppButton } from "../../../components/app-shell";
import { PurchasingPageShell, PurchasingTableSection, purchasingBtnPrimary } from "../../purchasing/ui";
import { BrandingSystemPreview } from "../components/BrandingSystemPreview";
import { useCompanySettings } from "../context/CompanySettingsContext";

export default function CompanyBrandingTab() {
  const { profile, form, profileLoading, profileErr, logoBusy, onLogoFiles, removeLogo } = useCompanySettings();
  const logoInputId = useId();
  const [dragOver, setDragOver] = useState(false);

  const logoSrc = resolvePublicUploadUrl(profile?.logo_url ?? "");
  const companyName = form?.company_name?.trim() || profile?.company_name || "Firma";

  return (
    <PurchasingPageShell
      status={
        profileErr ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{profileErr}</div>
        ) : null
      }
      table={
        profileLoading || !profile ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-slate-400" aria-hidden />
          </div>
        ) : (
          <>
            <PurchasingTableSection title="Logo firmy" subtitle="PNG, JPG lub SVG · max 6 MB · zalecany obszar ok. 240×80 px." indicatorClass="bg-slate-700">
              <div className="grid gap-6 px-4 py-5 lg:grid-cols-2">
                <div
                  role="presentation"
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    void onLogoFiles(e.dataTransfer.files);
                  }}
                  className={`flex min-h-[240px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition ${
                    dragOver ? "border-orange-400 bg-orange-50/40" : "border-slate-200 bg-slate-50/50"
                  } ${logoBusy ? "pointer-events-none opacity-60" : ""}`}
                >
                  {logoBusy ? (
                    <Loader2 className="h-10 w-10 animate-spin text-orange-500" aria-hidden />
                  ) : (
                    <>
                      <Upload className="mb-3 h-10 w-10 text-slate-400" aria-hidden />
                      <p className="text-center text-sm font-semibold text-slate-800">Przeciągnij plik tutaj</p>
                      <p className="mt-1 text-center text-xs text-slate-500">PNG, JPG lub SVG · max 6 MB</p>
                      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                        <label htmlFor={logoInputId} className={`${purchasingBtnPrimary} inline-flex cursor-pointer items-center gap-2 px-4 py-2`}>
                          <Upload className="h-4 w-4" aria-hidden />
                          Wybierz plik
                        </label>
                        {profile.logo_url ? (
                          <AppButton variant="secondary" onClick={() => void removeLogo()}>
                            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
                            Usuń logo
                          </AppButton>
                        ) : null}
                      </div>
                      <input
                        id={logoInputId}
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        className="sr-only"
                        disabled={logoBusy}
                        onChange={(e) => {
                          void onLogoFiles(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </>
                  )}
                </div>

                <div className="flex min-h-[240px] flex-col rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Podgląd na żywo</p>
                  <div className="mt-4 flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white p-8">
                    {profile.logo_url ? (
                      <img src={logoSrc} alt="Logo firmy" className="max-h-28 max-w-full object-contain" />
                    ) : (
                      <div className="text-center text-sm text-slate-400">Brak logo — wgraj plik po lewej stronie.</div>
                    )}
                  </div>
                </div>
              </div>
            </PurchasingTableSection>

            <PurchasingTableSection
              title="Podgląd systemu"
              subtitle="Logowanie, sidebar i dokument z aktualnym brandingiem."
              indicatorClass="bg-orange-500"
              className="mt-4"
            >
              <div className="px-4 py-5">
                <BrandingSystemPreview logoSrc={profile.logo_url ? logoSrc : null} companyName={companyName} />
              </div>
            </PurchasingTableSection>
          </>
        )
      }
    />
  );
}
