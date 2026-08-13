import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { Integration } from "../../api/types";
import { IntegrationLogo } from "./IntegrationLogo";
import type { IntegrationsState } from "./useIntegrations";
import "./IntegrationsModal.css";

export interface IntegrationsToggleProps {
  /** Shared listing (see `useIntegrations`). */
  state: IntegrationsState;
  /** Slugs currently switched off. */
  disabled: string[];
  /** Called with the full new list of switched-off slugs. */
  onChange: (disabled: string[]) => void;
  /** Opens the connected-apps modal, to connect one more. */
  onManage?: () => void;
  /** Tooltip and accessible name. @default "Apps in this chat" */
  label?: string;
  /** Light-on-dark, for a dark composer. */
  dark?: boolean;
  /** Disables the control while a message is in flight. */
  busy?: boolean;
  className?: string;
}

/** A plug, matching the weight of the attach and mic icons beside it. */
function PlugIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 2v6" />
      <path d="M15 2v6" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 17v5" />
    </svg>
  );
}

/**
 * Which apps the assistant may reach on the next message.
 *
 * Only apps the end user has actually connected appear: an app they have not
 * set up is not something they can switch off, and listing it here would turn
 * this into a second, worse version of the connect dialog.
 *
 * The choice lives in the caller and travels with each message. Nothing is
 * remembered on the server and nothing is disconnected — switching Gmail off
 * for a question about a spreadsheet must not cost an OAuth round trip to
 * undo, which is the whole reason this exists next to the composer rather than
 * inside the apps dialog.
 */
export function IntegrationsToggle({
  state,
  disabled,
  onChange,
  onManage,
  label = "Apps in this chat",
  dark = false,
  busy = false,
  className = "",
}: IntegrationsToggleProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const connected = useMemo(
    () => state.integrations.filter((i) => i.connected),
    [state.integrations]
  );

  // Closing on an outside click and on Escape, the two ways every popover is
  // expected to close. Bound only while open so a drawer full of these costs
  // nothing when they are all shut.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  // An end user with nothing connected has nothing to switch: the button would
  // open an empty box. It appears the moment they connect their first app.
  if (!state.offered || connected.length === 0) return null;

  const off = new Set(disabled);
  const offCount = connected.filter((i) => off.has(i.app)).length;

  const toggle = (integration: Integration) => {
    const next = new Set(off);
    if (next.has(integration.app)) next.delete(integration.app);
    else next.add(integration.app);
    // Only apps still on offer are kept: carrying a slug for an app the user
    // has since disconnected would silently switch it off again if they ever
    // reconnected it.
    onChange(connected.filter((i) => next.has(i.app)).map((i) => i.app));
  };

  return (
    <div
      className={`devic-int-toggle ${className}`.trim()}
      data-dark={dark}
      ref={ref}
    >
      <button
        type="button"
        className="devic-input-btn devic-int-toggle-btn"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title={
          offCount
            ? `${label} — ${offCount} switched off`
            : label
        }
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-some-off={offCount > 0 || undefined}
      >
        <PlugIcon />
        {offCount > 0 && (
          <span className="devic-int-toggle-badge" aria-hidden="true">
            {offCount}
          </span>
        )}
      </button>

      {open && (
        <div className="devic-int-toggle-popover" role="dialog" aria-label={label}>
          <div className="devic-int-toggle-head">
            <strong>{label}</strong>
            <span>
              Switched off here, an app sits out your next message. It stays
              connected.
            </span>
          </div>

          <ul className="devic-int-toggle-list">
            {connected.map((integration) => {
              const on = !off.has(integration.app);
              return (
                <li key={integration.app}>
                  <label className="devic-int-toggle-row">
                    <span className="devic-int-toggle-app">
                      <IntegrationLogo integration={integration} />
                      <span className="devic-int-toggle-name">
                        {integration.name}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      className="devic-int-toggle-switch"
                      checked={on}
                      onChange={() => toggle(integration)}
                      aria-label={`Use ${integration.name} in this chat`}
                    />
                  </label>
                </li>
              );
            })}
          </ul>

          {onManage && (
            <button
              type="button"
              className="devic-int-toggle-manage"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
            >
              Manage connected apps
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default IntegrationsToggle;
