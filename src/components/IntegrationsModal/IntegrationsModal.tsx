import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { createPortal } from "react-dom";
import { DevicApiClient } from "../../api/client";
import type { Integration, IntegrationAccount } from "../../api/types";
import { useOptionalDevicContext } from "../../provider";
import { themeVars, type DevicTheme } from "../theme";
import "./IntegrationsModal.css";

/** Message the OAuth callback page posts back to this window when it is done. */
interface CallbackMessage {
  source?: string;
  type?: string;
  app?: string;
  status?: string;
  returnTo?: string;
}

export interface IntegrationsModalProps {
  /** Whether the modal is visible. */
  isOpen: boolean;
  onClose: () => void;
  /** Assistant whose offered apps are shown. */
  assistantId: string;
  /** Tenant of the end user (falls back to the provider's tenantId). */
  tenantId?: string;
  /** Subtenant of the end user (falls back to the provider's subtenantId). */
  subtenantId?: string;
  /** API key override (falls back to the provider's). */
  apiKey?: string;
  /** Base URL override (falls back to the provider's). */
  baseUrl?: string;
  /** Modal title. @default "Connected apps" */
  title?: string;
  /** Called after an account is connected or disconnected. */
  onChange?: (integrations: Integration[]) => void;
  /**
   * Colours and font. Same names as the drawer's style options, and the drawer
   * passes its own down — a dialog opening in the default light palette over a
   * themed application is the one thing this must not do.
   */
  theme?: DevicTheme;
}

function PlugIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </svg>
  );
}

