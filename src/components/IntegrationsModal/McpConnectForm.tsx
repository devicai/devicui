import { useMemo, useState, type FormEvent, type JSX } from "react";
import { createPortal } from "react-dom";
import type { TenantMcpAuthInput, TenantMcpServer } from "../../api/types";
import { isDarkTheme, themeVars, type DevicTheme } from "../theme";

export interface McpConnectFormProps {
  /**
   * The server being connected. `null` is the "add your own" case, where the
   * url and the name are the end user's to type.
   */
  server: TenantMcpServer | null;
  submitting?: boolean;
  error?: string | null;
  /**
   * The redirect URI the end user must authorise on their own OAuth
   * application, when the server told us it has no dynamic registration.
   */
  callbackUrl?: string;
  /** Open the client-credentials fields already expanded. */
  needsClientCredentials?: boolean;
  theme?: DevicTheme;
  onCancel: () => void;
  onSubmit: (values: {
    url?: string;
    name?: string;
    auth: TenantMcpAuthInput;
  }) => void;
}

/**
 * What an MCP server asks the end user for.
 *
 * Both ways in end here — a server the developer listed and one the user
 * brings — because the difference between them is only who typed the url.
 * Everything after that is the same question: a key, or a trip to a consent
 * screen.
 *
 * A dialog rather than something inside a card: the OAuth-application fields
 * carry a redirect URI the user has to copy somewhere else, which does not fit
 * in a column of a grid without becoming a stack of clipped text.
 *
 * Values go straight into the connection and are never kept here.
 */
export function McpConnectForm({
  server,
  submitting,
  error,
  callbackUrl,
  needsClientCredentials,
  theme,
  onCancel,
  onSubmit,
}: McpConnectFormProps): JSX.Element {
  const custom = !server;
  const [url, setUrl] = useState(server?.url ?? "");
  const [name, setName] = useState(server?.name ?? "");
  const [key, setKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showClient, setShowClient] = useState(!!needsClientCredentials);
  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState(false);

  // A server the user brings could be anything, so the form offers both ways
  // and lets them say. One the developer listed already declared how it
  // authenticates, and asking again would only invite a wrong answer.
  const [mode, setMode] = useState<TenantMcpAuthInput["mode"]>(
    server?.authMode ?? "oauth"
  );

  const headerLabel = server?.headerName
    ? `${server.headerName} value`
    : "API key";

  const urlInvalid = useMemo(
    () => custom && touched && !/^https:\/\/.+/i.test(url.trim()),
    [custom, touched, url]
  );
  const keyInvalid = touched && mode === "header" && !key.trim();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (submitting) return;
    if (custom && !/^https:\/\/.+/i.test(url.trim())) return;
    if (mode === "header" && !key.trim()) return;

    onSubmit({
      url: custom ? url.trim() : undefined,
      name: name.trim() || undefined,
      auth: {
        mode,
        headerValue: mode === "header" ? key.trim() : undefined,
        upstreamOAuth:
          mode === "oauth" && clientId.trim()
            ? {
                clientId: clientId.trim(),
                clientSecret: clientSecret.trim() || undefined,
              }
            : undefined,
      },
    });
  };

  const title = custom ? "Add an MCP server" : `Connect ${server.name}`;

  return createPortal(
    <div
      className="devic-int-overlay devic-int-overlay-stacked"
      style={themeVars(theme)}
      data-dark={isDarkTheme(theme)}
      onClick={onCancel}
    >
      <form
        className="devic-int-connect-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="devic-int-connect-header">
          {server?.logoUrl ? (
            <img
              className="devic-int-mcp-logo"
              src={server.logoUrl}
              alt=""
              aria-hidden="true"
            />
          ) : (
            <span className="devic-int-mcp-logo devic-int-mcp-logo-fallback">
              {(server?.name ?? "M").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="devic-int-connect-heading">
            <strong>{title}</strong>
            <span>
              {mode === "oauth"
                ? "You'll be sent to the server to finish authorising."
                : mode === "header"
                  ? "Your key goes straight to the server — only you can use it."
                  : "This server needs no credentials."}
            </span>
          </div>
          <button
            type="button"
            className="devic-int-close"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="devic-int-connect-body">
          {error && <div className="devic-int-error">{error}</div>}

          {custom && (
            <>
              <label className="devic-int-connect-field">
                <span className="devic-int-connect-label">Server URL</span>
                <input
                  autoFocus
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://mcp.example.com/sse"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={urlInvalid || undefined}
                  data-invalid={urlInvalid || undefined}
                />
                <small className="devic-int-connect-hint">
                  Must be reachable over https on a public address.
                </small>
              </label>

              <label className="devic-int-connect-field">
                <span className="devic-int-connect-label">
                  Name <em>(optional)</em>
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What you want to call it"
                  autoComplete="off"
                />
              </label>

              <label className="devic-int-connect-field">
                <span className="devic-int-connect-label">Authentication</span>
                <select
                  value={mode}
                  onChange={(e) =>
                    setMode(e.target.value as TenantMcpAuthInput["mode"])
                  }
                >
                  <option value="oauth">Sign in (OAuth)</option>
                  <option value="header">API key</option>
                  <option value="none">None</option>
                </select>
              </label>
            </>
          )}

          {mode === "header" && (
            <label className="devic-int-connect-field">
              <span className="devic-int-connect-label">{headerLabel}</span>
              <input
                autoFocus={!custom}
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="new-password"
                spellCheck={false}
                aria-invalid={keyInvalid || undefined}
                data-invalid={keyInvalid || undefined}
              />
            </label>
          )}

          {mode === "oauth" && (custom || server?.allowClientCredentials) && (
            <div className="devic-int-mcp-advanced">
              {/* Not a detail to bury: a server whose authorization server has
                  no dynamic client registration cannot be connected at all
                  without these, and the message that says so arrives only
                  after the first attempt. */}
              {needsClientCredentials && (
                <div className="devic-int-notice">
                  This server needs its own OAuth application. Register one with
                  it and paste the details below.
                </div>
              )}
              <button
                type="button"
                className="devic-int-mcp-disclosure"
                onClick={() => setShowClient((prev) => !prev)}
                aria-expanded={showClient}
              >
                {showClient ? "▾" : "▸"} Use my own OAuth application
              </button>

              {showClient && (
                <>
                  <label className="devic-int-connect-field">
                    <span className="devic-int-connect-label">
                      Client ID <em>(optional)</em>
                    </span>
                    <input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <label className="devic-int-connect-field">
                    <span className="devic-int-connect-label">
                      Client secret <em>(optional)</em>
                    </span>
                    <input
                      type="password"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      autoComplete="new-password"
                      spellCheck={false}
                    />
                  </label>
                  {callbackUrl && (
                    <label className="devic-int-connect-field">
                      <span className="devic-int-connect-label">
                        Authorised redirect URI
                      </span>
                      <input readOnly value={callbackUrl} spellCheck={false} />
                      <small className="devic-int-connect-hint">
                        Add this to your OAuth application, exactly as shown.{" "}
                        <button
                          type="button"
                          className="devic-int-mcp-copy"
                          onClick={() => {
                            void navigator.clipboard
                              ?.writeText(callbackUrl)
                              .then(() => setCopied(true))
                              .catch(() => undefined);
                          }}
                        >
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </small>
                    </label>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="devic-int-connect-actions">
          <button
            type="button"
            className="devic-int-btn"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="devic-int-btn devic-int-btn-primary"
            disabled={submitting}
          >
            {submitting ? "Connecting…" : mode === "oauth" ? "Continue" : "Connect"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

export default McpConnectForm;
