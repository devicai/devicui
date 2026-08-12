import { useMemo, useState, type FormEvent, type JSX } from "react";
import { createPortal } from "react-dom";
import type {
  Integration,
  IntegrationAuthField,
  IntegrationAuthScheme,
} from "../../api/types";
import { isDarkTheme, themeVars, type DevicTheme } from "../theme";
import { IntegrationLogo } from "./IntegrationLogo";

export interface ConnectFieldsFormProps {
  integration: Integration;
  /** Every way this app can be connected, from `GET /:app/auth`. */
  schemes: IntegrationAuthScheme[];
  /** The scheme to start on, when the server named one. */
  initialScheme?: string;
  /** Only these are asked for, when the server named what was missing. */
  onlyFields?: IntegrationAuthField[];
  submitting?: boolean;
  /** Failure from the last attempt, shown above the fields. */
  error?: string | null;
  /** Passed down from the dialog that opened this one. */
  theme?: DevicTheme;
  onCancel: () => void;
  onSubmit: (values: {
    authScheme: string;
    accountFields: Record<string, string>;
  }) => void;
}

/** Whether a field belongs in the form, given the server's shortlist. */
function wanted(
  field: IntegrationAuthField,
  only?: IntegrationAuthField[]
): boolean {
  return !only?.length || only.some((f) => f.name === field.name);
}

/**
 * The credentials an app asks the end user for.
 *
 * Most apps do not authenticate with credentials Devic holds — they take an
 * API key the user creates at the provider — so without this they cannot be
 * connected at all, no matter how many popups are opened.
 *
 * A dialog of its own rather than something inside the app's card: a provider
 * explains where to find a key in a paragraph, and three of those do not fit
 * in one column of a grid without turning into a stack of clipped text. The
 * fields are rendered from what the server describes, never from anything
 * per-app — there are hundreds of them.
 *
 * Values go straight into the connection and are never kept here.
 */
export function ConnectFieldsForm({
  integration,
  schemes,
  initialScheme,
  onlyFields,
  submitting,
  error,
  theme,
  onCancel,
  onSubmit,
}: ConnectFieldsFormProps): JSX.Element | null {
  const [mode, setMode] = useState(initialScheme ?? schemes[0]?.mode ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);

  const scheme = useMemo(
    () => schemes.find((s) => s.mode === mode) ?? schemes[0],
    [schemes, mode]
  );

  const fields = useMemo(
    () => (scheme?.accountFields ?? []).filter((f) => wanted(f, onlyFields)),
    [scheme, onlyFields]
  );

  if (!scheme) return null;

  const valueOf = (field: IntegrationAuthField) =>
    values[field.name] ?? field.default ?? "";

  const missing = fields.filter((f) => f.required && !valueOf(f).trim());

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (missing.length || submitting) return;

    // Only what this scheme declares, trimmed. A value left blank is left out
    // rather than sent empty: the provider would store it and fail later.
    const accountFields: Record<string, string> = {};
    for (const field of scheme.accountFields) {
      const value = valueOf(field).trim();
      if (value) accountFields[field.name] = value;
    }
    onSubmit({ authScheme: scheme.mode, accountFields });
  };

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
        aria-label={`Connect ${integration.name}`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="devic-int-connect-header">
          <IntegrationLogo integration={integration} />
          <div className="devic-int-connect-heading">
            <strong>Connect {integration.name}</strong>
            <span>
              {scheme.redirect
                ? `You'll be sent to ${integration.name} to finish authorising.`
                : "Your credentials go straight to the app — only you can use this account."}
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

          {/* Only when there is a real choice — a picker with one option is
              just another thing to read before typing a key. */}
          {schemes.length > 1 && (
            <label className="devic-int-connect-field">
              <span className="devic-int-connect-label">Connect with</span>
              <select
                value={scheme.mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setValues({});
                  setTouched(false);
                }}
              >
                {schemes.map((s) => (
                  <option key={s.mode} value={s.mode}>
                    {s.mode}
                  </option>
                ))}
              </select>
            </label>
          )}

          {fields.map((field, index) => {
            const invalid = touched && field.required && !valueOf(field).trim();
            return (
              <label key={field.name} className="devic-int-connect-field">
                <span className="devic-int-connect-label">
                  {field.label}
                  {!field.required && <em> (optional)</em>}
                </span>
                <input
                  autoFocus={index === 0}
                  type={field.secret ? "password" : "text"}
                  value={valueOf(field)}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [field.name]: e.target.value,
                    }))
                  }
                  placeholder={field.default}
                  autoComplete={field.secret ? "new-password" : "off"}
                  spellCheck={false}
                  aria-invalid={invalid || undefined}
                  data-invalid={invalid || undefined}
                />
                {field.description && (
                  <small className="devic-int-connect-hint">
                    {field.description}
                  </small>
                )}
              </label>
            );
          })}

          {scheme.guideUrl && (
            <a
              className="devic-int-connect-guide"
              href={scheme.guideUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Where do I find this?
            </a>
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
            {submitting
              ? "Connecting…"
              : scheme.redirect
                ? "Continue"
                : "Connect"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