/** A random value tying an OAuth round trip to the window that started it. */
function newNonce(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** How the card describes an app at a glance. */
function stateOf(integration: Integration): {
  key: "connected" | "reconnect" | "disconnected";
  label: string;
} {
  if (integration.connected) return { key: "connected", label: "Connected" };
  if (integration.accounts.some((a) => a.needsReconnect)) {
    return { key: "reconnect", label: "Needs reconnection" };
  }
  return { key: "disconnected", label: "Not connected" };
}

function accountLabel(account: IntegrationAccount): string {
  if (!account.connectedAt) return account.status.toLowerCase();
  const when = new Date(account.connectedAt);
  if (Number.isNaN(when.getTime())) return account.status.toLowerCase();
  return `connected ${when.toLocaleDateString()}`;
}

/**
 * Modal where the END USER of an application manages their *own* third-party
 * accounts: the apps the developer offered to tenants of this assistant, each
 * with the accounts this tenant has connected, and the buttons to add or
 * remove one.
 *
 * Backed by `/api/v1/tenant-integrations`, which resolves the tenant
 * server-side, so what is listed here is only ever this tenant's — never the
 * workspace-wide accounts an admin connected, and never another tenant's.
 *
 * Connecting opens the provider's consent screen in a popup. The popup is
 * opened empty *before* the request that produces its URL, because browsers
 * only honour `window.open` inside the gesture that triggered it: opening it
 * after the round trip is what gets it blocked. When it is blocked anyway, the
 * URL is offered as a link instead.
 */
export function IntegrationsModal({
  isOpen,
  onClose,
  assistantId,
  tenantId,
  subtenantId,
  apiKey,
  baseUrl,
  title = "Connected apps",
  onChange,
  theme,
}: IntegrationsModalProps): JSX.Element | null {
  const context = useOptionalDevicContext();
  const resolvedApiKey = apiKey || context?.apiKey;
  const resolvedBaseUrl = baseUrl || context?.baseUrl || "https://api.devic.ai";
  const resolvedTenantId = tenantId || context?.tenantId;
  const resolvedSubtenantId = subtenantId || context?.subtenantId;

  const client = useMemo(
    () =>
      resolvedApiKey
        ? new DevicApiClient({
            apiKey: resolvedApiKey,
            baseUrl: resolvedBaseUrl,
          })
        : null,
    [resolvedApiKey, resolvedBaseUrl]
  );

  const scopeOptions = useMemo(
    () => ({
      assistantId,
      tenantId: resolvedTenantId || undefined,
      subtenantId: resolvedSubtenantId || undefined,
    }),
    [assistantId, resolvedTenantId, resolvedSubtenantId]
  );

  const [loading, setLoading] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** App slug with a connect/disconnect in flight, so only its card is busy. */
  const [busyApp, setBusyApp] = useState<string | null>(null);
  /** Authorization URL surfaced as a link when the popup was blocked. */
  const [blockedUrl, setBlockedUrl] = useState<{ app: string; url: string } | null>(
    null
  );
  /**
   * Apps whose logo failed to load. The URL comes from the provider and is
   * fetched from whatever host it names, so a broken one is a matter of when,
   * not if — and a broken-image icon in someone else's product looks like our
   * bug.
   */
  const [brokenLogos, setBrokenLogos] = useState<string[]>([]);

  const refresh = useCallback(
    async (dropCache = false) => {
      if (!client) {
        setError("API key not configured");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        // The server caches a scope's connections briefly; after an OAuth round
        // trip that cache is exactly one step behind, so drop it first.
        if (dropCache) {
          await client.refreshIntegrations(scopeOptions).catch(() => undefined);
        }
        const list = await client.getIntegrations(scopeOptions);
        setIntegrations(list);
        onChange?.(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [client, scopeOptions, onChange]
  );

  // Fetch on every open: accounts may have been connected or revoked elsewhere.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setBlockedUrl(null);
      void refresh();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, refresh]);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  /** The round trip currently in flight, if any. */
  const pendingRef = useRef<{ app: string; returnTo: string } | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);

  const finishConnect = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pendingRef.current = null;
    popupRef.current = null;
    setBusyApp(null);
    void refresh(true);
  }, [refresh]);

  // The callback page tells us it is done. Treat the message as a nudge, never
  // as the result: what is displayed comes from re-reading the server, so a
  // forged message can at worst cause one redundant fetch.
  useEffect(() => {
    if (!isOpen) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as CallbackMessage | undefined;
      if (!data || data.source !== "devic") return;
      if (data.type !== "integration-connected") return;
      const pending = pendingRef.current;
      if (!pending || data.returnTo !== pending.returnTo) return;
      popupRef.current?.close();
      finishConnect();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isOpen, finishConnect]);

  // Stop polling if the modal goes away mid-flow.
  useEffect(
    () => () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    },
    []
  );

  const handleConnect = async (integration: Integration) => {
    if (!client || busyApp) return;
    setError(null);
    setBlockedUrl(null);
    setBusyApp(integration.app);

    const nonce = newNonce();
    const returnTo = `${window.location.origin}/?devic_oauth=${nonce}`;
    // Opened empty inside the click, navigated once the URL is known.
    const popup = window.open(
      "",
      "devic-oauth",
      "width=520,height=680,menubar=no,toolbar=no"
    );

    try {
      const { authorizationUrl } = await client.connectIntegration(
        integration.app,
        { ...scopeOptions, returnTo }
      );
      pendingRef.current = { app: integration.app, returnTo };
      if (popup && !popup.closed) {
        popupRef.current = popup;
        popup.location.href = authorizationUrl;
        // The user may close the popup without the callback ever posting back
        // — a cancelled consent screen, or a provider that lands somewhere
        // else. Watching for the close is what keeps the card from staying
        // busy forever.
        pollRef.current = window.setInterval(() => {
          if (popup.closed) finishConnect();
        }, 700);
      } else {
        // Blocked (Safari, in-app browsers, extensions): hand over the URL.
        setBlockedUrl({ app: integration.app, url: authorizationUrl });
        setBusyApp(null);
      }
    } catch (err) {
      popup?.close();
      pendingRef.current = null;
      setError(err instanceof Error ? err.message : String(err));
      setBusyApp(null);
    }
  };

  const handleDisconnect = async (app: string, account: IntegrationAccount) => {
    if (!client || busyApp) return;
    setBusyApp(app);
    setError(null);
    try {
      await client.disconnectIntegration(account.id, scopeOptions);
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyApp(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    // The variables go on the overlay, not on the modal: the backdrop is part
    // of the dialog, and a portal inherits nothing from the drawer that opened
    // it.
    <div
      className="devic-int-overlay"
      style={themeVars(theme)}
      onClick={onClose}
    >
      <div
        className="devic-int-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="devic-int-header">
          <h3 className="devic-int-title">
            <PlugIcon />
            {title}
          </h3>
          <button
            className="devic-int-close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="devic-int-body">
          {error && <div className="devic-int-error">{error}</div>}

          {blockedUrl && (
            <div className="devic-int-notice">
              Your browser blocked the pop-up.{" "}
              <a
                href={blockedUrl.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  pendingRef.current = null;
                  setBlockedUrl(null);
                }}
              >
                Open the authorisation page
              </a>{" "}
              and come back — then use Refresh.
            </div>
          )}

          {loading && integrations.length === 0 ? (
            <div className="devic-int-loading">Loading apps…</div>
          ) : integrations.length === 0 ? (
            <div className="devic-int-empty">
              No apps available here yet.
            </div>
          ) : (
            integrations.map((integration) => {
              const state = stateOf(integration);
              const busy = busyApp === integration.app;
              return (
                <div
                  key={integration.app}
                  className="devic-int-card"
                  data-state={state.key}
                >
                  <div className="devic-int-card-head">
                    {integration.logo &&
                    !brokenLogos.includes(integration.app) ? (
                      <img
                        className="devic-int-logo"
                        src={integration.logo}
                        alt=""
                        aria-hidden="true"
                        onError={() =>
                          setBrokenLogos((prev) =>
                            prev.includes(integration.app)
                              ? prev
                              : [...prev, integration.app]
                          )
                        }
                      />
                    ) : (
                      <span className="devic-int-logo devic-int-logo-fallback">
                        {integration.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="devic-int-card-text">
                      <div className="devic-int-name">{integration.name}</div>
                      <div className="devic-int-state">{state.label}</div>
                    </div>
                    <button
                      type="button"
                      className={`devic-int-btn${
                        state.key === "connected" ? "" : " devic-int-btn-primary"
                      }`}
                      onClick={() => handleConnect(integration)}
                      disabled={busy || !!busyApp}
                    >
                      {busy
                        ? "Waiting…"
                        : state.key === "disconnected"
                          ? "Connect"
                          : state.key === "reconnect"
                            ? "Reconnect"
                            : "Add account"}
                    </button>
                  </div>

                  {integration.description && (
                    <div className="devic-int-description">
                      {integration.description}
                    </div>
                  )}

                  {integration.accounts.length > 0 && (
                    <ul className="devic-int-accounts">
                      {integration.accounts.map((account) => (
                        <li key={account.id} className="devic-int-account">
                          <span
                            className="devic-int-dot"
                            data-ok={!account.needsReconnect}
                            aria-hidden="true"
                          />
                          <span className="devic-int-account-label">
                            {accountLabel(account)}
                            {account.needsReconnect && (
                              <span className="devic-int-account-warn">
                                {" "}
                                · reconnect required
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            className="devic-int-btn devic-int-btn-small devic-int-btn-danger"
                            onClick={() =>
                              handleDisconnect(integration.app, account)
                            }
                            disabled={!!busyApp}
                          >
                            Disconnect
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="devic-int-footer">
          <span>Only you can see and use the accounts you connect here.</span>
          <button
            type="button"
            className="devic-int-btn devic-int-btn-small"
            onClick={() => void refresh(true)}
            disabled={loading || !!busyApp}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default IntegrationsModal;
