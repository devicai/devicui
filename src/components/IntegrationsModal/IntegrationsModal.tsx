import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { createPortal } from "react-dom";
import type { DevicApiError } from "../../api/client";
import type {
  Integration,
  IntegrationAccount,
  IntegrationAuthScheme,
  IntegrationSetupRequired,
} from "../../api/types";
import { isDarkTheme, themeVars, type DevicTheme } from "../theme";
import { ConnectFieldsForm } from "./ConnectFieldsForm";
import { IntegrationLogo } from "./IntegrationLogo";
import { useIntegrations, type IntegrationsState } from "./useIntegrations";
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
  /** Search field placeholder. @default "Search connected apps" */
  searchPlaceholder?: string;
  /** Called after an account is connected or disconnected. */
  onChange?: (integrations: Integration[]) => void;
  /**
   * Colours and font. Same names as the drawer's style options, and the drawer
   * passes its own down — a dialog opening in the default light palette over a
   * themed application is the one thing this must not do.
   */
  theme?: DevicTheme;
  /**
   * Listing loaded elsewhere (see `useIntegrations`). The drawer already has to
   * load it to decide whether its button exists, and passing it down is what
   * keeps opening the modal from asking for the very same thing again.
   */
  state?: IntegrationsState;
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

function SearchIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
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

