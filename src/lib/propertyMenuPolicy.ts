/** Management menus use the same server-authorized owner path for owners and Super Admins. */
export const canManageListing = (isOwner: boolean, isSuperAdmin: boolean) => isOwner || isSuperAdmin;

/** The detail route follows the same management authorization instead of requiring a broker-only workspace. */
export const canOpenPropertyManagement = (propertiesAllowed: boolean, isSuperAdmin: boolean) => propertiesAllowed || isSuperAdmin;
