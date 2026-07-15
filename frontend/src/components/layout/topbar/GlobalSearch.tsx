import GlobalScanSearch from "../../search/GlobalScanSearch";

type Props = {
  className?: string;
  inputId?: string;
};

/** ERP top-bar search shell — logic lives in GlobalScanSearch (incl. Ctrl+K). */
export default function GlobalSearch({
  className = "",
  inputId = "main-panel-operational-search",
}: Props) {
  return <GlobalScanSearch variant="erpTopbar" inputId={inputId} className={className} />;
}