function matches(integration: Integration, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    integration.name.toLowerCase().includes(q) ||
    integration.app.toLowerCase().includes(q) ||
    (integration.description ?? "").toLowerCase().includes(q)
  );
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
  searchPlaceholder = "Search connected apps",
  onChange,
  theme,
  state,
}: IntegrationsModalProps): JSX.Element | null {
  // Hooks cannot be skipped, so the fallback is always built and only fetches
  // when nobody handed a listing down.
  const own = useIntegrations({
    assistantId,
    tenantId,
    subtenantId,
    apiKey,
    baseUrl,
    enabled: isOpen && !state,
  });
  const { integrations, loading, error: loadError, refresh, client, scope } =
    state ?? own;

  /** Errors from connecting or disconnecting, kept apart from load failures. */
  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? loadError;
  /** App slug with a connect/disconnect in flight, so only its card is busy. */
  const [busyApp, setBusyApp] = useState<string | null>(null);
  /** Authorization URL surfaced as a link when the popup was blocked. */
  const [blockedUrl, setBlockedUrl] = useState<{ app: string; url: string } | null>(
    null
  );
  /** The app whose credentials are being asked for, with what the server asked
   *  and every way it can be connected. Rendered inside that app's own card,
   *  where the user pressed Connect. */
  const [setupPrompt, setSetupPrompt] = useState<{
    app: string;
    setup: IntegrationSetupRequired;
    schemes: IntegrationAuthScheme[];
  } | null>(null);
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => integrations.filter((i) => matches(i, query)),
    [integrations, query]
  );

  // Report the listing without making the caller's identity part of the
  // dependency: an inline arrow would fire this on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (integrations.length) onChangeRef.current?.(integrations);
  }, [integrations]);

  // Reopening starts clean, and re-reads: accounts may have been connected or
  // revoked elsewhere since the last look.
  const wasOpenRef = useRef(false);
  const openedBeforeRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setBlockedUrl(null);
      setActionError(null);
      setSetupPrompt(null);
      setQuery("");
      // The very first open of an uncontrolled modal is already covered by the
      // hook switching on; asking again here would double every first open.
      if (state || openedBeforeRef.current) void refresh();
      openedBeforeRef.current = true;
    }
    wasOpenRef.current = isOpen;
    // `state.refresh` is stable per scope; re-running on every render of the
    // owner is exactly what this must not do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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

  /**
   * Connects an app, asking for credentials only if it needs them.
   *
   * Optimistic: the request goes out first, and the form appears only when the
   * server answers that something is missing. Most apps take an API key rather
   * than an OAuth round trip, so this is the path that used to fail outright.
   */
  const handleConnect = async (
    integration: Integration,
    values?: { authScheme: string; accountFields: Record<string, string> }
  ) => {
    if (!client || (busyApp && busyApp !== integration.app)) return;
    setActionError(null);
    setBlockedUrl(null);
    setBusyApp(integration.app);

    const nonce = newNonce();
    const returnTo = `${window.location.origin}/?devic_oauth=${nonce}`;
    // Opened empty inside the click, navigated once the URL is known. Both
    // entry points are gestures — the card's button and the form's submit —
    // so this holds on the retry too.
    const popup = window.open(
      "",
      "devic-oauth",
      "width=520,height=680,menubar=no,toolbar=no"
    );

    try {
      const { connected, authorizationUrl } = await client.connectIntegration(
        integration.app,
        { ...scope, returnTo, ...values }
      );

      // Nothing to authorise: the key the user typed is the account. Close the
      // window that was opened in case it was needed and re-read the listing.
      if (connected || !authorizationUrl) {
        popup?.close();
        setSetupPrompt(null);
        finishConnect();
        return;
      }

      pendingRef.current = { app: integration.app, returnTo };
      setSetupPrompt(null);
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
      setBusyApp(null);
      const setup = (err as DevicApiError)?.setupRequired;
      if (setup) {
        await openSetupForm(integration, setup);
        return;
      }
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  /**
   * Opens the credentials form for an app that needs one.
   *
   * `stage: "app"` is not the end user's to fix — it means the developer who
   * embedded this widget has not registered an application with the provider
   * yet. Asking a stranger for someone else's client secret would be both
   * useless and a good way to teach them to hand credentials to a form, so it
   * is reported as unavailable instead.
   */
  const openSetupForm = async (
    integration: Integration,
    setup: IntegrationSetupRequired
  ) => {
    if (setup.stage === "app") {
      setActionError(
        `${integration.name} is not available yet — it still needs to be set up ` +
          `by the app's provider.`
      );
      return;
    }
    try {
      const { schemes } = await client!.getIntegrationAuth(
        integration.app,
        scope
      );
      if (!schemes.length) throw new Error(setup.message);
      setSetupPrompt({ app: integration.app, setup, schemes });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDisconnect = async (app: string, account: IntegrationAccount) => {
    if (!client || busyApp) return;
    setBusyApp(app);
    setActionError(null);
    try {
      await client.disconnectIntegration(account.id, scope);
      await refresh(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
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
      data-dark={isDarkTheme(theme)}
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

        <div className="devic-int-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            autoComplete="off"
          />
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
            <div className="devic-int-empty">No apps available here yet.</div>
          ) : visible.length === 0 ? (
            <div className="devic-int-empty">
              No apps match “{query.trim()}”.
            </div>
          ) : (
            <div className="devic-int-grid">
              {visible.map((integration) => {
                const cardState = stateOf(integration);
                const busy = busyApp === integration.app;
                return (
                  <div
                    key={integration.app}
                    className="devic-int-card"
                    data-state={cardState.key}
                  >
                    <div className="devic-int-card-head">
                      <IntegrationLogo integration={integration} />
                      <span className="devic-int-state">
                        <span
                          className="devic-int-dot"
                          data-ok={cardState.key === "connected"}
                          data-off={cardState.key === "disconnected"}
                          aria-hidden="true"
                        />
                        {cardState.label}
                      </span>
                    </div>

                    <div className="devic-int-name" title={integration.name}>
                      {integration.name}
                    </div>

                    {integration.description && (
                      <div
                        className="devic-int-description"
                        title={integration.description}
                      >
                        {integration.description}
                      </div>
                    )}

                    {/* The form replaces this app's button rather than opening
                        a dialog of its own: it belongs to the card the user
                        pressed, and the modal is already a dialog. */}
                    {setupPrompt?.app === integration.app ? (
                      <ConnectFieldsForm
                        integration={integration}
                        schemes={setupPrompt.schemes}
                        initialScheme={setupPrompt.setup.authScheme}
                        onlyFields={setupPrompt.setup.fields}
                        submitting={busy}
                        onCancel={() => setSetupPrompt(null)}
                        onSubmit={(values) => handleConnect(integration, values)}
                      />
                    ) : (
                      <button
                        type="button"
                        className={`devic-int-btn devic-int-btn-block${
                          cardState.key === "connected"
                            ? ""
                            : " devic-int-btn-primary"
                        }`}
                        onClick={() => handleConnect(integration)}
                        disabled={busy || !!busyApp}
                        title={
                          cardState.key === "connected"
                            ? "Sign in with a different account. The one connected now is replaced."
                            : undefined
                        }
                      >
                        {busy
                          ? "Waiting…"
                          : cardState.key === "disconnected"
                            ? "Connect"
                            : cardState.key === "reconnect"
                              ? "Reconnect"
                              : // Not "Add account": one account per app is all
                                // the assistant can use, and connecting again
                                // retires the previous one.
                                "Switch account"}
                      </button>
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
                              className="devic-int-unlink"
                              onClick={() =>
                                handleDisconnect(integration.app, account)
                              }
                              disabled={!!busyApp}
                              title="Disconnect this account"
                              aria-label={`Disconnect ${integration.name}`}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
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
