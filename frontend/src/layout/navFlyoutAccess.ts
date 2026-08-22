import type { NavCategoryConfig, NavFlyoutLinkConfig } from "./mainNavConfig";
import { isSuperRole } from "../auth/isSuperRole";

/** Mirror NavFlyoutPanel FlyoutRow visibility rules. */
export function navFlyoutItemVisible(
  item: NavFlyoutLinkConfig,
  hasPermission: (key: string) => boolean,
  userRole: string | undefined,
): boolean {
  if (item.superRoleOnly && !isSuperRole(userRole ?? "")) {
    return false;
  }
  const anyPerms = item.permissionsAny?.filter(Boolean) ?? [];
  if (anyPerms.length > 0) {
    return anyPerms.some((k) => hasPermission(k)) || isSuperRole(userRole ?? "");
  }
  return !item.permission || hasPermission(item.permission) || isSuperRole(userRole ?? "");
}

export function categoryHasVisibleFlyoutItems(
  category: NavCategoryConfig,
  hasPermission: (key: string) => boolean,
  userRole: string | undefined,
): boolean {
  for (const section of category.flyoutSections) {
    for (const item of section.items) {
      if (navFlyoutItemVisible(item, hasPermission, userRole)) return true;
    }
  }
  return false;
}

/** Any mail module permission — used to show sidebar category when user has partial access. */
export const MAIL_NAV_PERMISSIONS_ANY = [
  "mail.view",
  "mail.reply",
  "mail.manage_accounts",
  "mail.manage_templates",
  "mail.manage_conversations",
] as const;

export function userCanSeePocztaNav(hasPermission: (key: string) => boolean, userRole: string | undefined): boolean {
  if (isSuperRole(userRole ?? "")) return true;
  return MAIL_NAV_PERMISSIONS_ANY.some((k) => hasPermission(k));
}
