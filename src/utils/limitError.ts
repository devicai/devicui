import type { TenantLimitExceeded } from '../api/types';

/** A host's custom banner must not be bypassed by the same raw error above it.
 * Unrelated errors and errors with no rendered banner remain visible. */
export function isRenderedLimitError(error: (Error & { errorType?: string }) | null,
  limit: TenantLimitExceeded | null, bannerVisible: boolean): boolean {
  return !!(bannerVisible && error && limit &&
    (error.errorType === 'TENANT_LIMIT_EXCEEDED' || error.message === limit.message));
}
