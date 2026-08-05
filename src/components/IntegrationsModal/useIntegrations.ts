import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DevicApiClient } from "../../api/client";
import type { DevicApiError } from "../../api/client";
import type { Integration } from "../../api/types";
import { useOptionalDevicContext } from "../../provider";

/** What identifies the end user in front of the widget. */
export interface IntegrationsScope {
  assistantId: string;
  tenantId?: string;
  subtenantId?: string;
}

export interface UseIntegrationsOptions extends IntegrationsScope {
  /** API key override (falls back to the provider's). */
  apiKey?: string;
  /** Base URL override (falls back to the provider's). */
  baseUrl?: string;
  /**
   * Fetch when this turns true, and only then. The launcher passes the drawer's
   * open state so a widget nobody opens costs no request at all.
   */
  enabled?: boolean;
}

export interface IntegrationsState {
  integrations: Integration[];
  loading: boolean;
  error: string | null;
  /**
   * Whether this assistant offers connected apps to its tenants at all.
   *
   * False before the first answer arrives, and false again if the server said
   * no — which it does for a disabled catalogue, a missing tenant, and an
   * assistant that does not exist, deliberately without distinguishing them.
   * Anything that hangs off this flag stays hidden until the server has said
   * yes, so nothing ever appears and then disappears.
   */
  offered: boolean;
  /** True once a first answer (or refusal) has arrived. */
  settled: boolean;
  refresh: (dropCache?: boolean) => Promise<void>;
  client: DevicApiClient | null;
  scope: IntegrationsScope;
}

/** A 4xx here means "not for you", not "something broke". */
function isRefusal(err: unknown): boolean {
  const status = (err as DevicApiError)?.statusCode;
  return typeof status === "number" && status >= 400 && status < 500;
}

/**
 * The apps an assistant offers to its tenants, with the accounts THIS tenant
 * has connected — loaded once and shared.
 *
 * Both the header button and the modal need the same listing: the button to
 * know whether it should exist and which logos to show, the modal to fill
 * itself. Fetching it in each of them would double every round trip and let the
 * two disagree for a moment after connecting an account.
 */
export function useIntegrations(
  options: UseIntegrationsOptions
): IntegrationsState {
  const {
    assistantId,
    tenantId,
    subtenantId,
    apiKey,
    baseUrl,
    enabled = true,
  } = options;

  const context = useOptionalDevicContext();
  const resolvedApiKey = apiKey || context?.apiKey;
  const resolvedBaseUrl = baseUrl || context?.baseUrl || "https://api.devic.ai";
  const resolvedTenantId = tenantId || context?.tenantId;
  const resolvedSubtenantId = subtenantId || context?.subtenantId;

  const client = useMemo(
    () =>
      resolvedApiKey
        ? new DevicApiClient({ apiKey: resolvedApiKey, baseUrl: resolvedBaseUrl })
        : null,
    [resolvedApiKey, resolvedBaseUrl]
  );

  const scope = useMemo(
    () => ({
      assistantId,
      tenantId: resolvedTenantId || undefined,
      subtenantId: resolvedSubtenantId || undefined,
    }),
    [assistantId, resolvedTenantId, resolvedSubtenantId]
  );

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offered, setOffered] = useState(false);
  const [settled, setSettled] = useState(false);

  const refresh = useCallback(
    async (dropCache = false) => {
      if (!client) {
        setError("API key not configured");
        setSettled(true);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        // The server caches a scope's connections briefly; after an OAuth round
        // trip that cache is exactly one step behind, so drop it first.
        if (dropCache) {
          await client.refreshIntegrations(scope).catch(() => undefined);
        }
        const list = await client.getIntegrations(scope);
        setIntegrations(list);
        setOffered(list.length > 0);
      } catch (err) {
        setIntegrations([]);
        setOffered(false);
        setError(err instanceof Error ? err.message : String(err));
        if (!isRefusal(err)) {
          // A refusal is an ordinary answer and stays quiet. A 500 or a dead
          // network is not, and swallowing it entirely would leave an
          // integrator with a button that never appears and no reason why.
          console.warn("[devic-ui] could not load connected apps", err);
        }
      } finally {
        setLoading(false);
        setSettled(true);
      }
    },
    [client, scope]
  );

  // Once per scope, not once per render of whatever switched it on. A new
  // assistant or tenant is a different listing altogether, so it loads again —
  // and the previous tenant's apps are dropped first, because showing them
  // while the new ones arrive would name accounts that are not this user's.
  const key = `${client ? "k" : "-"}|${scope.assistantId}|${scope.tenantId ?? ""}|${scope.subtenantId ?? ""}`;
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || loadedKeyRef.current === key) return;
    if (loadedKeyRef.current !== null) {
      setIntegrations([]);
      setOffered(false);
      setSettled(false);
    }
    loadedKeyRef.current = key;
    void refresh();
  }, [enabled, key, refresh]);

  return {
    integrations,
    loading,
    error,
    offered,
    settled,
    refresh,
    client,
    scope,
  };
}
