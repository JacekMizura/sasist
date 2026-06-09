import { NavLink, useLocation } from "react-router-dom";

import { isWmsTabPathActive, type WmsTabConfigItem } from "../../pages/wms/wmsTabConfig";

type Props = {
  tabs: WmsTabConfigItem[];
  className?: string;
};

/** Przypięte moduły — pills z aktywnym wskaźnikiem (minimal ERP). */
export default function WmsTopBarModuleNav({ tabs, className }: Props) {
  const { pathname } = useLocation();

  if (tabs.length === 0) {
    return (
      <span className="hidden px-2 text-xs text-slate-400 sm:inline">
        Przypnij moduły w menu startowym
      </span>
    );
  }

  return (
    <div className={["flex items-center gap-1 overflow-x-auto no-scrollbar", className].filter(Boolean).join(" ")}>
      {tabs.map((tab) => {
        const active = isWmsTabPathActive(pathname, tab);
        const Icon = tab.icon;
        return (
          <NavLink
            key={tab.id}
            to={tab.path}
            title={tab.label}
            className={[
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200",
              active
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            ].join(" ")}
          >
            <Icon size={14} strokeWidth={2.25} aria-hidden className={active ? "text-white" : "text-slate-400"} />
            <span className="max-w-[8rem] truncate sm:max-w-[10rem]">{tab.label}</span>
          </NavLink>
        );
      })}
    </div>
  );
}
