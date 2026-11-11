const DUPLICATE_KEY_ERROR_CODE = 11000;

/** True when MongoDB rejected a write because of a unique index. */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_ERROR_CODE
  );
}
