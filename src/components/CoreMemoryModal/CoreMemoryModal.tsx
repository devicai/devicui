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
import type { CoreMemoryEntry, CoreMemoryLimits } from "../../api/types";
import { useOptionalDevicContext } from "../../provider";
import { themeVars, type DevicTheme } from "../theme";
import "./CoreMemoryModal.css";

/** Canonical sections of the core tier, in display order. */
const SECTIONS = ["persona", "instructions", "decisions", "profile"] as const;

export interface CoreMemoryModalProps {
  /** Whether the modal is visible. */
  isOpen: boolean;
  onClose: () => void;
  /** Assistant whose memory bucket is shown. */
  assistantId: string;
  /** Tenant of the end user (falls back to the provider's tenantId). */
  tenantId?: string;
  /** Subtenant of the end user (falls back to the provider's subtenantId). */
  subtenantId?: string;
  /** API key override (falls back to the provider's). */
  apiKey?: string;
  /** Base URL override (falls back to the provider's). */
  baseUrl?: string;
  /**
   * Let the user add, edit and remove entries. Set false for a read-only
   * view of what the assistant remembers.
   * @default true
   */
  editable?: boolean;
  /** Modal title. @default "Assistant memory" */
  title?: string;
  /**
   * Colours and font. Same names as the drawer's style options, and the drawer
   * passes its own down — a dialog opening in the default light palette over a
   * themed application is the one thing this must not do.
   */
  theme?: DevicTheme;
}

function BrainIcon(): JSX.Element {
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
      <path d="M9.5 2a2.5 2.5 0 0 0-2.45 2A3.5 3.5 0 0 0 4.6 8.6 3.5 3.5 0 0 0 3 11.5c0 1.1.5 2.08 1.29 2.73A3.5 3.5 0 0 0 7 20a3 3 0 0 0 5-2.24V4.5A2.5 2.5 0 0 0 9.5 2Z" />
      <path d="M14.5 2a2.5 2.5 0 0 1 2.45 2 3.5 3.5 0 0 1 2.45 4.6A3.5 3.5 0 0 1 21 11.5a3.49 3.49 0 0 1-1.29 2.73A3.5 3.5 0 0 1 17 20a3 3 0 0 1-5-2.24V4.5A2.5 2.5 0 0 1 14.5 2Z" />
    </svg>
  );
}

function PinIcon(): JSX.Element {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <path d="M16 3a1 1 0 0 1 .97 1.243l-1.2 4.8 3.937 3.938A1 1 0 0 1 19 14.688V15a1 1 0 0 1-1 1h-5v6l-1 1-1-1v-6H6a1 1 0 0 1-1-1v-.312a1 1 0 0 1 .293-.707L9.23 9.043l-1.2-4.8A1 1 0 0 1 9 3h7Z" />
    </svg>
  );
}

/**
 * Modal showing — and, when `editable`, managing — the core memory of an
 * assistant for a tenant/subtenant combination: the standing entries
 * (persona, instructions, decisions, profile) injected into every prompt of
 * the bucket the assistant resolves there. Lets the end user see and control
 * what the assistant permanently remembers about them.
 *
 * Backed by the public memory API (`/api/v1/memory/assistants/:id/core`);
 * the API key needs that endpoint allowed.
 */
