import type { ReactNode } from "react";

import {
  TEMPLATES_LIST_TOOLBAR_ACTIONS_CLASS,
  TEMPLATES_LIST_TOOLBAR_CLASS,
  TEMPLATES_LIST_TOOLBAR_FILTERS_ROW_CLASS,
  TEMPLATES_LIST_TOOLBAR_SUBTITLE_CLASS,
  TEMPLATES_LIST_TOOLBAR_TITLE_CLASS,
  TEMPLATES_LIST_TOOLBAR_TITLE_ROW_CLASS,
} from "./templatesListLayout";

/**
 * Shared toolbar chrome for template list modules (Label System Layout Master).
 * Slot content only — spacing/typography come from templatesListLayout tokens.
 */
export default function TemplatesListToolbarShell({
  title,
  subtitle,
  actions,
  filters,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  filters?: ReactNode;
}) {
  return (
    <div className={TEMPLATES_LIST_TOOLBAR_CLASS}>
      <div className={TEMPLATES_LIST_TOOLBAR_TITLE_ROW_CLASS}>
        <div className="min-w-0 truncate">
          <h1 className={TEMPLATES_LIST_TOOLBAR_TITLE_CLASS}>{title}</h1>
          <p className={`${TEMPLATES_LIST_TOOLBAR_SUBTITLE_CLASS} truncate`}>{subtitle}</p>
        </div>
        {actions ? <div className={TEMPLATES_LIST_TOOLBAR_ACTIONS_CLASS}>{actions}</div> : null}
      </div>
      {filters ? <div className={TEMPLATES_LIST_TOOLBAR_FILTERS_ROW_CLASS}>{filters}</div> : null}
    </div>
  );
}
