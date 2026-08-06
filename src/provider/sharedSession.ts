import type { TenantSessionToken } from '../api/client';

/**
 * Renew this long before expiry. A little wider than the client's own margin,
 * so the sharing decides when to renew and the clients find a live token rather
 * than each reaching for one.
 */
const RENEWAL_MARGIN_MS = 90_000;

/** The `exp` inside a JWT, in epoch ms. Unknown when it cannot be read. */
function expiryOf(token: string): number | undefined {
  try {
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** Whatever the integrator returned, as a token with an expiry we can compare. */
export function normaliseSession(
  result: string | TenantSessionToken,
): TenantSessionToken {
  if (typeof result === 'string') {
    return { token: result, expiresAt: expiryOf(result) };
  }
  const declared =
    result.expiresAt ??
    (result.expiresIn ? Date.now() + result.expiresIn * 1000 : undefined);
  return { ...result, expiresAt: declared ?? expiryOf(result.token) };
}

/**
 * One session for a whole tree of components.
 *
 * Every component in this library builds its own API client, and each of those
 * dedupes only its own renewals — so N clients ask for N tokens. Opening the
 * drawer fired three requests at the integrator's backend before anyone had
 * said a word. The sharing belongs where there is exactly one of something,
 * which is the provider, and not in each client, where there is not.
 *
 * `force` is what a client passes after the API refused the token it just used.
 * The cached answer is then known to be dead, so it is skipped: without that, a
 * shared cache would hand the refused token straight back and turn a
 * recoverable 401 into a widget that never speaks again.
 */
export function createSharedSession(
  source: () => Promise<string | TenantSessionToken>,
): (force?: boolean) => Promise<TenantSessionToken> {
  let value: TenantSessionToken | undefined;
  let inFlight: Promise<TenantSessionToken> | undefined;

  return (force = false) => {
    const stillGood =
      value &&
      (value.expiresAt === undefined ||
        value.expiresAt - Date.now() > RENEWAL_MARGIN_MS);
    if (stillGood && !force) return Promise.resolve(value!);

    if (!inFlight) {
      inFlight = Promise.resolve(source())
        .then((result) => {
          value = normaliseSession(result);
          return value;
        })
        .finally(() => {
          inFlight = undefined;
        });
    }
    return inFlight;
  };
}
