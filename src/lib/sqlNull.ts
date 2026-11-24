/**
 * Sends SQL NULL for an optional database-function argument whose generated
 * type only allows omitting it. The value reaches the server unchanged.
 */
export const sqlNull = <T,>(value: T | null | undefined): T | undefined => value as T | undefined;
