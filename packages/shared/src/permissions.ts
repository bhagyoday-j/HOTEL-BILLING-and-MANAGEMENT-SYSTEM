/**
 * Role-based access control.
 *
 * The application has exactly two roles:
 *  - ADMIN (owner): full access, including manager accounts, analytics and settings.
 *  - MANAGER: daily operations only — manage menu items and create/view bills.
 *
 * Permissions are enforced server-side via `requirePermission(...)` in the
 * Express routes. Hiding buttons in the UI is a convenience only.
 */
export const ROLES = ['ADMIN', 'MANAGER'] as const;

export type RoleCode = (typeof ROLES)[number];

export const PERMISSIONS = [
  'MENU_VIEW',
  'MENU_MANAGE',
  'BILL_VIEW',
  'BILL_CREATE',
  'BILL_CANCEL',
  'ANALYTICS_VIEW',
  'MANAGER_MANAGE',
  'SETTINGS_MANAGE',
  'BACKUP_CREATE',
  'BACKUP_RESTORE',
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  ADMIN: [...PERMISSIONS],
  MANAGER: ['MENU_VIEW', 'MENU_MANAGE', 'BILL_VIEW', 'BILL_CREATE'],
};
