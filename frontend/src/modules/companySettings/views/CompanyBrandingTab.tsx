import { useId, useState } from "react";
import { CheckCircle2, Loader2, Trash2, Upload } from "lucide-react";

import { resolvePublicUploadUrl } from "../../../components/admin/AvatarUploadField";
import { BrandingSystemPreview } from "../components/BrandingSystemPreview";
import { useCompanySettings } from "../context/CompanySettingsContext";
import { companyCardClass, companyOrangeCtaClass } from "../companySettingsUi";

export default function CompanyBrandingTab() {
  const { profile, form, profileLoading, profileErr, logoBusy, onLogoFiles, removeLogo } = useCompanySettings();
  const logoInputId = useId();
  const [dragOver, setDragOver] = useState(false);

  const logoSrc = resolvePublicUploadUrl(profile?.logo_url ?? "");
  const companyName = form?.company_name?.trim() || profile?.company_name || "Firma";
  const hasLogo = Boolean(profile?.logo_url);

  if (profileLoading || !profile) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      {profileErr ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{profileErr}</div>
      ) : null}

      <section className={`${companyCardClass} p-5 sm:p-6`}>
        <div className="mb-5">
          <h2 className="text-base font-bold text-slate-900">Logo firmy</h2>
          <p className="mt-1 text-sm text-slate-500">
            PNG, JPG lub SVG • max 6 MB • zalecany obszar ok. 240×80 px.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
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
            className={`flex min-h-[260px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition ${
              hasLogo
                ? "border-teal-300 bg-teal-50/30"
                : dragOver
                  ? "border-orange-400 bg-orange-50/40"
                  : "border-slate-200 bg-slate-50/40"
            } ${logoBusy ? "pointer-events-none opacity-60" : ""}`}
          >
            {logoBusy ? (
              <Loader2 className="h-10 w-10 animate-spin text-orange-500" aria-hidden />
            ) : hasLogo ? (
              <>
                <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-500" strokeWidth={1.75} aria-hidden />
                <p className="text-center text-sm font-semibold text-slate-800">Plik został załadowany</p>
                <button
                  type="button"
                  className="mt-6 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                  onClick={() => void removeLogo()}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Usuń logo
                </button>
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
            ) : (
              <>
                <Upload className="mb-3 h-10 w-10 text-slate-400" aria-hidden />
                <p className="text-center text-sm font-semibold text-slate-800">Przeciągnij plik tutaj</p>
                <p className="mt-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  PNG, JPG lub SVG • max 6 MB
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  <label htmlFor={logoInputId} className={`${companyOrangeCtaClass} cursor-pointer`}>
                    <Upload className="h-4 w-4" aria-hidden />
                    Wybierz plik
                  </label>
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

          <div className="flex min-h-[260px] flex-col rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Podgląd na żywo</p>
            <div className="mt-4 flex flex-1 items-center justify-center rounded-lg border border-slate-100 bg-white p-8">
              {hasLogo ? (
                <img src={logoSrc} alt="Logo firmy" className="max-h-28 max-w-full object-contain" />
              ) : (
                <div className="text-center text-sm font-medium text-slate-400">Logo firmy</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={`${companyCardClass} p-5 sm:p-6`}>
        <div className="mb-5 flex items-start gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" aria-hidden />
          <div>
            <h2 className="text-base font-bold text-slate-900">Podgląd systemu</h2>
            <p className="mt-0.5 text-sm text-slate-500">Logowanie, sidebar i dokument z aktualnym brandingiem.</p>
          </div>
        </div>
        <BrandingSystemPreview logoSrc={hasLogo ? logoSrc : null} companyName={companyName} />
      </section>
    </div>
  );
}
