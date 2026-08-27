import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DevicApiError } from "../../api/client";
import { DevicApiClient } from "../../api/client";
import type { TenantMcpListing, TenantMcpServer } from "../../api/types";
import { useOptionalDevicContext } from "../../provider";
import type { IntegrationsScope } from "./useIntegrations";

export interface UseTenantMcpOptions extends IntegrationsScope {
  apiKey?: string;
  baseUrl?: string;
  /**
   * Fetch when this turns true, and only then. The modal passes its own open
   * state, so a panel nobody opens costs no request at all.
   */
  enabled?: boolean;
}

export interface TenantMcpState {
  servers: TenantMcpServer[];
  loading: boolean;
  error: string | null;
  /** Whether this assistant offers MCP servers to its tenants at all. */
  offered: boolean;
  /** Whether the end user may add a server of their own. */
  allowCustom: boolean;
  limits: { maxServers: number; maxToolsPerServer: number; used: number };
  /** True once a first answer (or refusal) has arrived. */
  settled: boolean;
  refresh: () => Promise<void>;
  client: DevicApiClient | null;
  scope: IntegrationsScope;
}

/** A 4xx here means "not for you", not "something broke". */
function isRefusal(err: unknown): boolean {
  const status = (err as DevicApiError)?.statusCode;
  return typeof status === "number" && status >= 400 && status < 500;
}

const NO_LIMITS = { maxServers: 0, maxToolsPerServer: 0, used: 0 };

/**
 * The MCP servers an assistant offers its tenants, together with the ones this
 * tenant has connected — loaded once and shared.
 *
 * Deliberately a sibling of `useIntegrations` rather than part of it: the two
 * answer different endpoints, and folding them together would mean an assistant
 * that offers only one of them pays for both on every open.
 */
export function useTenantMcp(options: UseTenantMcpOptions): TenantMcpState {
  const { assistantId, tenantId, subtenantId, apiKey, baseUrl, enabled = true } =
    options;

  const context = useOptionalDevicContext();
  const resolvedBaseUrl = baseUrl || context?.baseUrl || "https://api.devic.ai";
  const resolvedTenantId = tenantId || context?.tenantId;
  const resolvedSubtenantId = subtenantId || context?.subtenantId;
  const resolvedApiKey = apiKey || context?.apiKey;
  const resolvedTenantSession = context?.getTenantSession;
  const onSessionExpired = context?.onSessionExpired;

  const client = useMemo(
    () =>
      resolvedApiKey || resolvedTenantSession
        ? new DevicApiClient({
            apiKey: resolvedApiKey,
            baseUrl: resolvedBaseUrl,
            getTenantSession: resolvedTenantSession,
            onSessionExpired,
          })
        : null,
    [resolvedApiKey, resolvedTenantSession, resolvedBaseUrl]
  );

  const scope = useMemo(
    () => ({
      assistantId,
      tenantId: resolvedTenantId || undefined,
      subtenantId: resolvedSubtenantId || undefined,
    }),
    [assistantId, resolvedTenantId, resolvedSubtenantId]
  );

  const [listing, setListing] = useState<TenantMcpListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  const refresh = useCallback(async () => {
    if (!client) {
      setError("No credentials configured");
      setSettled(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setListing(await client.getMcpServers(scope));
    } catch (err) {
      setListing(null);
      setError(err instanceof Error ? err.message : String(err));
      if (!isRefusal(err)) {
        // A refusal is an ordinary answer — a disabled feature, a missing
        // tenant — and stays quiet. A 500 is not, and swallowing it would
        // leave an integrator with a panel that never appears and no reason.
        console.warn("[devic-ui] could not load MCP servers", err);
      }
    } finally {
      setLoading(false);
      setSettled(true);
    }
  }, [client, scope]);

  // Once per scope, not once per render of whatever switched it on. A different
  // tenant is a different listing, and the previous one is dropped first:
  // showing it while the new one arrives would name servers that are not this
  // user's.
  const key = `${client ? "k" : "-"}|${scope.assistantId}|${scope.tenantId ?? ""}|${scope.subtenantId ?? ""}`;
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || loadedKeyRef.current === key) return;
    if (loadedKeyRef.current !== null) {
      setListing(null);
      setSettled(false);
    }
    loadedKeyRef.current = key;
    void refresh();
  }, [enabled, key, refresh]);

  return {
    servers: listing?.servers ?? [],
    loading,
    error,
    // Offered only once the server has said so. Anything hanging off this stays
    // hidden until then, so nothing appears and then disappears.
    offered: !!listing?.offered,
    allowCustom: !!listing?.allowCustom,
    limits: listing?.limits ?? NO_LIMITS,
    settled,
    refresh,
    client,
    scope,
  };
}
