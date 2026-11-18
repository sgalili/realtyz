// Shared demo account (0501234567). UI hides publishing; the database also blocks it.
export const VIEW_ONLY_DEMO_USER_ID = '5b59424b-e309-406e-bcc4-65735b2eca50';
export const isViewOnlyDemo = (userId?: string | null) => userId === VIEW_ONLY_DEMO_USER_ID;
