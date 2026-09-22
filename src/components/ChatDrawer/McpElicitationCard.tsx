import React, { useMemo, useState } from 'react';
import type {
  McpElicitationDecision,
  PendingMcpElicitation,
} from '../../api/types';

export interface McpElicitationRendererProps {
  elicitations: PendingMcpElicitation[];
  onResolve: (decisions: McpElicitationDecision[]) => Promise<void>;
}

/** Completely replaces the built-in MCP elicitation surface. */
export type McpElicitationRenderer = (
  props: McpElicitationRendererProps,
) => React.ReactNode;

export interface McpElicitationCardProps
  extends McpElicitationRendererProps {
  renderer?: McpElicitationRenderer;
}

const safeUrl = (raw?: string): string | undefined => {
  try {
    const url = new URL(raw || '');
    if (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname))
    ) {
      return url.toString();
    }
  } catch {
    // Invalid upstream URLs are rendered as an error, never as links.
  }
  return undefined;
};

export function McpElicitationCard({
  elicitations,
  onResolve,
  renderer,
}: McpElicitationCardProps): JSX.Element | null {
  const [values, setValues] = useState<Record<string, Record<string, any>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urls = useMemo(
    () => new Map(elicitations.map((item) => [item.id, safeUrl(item.url)])),
    [elicitations],
  );
  if (!elicitations.length) return null;
  if (renderer) return <>{renderer({ elicitations, onResolve })}</>;

  const setValue = (id: string, key: string, value: unknown) =>
    setValues((current) => ({
      ...current,
      [id]: { ...(current[id] || {}), [key]: value },
    }));

  const resolve = async (action: McpElicitationDecision['action']) => {
    setError(null);
    if (action === 'accept') {
      for (const item of elicitations) {
        if (item.mode !== 'form') continue;
        const required = (item.requestedSchema?.required || []) as string[];
        const missing = required.find((key) => {
          const property = (item.requestedSchema?.properties as any)?.[key];
          const value = values[item.id]?.[key] ?? property?.default;
          return value === undefined || value === '';
        });
        if (missing) {
          setError(`${missing} is required`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      await onResolve(
        elicitations.map((item) => ({
          id: item.id,
          action,
          ...(action === 'accept' && item.mode === 'form'
            ? {
                content: Object.keys(item.requestedSchema?.properties || {}).reduce<Record<string, any>>(
                  (content, key) => {
                    const property = (item.requestedSchema?.properties as any)?.[key];
                    const value = values[item.id]?.[key] ?? property?.default;
                    if (value !== undefined) content[key] = value;
                    return content;
                  },
                  {},
                ),
              }
            : {}),
        })),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="devic-mcp-elicitation" aria-live="polite">
      <div className="devic-mcp-elicitation__title">More information required</div>
      {elicitations.map((item) => {
        const schema = item.requestedSchema || {};
        const required = new Set<string>((schema.required || []) as string[]);
        return (
          <div className="devic-mcp-elicitation__request" key={item.id}>
            <div className="devic-mcp-elicitation__tool">
              <code>{item.toolName}</code>
              {item.toolServerName ? ` · ${item.toolServerName}` : ''}
            </div>
            <p>{item.message}</p>
            {item.mode === 'url' ? (
              urls.get(item.id) ? (
                <a href={urls.get(item.id)} target="_blank" rel="noopener noreferrer">
                  Open secure page
                </a>
              ) : (
                <div className="devic-mcp-elicitation__error">
                  The MCP returned an unsafe or invalid URL.
                </div>
              )
            ) : (
              Object.entries(schema.properties || {}).map(([key, raw]) => {
                const property = raw as any;
                const choices = property.enum || property.oneOf?.map((option: any) => option.const);
                const value = values[item.id]?.[key];
                return (
                  <label key={key} className="devic-mcp-elicitation__field">
                    <span>{property.title || key}{required.has(key) ? ' *' : ''}</span>
                    {property.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(value ?? property.default)}
                        onChange={(event) => setValue(item.id, key, event.target.checked)}
                      />
                    ) : choices ? (
                      <select
                        multiple={property.type === 'array'}
                        value={value ?? (property.type === 'array' ? [] : '')}
                        onChange={(event) =>
                          setValue(
                            item.id,
                            key,
                            property.type === 'array'
                              ? Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                              : choices.find((choice: unknown) => String(choice) === event.currentTarget.value),
                          )
                        }
                      >
                        {property.type !== 'array' && <option value="">Select…</option>}
                        {choices.map((choice: unknown) => (
                          <option key={String(choice)} value={String(choice)}>{String(choice)}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={property.format === 'password' ? 'password' : property.type === 'number' || property.type === 'integer' ? 'number' : 'text'}
                        value={value ?? ''}
                        min={property.minimum}
                        max={property.maximum}
                        onChange={(event) =>
                          setValue(
                            item.id,
                            key,
                            property.type === 'number' || property.type === 'integer'
                              ? Number(event.target.value)
                              : event.target.value,
                          )
                        }
                      />
                    )}
                    {property.description && <small>{property.description}</small>}
                  </label>
                );
              })
            )}
          </div>
        );
      })}
      {error && <div className="devic-mcp-elicitation__error">{error}</div>}
      <div className="devic-mcp-elicitation__actions">
        <button type="button" disabled={submitting} onClick={() => void resolve('cancel')}>Cancel</button>
        <button type="button" disabled={submitting} onClick={() => void resolve('decline')}>Decline</button>
        <button type="button" className="devic-mcp-elicitation__continue" disabled={submitting} onClick={() => void resolve('accept')}>
          {submitting ? 'Submitting…' : 'Continue'}
        </button>
      </div>
    </section>
  );
}
