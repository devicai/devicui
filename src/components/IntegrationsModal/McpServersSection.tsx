import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type {
  TenantMcpAuthInput,
  TenantMcpConnectResult,
  TenantMcpServer,
} from "../../api/types";
import type { DevicTheme } from "../theme";
import { McpConnectForm } from "./McpConnectForm";
import type { TenantMcpState } from "./useTenantMcp";

export interface McpServersSectionProps {
  state: TenantMcpState;
  theme?: DevicTheme;
  /** Filter typed in the modal's search box. */
  query?: string;
}

/** Message the OAuth callback page posts back when an MCP connection is done. */
interface McpCallbackMessage {
  source?: string;
  type?: string;
  status?: string;
  returnTo?: string;
}

/** A random value tying an OAuth round trip to the window that started it. */
function newNonce(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function stateOf(server: TenantMcpServer): {
  key: "connected" | "reconnect" | "disconnected";
  label: string;
} {
  const status = server.connection?.status;
  if (status === "active") return { key: "connected", label: "Connected" };
  if (status === "error") return { key: "reconnect", label: "Needs attention" };
  if (status === "pending_auth")
    return { key: "reconnect", label: "Waiting for sign-in" };
  return { key: "disconnected", label: "Not connected" };
}

function matches(server: TenantMcpServer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    server.name.toLowerCase().includes(q) ||
    server.url.toLowerCase().includes(q) ||
    (server.description ?? "").toLowerCase().includes(q)
  );
}

/** Identity of a row, stable whether or not it has been connected yet. */
function keyOf(server: TenantMcpServer): string {
  return server.connection?.id ?? server.templateId ?? server.url;
}

/**
 * The MCP servers section of the connected-apps panel.
 *
 * The end user sees one list: the servers their developer left ready to
 * connect, the ones they added themselves, and — unless it was switched off —
 * a button to add another. Both routes open the same form, because the only
 * difference between them is who typed the url.
 *
 * Connecting opens a consent screen in a popup. The popup is opened empty
 * *before* the request that produces its URL, because browsers only honour
 * `window.open` inside the gesture that triggered it; opening it after the
 * round trip is what gets it blocked. Two endings are watched, not one — a
 * cancelled consent screen posts nothing back, so the close is watched too.
 */
