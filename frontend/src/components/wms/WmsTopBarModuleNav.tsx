import { NavLink, useLocation } from "react-router-dom";
import { isWmsTabPathActive, type WmsTabConfigItem } from "../../pages/wms/wmsTabConfig";

type Props = {
  tabs: WmsTabConfigItem[];
  className?: string;
};

/**
 * Zwarte zakładki modułów WMS w pasku górnym: Czysty styl z pomarańczowym podkreśleniem (Underline Tab).
 */
export default function WmsTopBarModuleNav({ tabs, className }: Props) {
  const { pathname } = useLocation();

  return (
    <div className={["flex h-full items-center gap-1 sm:gap-2", className].filter(Boolean).join(" ")}>
      {tabs.map((tab) => {
        const active = isWmsTabPathActive(pathname, tab);
        return (
          <NavLink
            key={tab.id}
            to={tab.path}
            className={() =>
              [
                // Czysty styl bez tła, czcionka Bold. Pełna wysokość kontenera dla podkreślenia u dołu.
                "relative flex h-full items-center justify-center px-3 sm:px-4 text-xs sm:text-sm font-bold transition-colors duration-200 whitespace-nowrap",
                active
                  // Akcent pomarańczowy dla tekstu aktywnego taba
                  ? "text-orange-600"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50",
              ].join(" ")
            }
          >
            {tab.label}
            
            {/* Absolutnie pozycjonowany, zaokrąglony pasek pomarańczowy u dołu aktywnej zakładki */}
            {active && (
              <span className="absolute bottom-0 left-0 h-[3px] w-full bg-orange-500 rounded-t-md" />
            )}
          </NavLink>
        );
      })}
    </div>
  );
}