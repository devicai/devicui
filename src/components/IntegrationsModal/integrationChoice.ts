import { storage } from "../../utils";

/**
 * What the end user switched off, remembered between visits.
 *
 * Held in the browser and nowhere else: it is a preference of whoever is at
 * this keyboard, not of the tenant, and the server deliberately keeps nothing
 * beyond the turn it was sent for.
 *
 * The key names the assistant AND the tenant it was made under, because a
 * choice about one end user's Gmail means nothing to the next one — and a
 * widget that switched an app off for a colleague who happens to share a
 * browser profile would be a bug with a very long tail.
 */
const PREFIX = "devic:integrations:off";

export function integrationChoiceKey(
  assistantId: string,
  tenantId?: string,
  subtenantId?: string
): string {
  return `${PREFIX}:${assistantId}:${tenantId ?? ""}:${subtenantId ?? ""}`;
}

/** Reads the remembered list, tolerating anything that is not one. */
export function readIntegrationChoice(key: string): string[] {
  const stored = storage.get<unknown>(key);
  if (!Array.isArray(stored)) return [];
  return stored.filter((id): id is string => typeof id === "string" && !!id);
}

export function writeIntegrationChoice(key: string, disabled: string[]): void {
  // An empty list is the default, and leaving a `[]` behind in every visitor's
  // storage for every assistant they ever opened is litter.
  if (disabled.length === 0) storage.remove(key);
  else storage.set(key, disabled);
}

/**
 * Drops what is no longer on offer.
 *
 * Without this, remembering the choice would quietly reintroduce the bug the
 * switch was written to avoid: disconnect an app, connect it again months
 * later, and find it switched off for reasons nobody can reconstruct. The same
 * goes for an MCP server the tenant removed.
 *
 * Returns the SAME array when nothing was stale, so a caller can use identity
 * to avoid a pointless render.
 */
export function pruneIntegrationChoice(
  disabled: string[],
  liveIds: string[]
): string[] {
  if (disabled.length === 0) return disabled;
  const live = new Set(liveIds);
  const next = disabled.filter((id) => live.has(id));
  return next.length === disabled.length ? disabled : next;
}
