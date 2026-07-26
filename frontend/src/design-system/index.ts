/**
 * Sasist Design System / UI Kit — public API.
 *
 * New UI must import from here (or `./components`, `./tokens`).
 * Do not invent local button / card / input recipes in feature modules.
 */

export * from "./tokens";
export * from "./components";
export * from "./warehouseChrome";

export {
  brandOrange,
  brandPrimaryButtonClass,
  brandSoftButtonClass,
  brandSoftPanelButtonClass,
  brandOutlineButtonClass,
  brandLinkTextClass,
  brandLinkButtonClass,
  brandFocusRingClass,
  brandTextAccentClass,
  brandSoftRowHoverClass,
  brandTabsNavItemClassName,
  brandTabsNavRowClassName,
  brandSidebarNavItemClassName,
  brandSidebarNavActiveBarClassName,
  brandSidebarNavIconClassName,
  brandSidebarNavChevronClassName,
} from "./brandUi";

export {
  pageShellGutterClass,
  pageShellSurfaceClass,
  pageShellPaddingClass,
  pageShellDividerClass,
  pageShellListBlockClass,
  pageShellEmptyStateClass,
  pageModuleTabsOffsetClass,
  pageModuleContentOffsetClass,
} from "./pageLayout";

export {
  PageContainer,
  PageContainer as PageLayout,
  PageGutter,
  pageContainerWidthAlignClass,
  type PageContainerProps,
} from "../components/layout/PageContainer";