export function McpServersSection({
  state,
  theme,
  query = "",
}: McpServersSectionProps): JSX.Element | null {
  const { servers, allowCustom, limits, loading, client, scope, refresh } = state;

  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<{ url: string } | null>(null);
  /** The row whose form is open. `null` inside the object is "add your own". */
  const [prompt, setPrompt] = useState<{
    server: TenantMcpServer | null;
    callbackUrl?: string;
    needsClientCredentials?: boolean;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const pendingRef = useRef<{ returnTo: string } | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);

  const finish = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pendingRef.current = null;
    popupRef.current = null;
    setBusyKey(null);
    void refresh();
  }, [refresh]);

  // The callback page says it is done. A nudge, never the result: what is shown
  // comes from re-reading the server, so a forged message costs one extra fetch
  // and nothing else.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as McpCallbackMessage | undefined;
      if (!data || data.source !== "devic") return;
      if (data.type !== "mcp-connected") return;
      const pending = pendingRef.current;
      if (!pending || data.returnTo !== pending.returnTo) return;
      popupRef.current?.close();
      finish();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [finish]);

  useEffect(
    () => () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    },
    []
  );

  const openPrompt = (server: TenantMcpServer | null) => {
    setFormError(null);
    setActionError(null);
    setBlockedUrl(null);
    setPrompt({ server });
  };

  const submit = async (values: {
    url?: string;
    name?: string;
    auth: TenantMcpAuthInput;
  }) => {
    if (!client || !prompt) return;
    const server = prompt.server;
    const rowKey = server ? keyOf(server) : "new";
    setBusyKey(rowKey);
    setFormError(null);

    const nonce = newNonce();
    const returnTo = `${window.location.origin}/?devic_mcp=${nonce}`;
    // Opened empty inside the submit gesture and navigated once the URL is
    // known. Skipped when no browser is involved at all.
    const popup =
      values.auth.mode === "oauth"
        ? window.open(
            "",
            "devic-mcp-oauth",
            "width=520,height=680,menubar=no,toolbar=no"
          )
        : null;

    try {
      const existing = server?.connection;
      const result: TenantMcpConnectResult = existing
        ? await client.reconnectMcpServer(existing.id, {
            ...scope,
            returnTo,
            auth: values.auth,
          })
        : await client.connectMcpServer({
            ...scope,
            returnTo,
            templateId: server?.templateId,
            url: values.url,
            name: values.name,
            auth: values.auth,
          });

      if (result.requiresClientCredentials) {
        // Not a failure the user can do nothing about: they own the server, so
        // the form reopens with the fields and the redirect URI to authorise.
        popup?.close();
        setBusyKey(null);
        setPrompt({
          server,
          callbackUrl: result.callbackUrl,
          needsClientCredentials: true,
        });
        setFormError(result.error ?? null);
        return;
      }

      if (result.status === "error") {
        popup?.close();
        setBusyKey(null);
        setFormError(result.error ?? "The server could not be reached.");
        return;
      }

      if (!result.authorizationUrl) {
        // Connected outright: the key the user typed is the credential.
        popup?.close();
        setPrompt(null);
        finish();
        return;
      }

      pendingRef.current = { returnTo };
      setPrompt(null);
      if (popup && !popup.closed) {
        popupRef.current = popup;
        popup.location.href = result.authorizationUrl;
        pollRef.current = window.setInterval(() => {
          if (popup.closed) finish();
        }, 700);
      } else {
        // Blocked (Safari, in-app browsers, extensions): hand over the URL.
        setBlockedUrl({ url: result.authorizationUrl });
        setBusyKey(null);
      }
    } catch (err) {
      popup?.close();
      pendingRef.current = null;
      setBusyKey(null);
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const disconnect = async (server: TenantMcpServer) => {
    const connection = server.connection;
    if (!client || !connection || busyKey) return;
    setBusyKey(keyOf(server));
    setActionError(null);
    try {
      await client.disconnectMcpServer(connection.id, scope);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  };

  const visible = servers.filter((s) => matches(s, query));
  const atLimit = limits.used >= limits.maxServers;

  // Nothing offered and nothing addable: the whole section would be a heading
  // over an empty box, which says less than saying nothing.
  if (!servers.length && !allowCustom) return null;

  return (
    <div className="devic-int-mcp-section">
      <div className="devic-int-mcp-heading">
        <h4>MCP servers</h4>
        <span>Connect a server and its tools become available in this chat.</span>
      </div>

      {actionError && <div className="devic-int-error">{actionError}</div>}

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

      {visible.length > 0 && (
        <div className="devic-int-grid">
          {visible.map((server) => {
            const cardState = stateOf(server);
            const rowKey = keyOf(server);
            const busy = busyKey === rowKey;
            const connection = server.connection;
            return (
              <div
                key={rowKey}
                className="devic-int-card"
                data-state={cardState.key}
              >
                <div className="devic-int-card-head">
                  {server.logoUrl ? (
                    <img
                      className="devic-int-mcp-logo"
                      src={server.logoUrl}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="devic-int-mcp-logo devic-int-mcp-logo-fallback">
                      {server.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
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

                <div className="devic-int-name" title={server.name}>
                  {server.name}
                </div>

                <div
                  className="devic-int-description"
                  title={server.description ?? server.url}
                >
                  {server.description ?? server.url}
                </div>

                {connection?.shared && (
                  // Worth saying before they wonder why they cannot remove it.
                  <div className="devic-int-mcp-note">
                    Connected for everyone on this account
                  </div>
                )}

                {connection?.status === "active" &&
                  typeof connection.toolCount === "number" && (
                    <div className="devic-int-mcp-note">
                      {connection.toolCount} tool
                      {connection.toolCount === 1 ? "" : "s"} available
                    </div>
                  )}

                {connection?.lastProbeError && (
                  <div
                    className="devic-int-mcp-note devic-int-mcp-note-warn"
                    title={connection.lastProbeError}
                  >
                    {connection.lastProbeError}
                  </div>
                )}

                <button
                  type="button"
                  className={`devic-int-btn devic-int-btn-block${
                    cardState.key === "connected" ? "" : " devic-int-btn-primary"
                  }`}
                  onClick={() => openPrompt(server)}
                  disabled={
                    busy ||
                    !!busyKey ||
                    connection?.readOnly ||
                    (!connection && atLimit)
                  }
                  title={
                    connection?.readOnly
                      ? "This server was connected for the whole account."
                      : !connection && atLimit
                        ? `You can have ${limits.maxServers} connected at a time.`
                        : undefined
                  }
                >
                  {busy
                    ? "Waiting…"
                    : cardState.key === "disconnected"
                      ? "Connect"
                      : "Reconnect"}
                </button>

                {connection && !connection.readOnly && (
                  <button
                    type="button"
                    className="devic-int-btn devic-int-btn-block devic-int-mcp-remove"
                    onClick={() => void disconnect(server)}
                    disabled={!!busyKey}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {allowCustom && (
        <button
          type="button"
          className="devic-int-btn devic-int-mcp-add"
          onClick={() => openPrompt(null)}
          disabled={loading || !!busyKey || atLimit}
          title={
            atLimit
              ? `You can have ${limits.maxServers} MCP server${
                  limits.maxServers === 1 ? "" : "s"
                } connected at a time.`
              : undefined
          }
        >
          + Add your own MCP
        </button>
      )}

      {prompt && (
        <McpConnectForm
          server={prompt.server}
          callbackUrl={prompt.callbackUrl}
          needsClientCredentials={prompt.needsClientCredentials}
          submitting={
            busyKey === (prompt.server ? keyOf(prompt.server) : "new")
          }
          error={formError}
          theme={theme}
          onCancel={() => {
            setPrompt(null);
            setFormError(null);
          }}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

export default McpServersSection;