export function CoreMemoryModal({
  isOpen,
  onClose,
  assistantId,
  tenantId,
  subtenantId,
  apiKey,
  baseUrl,
  editable = true,
  title = "Assistant memory",
  theme,
}: CoreMemoryModalProps): JSX.Element | null {
  const context = useOptionalDevicContext();
  const resolvedBaseUrl = baseUrl || context?.baseUrl || "https://api.devic.ai";
  const resolvedTenantId = tenantId || context?.tenantId;
  const resolvedSubtenantId = subtenantId || context?.subtenantId;

  const resolvedApiKey = apiKey || context?.apiKey;
  const resolvedGetToken = context?.getToken;

  const client = useMemo(
    () =>
      resolvedApiKey || resolvedGetToken
        ? new DevicApiClient({
            apiKey: resolvedApiKey,
            baseUrl: resolvedBaseUrl,
            getToken: resolvedGetToken,
          })
        : null,
    [resolvedApiKey, resolvedGetToken, resolvedBaseUrl]
  );

  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [entries, setEntries] = useState<CoreMemoryEntry[]>([]);
  const [limits, setLimits] = useState<CoreMemoryLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Inline composer / editor state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerSection, setComposerSection] = useState<string>("profile");
  const [composerText, setComposerText] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const scopeOptions = useMemo(
    () => ({
      tenantId: resolvedTenantId || undefined,
      subtenantId: resolvedSubtenantId || undefined,
    }),
    [resolvedTenantId, resolvedSubtenantId]
  );

  const refresh = useCallback(async () => {
    if (!client) {
      setError("API key not configured");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await client.getCoreMemory(assistantId, scopeOptions);
      setEnabled(list.enabled);
      setEntries(list.entries);
      setLimits(list.limits ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, assistantId, scopeOptions]);

  // Fetch on every open (memory may have changed since the last look).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setComposerOpen(false);
      setComposerText("");
      setEditingId(null);
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

  const runWrite = useCallback(
    async (write: () => Promise<unknown>) => {
      setSaving(true);
      setError(null);
      try {
        await write();
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [refresh]
  );

  const handleAdd = async () => {
    if (!client || !composerText.trim()) return;
    const ok = await runWrite(() =>
      client.addCoreMemoryEntry(
        assistantId,
        { content: composerText.trim(), section: composerSection },
        scopeOptions
      )
    );
    if (ok) {
      setComposerOpen(false);
      setComposerText("");
    }
  };

  const handleSaveEdit = async (entry: CoreMemoryEntry) => {
    if (!client || !editingText.trim()) return;
    const ok = await runWrite(() =>
      client.updateCoreMemoryEntry(
        assistantId,
        entry.id,
        { content: editingText.trim() },
        scopeOptions
      )
    );
    if (ok) setEditingId(null);
  };

  const handleRemove = async (entry: CoreMemoryEntry) => {
    if (!client) return;
    await runWrite(() =>
      client.deleteCoreMemoryEntry(assistantId, entry.id, scopeOptions)
    );
  };

  if (!isOpen) return null;

  // Group entries by section, canonical sections first.
  const sections: Array<{ name: string; entries: CoreMemoryEntry[] }> = [];
  const bySection = new Map<string, CoreMemoryEntry[]>();
  for (const entry of entries) {
    const list = bySection.get(entry.section);
    if (list) list.push(entry);
    else bySection.set(entry.section, [entry]);
  }
  for (const name of SECTIONS) {
    const list = bySection.get(name);
    if (list) {
      sections.push({ name, entries: list });
      bySection.delete(name);
    }
  }
  for (const [name, list] of bySection) sections.push({ name, entries: list });

  return createPortal(
    // The variables go on the overlay: a portal inherits nothing from the
    // drawer that opened it, so without this the dialog ignores the theme.
    <div
      className="devic-cm-overlay"
      style={themeVars(theme)}
      onClick={onClose}
    >
      <div
        className="devic-cm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="devic-cm-header">
          <h3 className="devic-cm-title">
            <BrainIcon />
            {title}
          </h3>
          <button
            className="devic-cm-close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="devic-cm-body">
          {error && <div className="devic-cm-error">{error}</div>}

          {loading ? (
            <div className="devic-cm-loading">Loading memory…</div>
          ) : !enabled ? (
            <div className="devic-cm-empty">
              Memory is not enabled for this assistant.
            </div>
          ) : entries.length === 0 && !composerOpen ? (
            <div className="devic-cm-empty">
              Nothing remembered yet. What the assistant learns and is told to
              keep will appear here.
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.name} className="devic-cm-section">
                <div className="devic-cm-section-title">{section.name}</div>
                {section.entries.map((entry) => (
                  <div key={entry.id} className="devic-cm-entry">
                    {editingId === entry.id ? (
                      <div className="devic-cm-editor">
                        <textarea
                          className="devic-cm-textarea"
                          value={editingText}
                          maxLength={limits?.maxEntryChars || undefined}
                          onChange={(e) => setEditingText(e.target.value)}
                          disabled={saving}
                          autoFocus
                        />
                        <div className="devic-cm-editor-actions">
                          <button
                            type="button"
                            className="devic-cm-btn devic-cm-btn-primary"
                            onClick={() => handleSaveEdit(entry)}
                            disabled={saving || !editingText.trim()}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="devic-cm-btn"
                            onClick={() => setEditingId(null)}
                            disabled={saving}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="devic-cm-entry-content">
                          {entry.pinned && (
                            <span
                              className="devic-cm-pin"
                              title="Pinned: always kept, never changed by the assistant"
                            >
                              <PinIcon />
                            </span>
                          )}
                          <span>{entry.content}</span>
                        </div>
                        {editable && (
                          <div className="devic-cm-entry-actions">
                            <button
                              type="button"
                              className="devic-cm-btn devic-cm-btn-small"
                              onClick={() => {
                                setEditingId(entry.id);
                                setEditingText(entry.content);
                              }}
                              disabled={saving}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="devic-cm-btn devic-cm-btn-small devic-cm-btn-danger"
                              onClick={() => handleRemove(entry)}
                              disabled={saving}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}

          {editable && enabled && !loading && (
            <div className="devic-cm-composer">
              {composerOpen ? (
                <>
                  <div className="devic-cm-composer-row">
                    <select
                      className="devic-cm-select"
                      value={composerSection}
                      onChange={(e) => setComposerSection(e.target.value)}
                      disabled={saving}
                    >
                      {SECTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    className="devic-cm-textarea"
                    placeholder="Something the assistant should always remember…"
                    value={composerText}
                    maxLength={limits?.maxEntryChars || undefined}
                    onChange={(e) => setComposerText(e.target.value)}
                    disabled={saving}
                    autoFocus
                  />
                  <div className="devic-cm-editor-actions">
                    <button
                      type="button"
                      className="devic-cm-btn devic-cm-btn-primary"
                      onClick={handleAdd}
                      disabled={saving || !composerText.trim()}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      className="devic-cm-btn"
                      onClick={() => {
                        setComposerOpen(false);
                        setComposerText("");
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="devic-cm-btn"
                  onClick={() => setComposerOpen(true)}
                  disabled={saving}
                >
                  + Add memory
                </button>
              )}
            </div>
          )}
        </div>

        {limits && enabled && (
          <div className="devic-cm-footer">
            {entries.length}/{limits.maxEntries} entries · up to{" "}
            {limits.maxEntryChars} characters each
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default CoreMemoryModal;
