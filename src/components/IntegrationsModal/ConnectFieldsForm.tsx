import { useMemo, useState, type FormEvent, type JSX } from "react";
import type {
  Integration,
  IntegrationAuthField,
  IntegrationAuthScheme,
} from "../../api/types";

export interface ConnectFieldsFormProps {
  integration: Integration;
  /** Every way this app can be connected, from `GET /:app/auth`. */
  schemes: IntegrationAuthScheme[];
  /** The scheme the server asked about, when it named one. */
  initialScheme?: string;
  /** Only these are asked for, when the server named what was missing. */
  onlyFields?: IntegrationAuthField[];
  submitting?: boolean;
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
 * Rendered from the fields the server describes rather than from anything
 * per-app: there are hundreds of them, and their inputs are the provider's to
 * decide. Values go straight to the connection and are never kept here.
 */
export function ConnectFieldsForm({
  integration,
  schemes,
  initialScheme,
  onlyFields,
  submitting,
  onCancel,
  onSubmit,
}: ConnectFieldsFormProps): JSX.Element | null {
  const [mode, setMode] = useState(
    initialScheme ?? schemes[0]?.mode ?? ""
  );
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

  return (
    <form className="devic-int-connect-form" onSubmit={handleSubmit}>
      <div className="devic-int-connect-head">
        <strong>Connect {integration.name}</strong>
        {scheme.guideUrl && (
          <a href={scheme.guideUrl} target="_blank" rel="noopener noreferrer">
            Where do I find this?
          </a>
        )}
      </div>

      {/* Only when there is a real choice — a picker with one option is just
          another thing to read before typing a key. */}
      {schemes.length > 1 && (
        <label className="devic-int-connect-field">
          <span>Connect with</span>
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

      {fields.map((field) => {
        const invalid = touched && field.required && !valueOf(field).trim();
        return (
          <label key={field.name} className="devic-int-connect-field">
            <span>
              {field.label}
              {!field.required && <em> (optional)</em>}
            </span>
            <input
              type={field.secret ? "password" : "text"}
              value={valueOf(field)}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
              }
              placeholder={field.default}
              autoComplete={field.secret ? "new-password" : "off"}
              spellCheck={false}
              aria-invalid={invalid || undefined}
              data-invalid={invalid || undefined}
            />
            {field.description && (
              // Titled as well as shown: providers explain where to find a key
              // in a paragraph, and the card clamps it to three lines.
              <small className="devic-int-connect-hint" title={field.description}>
                {field.description}
              </small>
            )}
          </label>
        );
      })}

      {scheme.redirect && (
        <small className="devic-int-connect-hint">
          You'll be sent to {integration.name} to finish authorising.
        </small>
      )}

      <div className="devic-int-connect-actions">
        <button
          type="button"
          className="devic-int-btn devic-int-btn-small"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="devic-int-btn devic-int-btn-small devic-int-btn-primary"
          disabled={submitting}
        >
          {submitting ? "Connecting…" : scheme.redirect ? "Continue" : "Connect"}
        </button>
      </div>
    </form>
  );
}
