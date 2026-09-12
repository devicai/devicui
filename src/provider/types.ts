import type { DevicApiClient } from '../api/client';
import type { DevicTranslations } from '../i18n/types';

/**
 * Tenant-level identity metadata sent to the Devic API. Used for per-tenant
 * cost attribution and to enrich the tenant record (name, contact, logo).
 *
 * Carried inside the request `metadata` (the keys are flattened into it). All
 * fields are optional and the bag stays open, so extra keys are allowed.
 */
export interface TenantMetadata {
  /** Human-friendly tenant name. `displayName` is accepted as an alias. */
  name?: string;
  displayName?: string;
  /** Tenant contact email. */
  email?: string;
  /** Tenant logo URL. `logoUrl` is accepted as an alias. */
  imageUrl?: string;
  logoUrl?: string;
  /** Any additional, integrator-defined metadata. */
  [key: string]: any;
}

/**
 * Subtenant-level identity metadata (the end user/entity inside a tenant).
 * Sent nested under `metadata.subtenantMetadata`. Drives per-subtenant cost
 * attribution and automatic tenant domain detection.
 */
export interface SubtenantMetadata {
  /** Canonical subtenant id (alternative to the top-level `subtenantId`). */
  id?: string;
  /** Display name. `displayName` is accepted as an alias. */
  name?: string;
  displayName?: string;
  /** Subtenant email (also feeds tenant domain detection). */
  email?: string;
  /** Subtenant avatar / logo URL. `logoUrl` is accepted as an alias. */
  imageUrl?: string;
  logoUrl?: string;
  /** Any additional, integrator-defined metadata. */
  [key: string]: any;
}

/**
 * Configuration for the DevicProvider
 */
export interface DevicProviderConfig {
  /**
   * API key for authentication.
   *
   * Optional when `getTenantSession` is supplied — a page that authenticates with
   * tenant sessions has no reason to carry a key at all.
   */
  apiKey?: string;

  /**
   * Fetches a tenant session from YOUR backend, which is the only place that
   * knows which of your users is logged in.
   *
   * This is what makes the tenant a fact rather than a claim. With an API key
   * alone the tenant is whatever the page declares, and the key sits in the
   * bundle for anyone to read — so anyone can declare any tenant. A session is
   * signed by your server, expires, and cannot reach beyond what an end user is
   * allowed to do.
   *
   * It does not have to reach your backend on every call: if you mint the
   * session inside your own login and put it in a cookie, this is just
   * `async () => readCookie(…)`. Give it a lifetime matching your own session
   * (`ttlSeconds`, up to 12 h) and pair it with `onSessionExpired`.
   *
   * Return the token, or `{ token, expiresAt }` if you know when it dies. It is
   * called again on its own before expiry and after a rejected request, so it
   * must be safe to call repeatedly.
   *
   * @example
   * ```tsx
   * <DevicProvider
   *   getTenantSession={async () => {
   *     const r = await fetch('/api/devic-session', { credentials: 'include' });
   *     return r.json();          // { token, expiresAt }
   *   }}
   * >
   * ```
   */
  getTenantSession?: () => Promise<string | { token: string; expiresAt?: number; expiresIn?: number }>;

  /**
   * Called when the session is dead and cannot be replaced — the API rejected
   * it and `getTenantSession` handed back the same expired token.
   *
   * Matters most when the session comes from a cookie with no way to renew it:
   * without this the widget simply stops answering, at the exact moment the
   * user's own login has also expired. Refresh, send them to log in, or say
   * something — but say it.
   */
  onSessionExpired?: () => void;

  /**
   * Base URL for the Devic API
   * @default 'https://api.devic.ai'
   */
  baseUrl?: string;

  /**
   * Global tenant ID for multi-tenant environments
   */
  tenantId?: string;

  /**
   * Global tenant metadata (e.g. { name, email, imageUrl }).
   */
  tenantMetadata?: TenantMetadata;

  /**
   * Global subtenant ID identifying a user/entity inside the tenant
   * (e.g. an end user of a SaaS that integrates Devic).
   */
  subtenantId?: string;

  /**
   * Global subtenant metadata (e.g. { id, name, email, imageUrl }). Used for
   * per-subtenant cost attribution and automatic tenant domain detection.
   */
  subtenantMetadata?: SubtenantMetadata;

  /**
   * Global tags applied to every conversation started under this provider.
   * Sent as the top-level `tags` of each message (distinct from metadata).
   * Can be overridden/extended per ChatDrawer or per message.
   */
  tags?: string[];

  /**
   * How often (ms) a conversation still in progress is polled for new content,
   * for every component under this provider: the ChatDrawer, the command bar,
   * the generation button, the element wrapper and the handoff widget.
   *
   * The default answers as fast as the API produces tokens. Raise it when the
   * cost of the requests matters more than the latency of the answer — a
   * dashboard with several drawers mounted, a page left open all day, a
   * mobile client on a metered connection.
   *
   * Values below 250 ms are clamped: below that the widget floods the API
   * rather than answering sooner. Overridable per component via its own
   * `pollingInterval`.
   *
   * @default 1000
   */
  pollingInterval?: number;

  /**
   * Follow a conversation in progress over a server-sent event stream
   * instead of polling it, for every component under this provider. The
   * assistant's reply then arrives as it is produced, and the request per
   * `pollingInterval` becomes a fallback that only runs while the stream is
   * down. Needs an API that serves `GET .../chats/:chatUid/stream`; against
   * an older one the widgets notice and keep polling. Overridable per
   * component via its own `streaming`.
   *
   * @default false
   */
  streaming?: boolean;

  /**
   * Translations for the texts the library renders itself — the drawer
   * header, the input placeholder, the buttons and tooltips of every widget.
   *
   * A plain `English text → your text` map, so the values come from whatever
   * i18n system the host already runs (i18next, react-intl, a JSON per
   * locale): nothing is looked up here beyond the key. Anything absent stays
   * in English, so a partial dictionary is fine, and texts already
   * configurable on their own (`welcomeMessage`, `inputPlaceholder`, …) keep
   * winning over it.
   *
   * Texts with a `{name}` placeholder keep it in the translation; the
   * placeholders are filled after the lookup, so they may be reordered.
   *
   * @example
   * ```tsx
   * <DevicProvider
   *   apiKey="devic-xxx"
   *   translations={{
   *     'New chat': 'Nueva conversación',
   *     'Type a message...': 'Escribe un mensaje...',
   *     'Close chat': 'Cerrar el chat',
   *   }}
   * >
   * ```
   */
  translations?: DevicTranslations;

  /**
   * Enable debug logging to the browser console
   * @default false
   */
  debug?: boolean;
}

/**
 * Reference to an element wrapped by AIElementWrapper that can be sent
 * along with the next message in the ChatDrawer.
 */
export interface AIReference {
  /** Unique ID generated when the reference is added */
  id: string;
  /** Short label displayed as a chip */
  label: string;
  /** Optional rich content describing the referenced element */
  content?: React.ReactNode;
  /** Optional structured data describing the element (used to build prompts) */
  data?: Record<string, any>;
}

/**
 * Minimal drawer handle interface used by the provider to register a
 * ChatDrawer instance so AIElementWrapper can open it remotely.
 */
export interface DrawerRegistration {
  open: () => void;
  close: () => void;
  toggle?: () => void;
  sendMessage?: (message: string) => void;
  /** Load a conversation, so another widget can hand one over — the voice bubble does. */
  setChatUid?: (chatUid: string) => void;
}

/**
 * Context value provided by DevicProvider
 */
export interface DevicContextValue {
  /**
   * API client instance
   */
  client: DevicApiClient;

  /**
   * Current API key. Absent when the page authenticates with tenant sessions.
   */
  apiKey?: string;

  /**
   * The session source, when one was configured. Passed down so a component
   * used outside this provider can still authenticate the same way.
   */
  getTenantSession?: DevicProviderConfig['getTenantSession'];

  /**
   * Reported when the session cannot be replaced. Passed down for the same
   * reason as the session source itself.
   */
  onSessionExpired?: DevicProviderConfig['onSessionExpired'];

  /**
   * Base URL for the API
   */
  baseUrl: string;

  /**
   * Global tenant ID
   */
  tenantId?: string;

  /**
   * Global tenant metadata
   */
  tenantMetadata?: TenantMetadata;

  /**
   * Global subtenant ID
   */
  subtenantId?: string;

  /**
   * Global subtenant metadata
   */
  subtenantMetadata?: SubtenantMetadata;

  /**
   * Global tags applied to every conversation started under this provider.
   */
  tags?: string[];

  /**
   * Interval (ms) used to poll conversations in progress. Undefined when the
   * integrator did not configure one, so each component keeps its own default.
   */
  pollingInterval?: number;

  /**
   * Whether conversations are followed over a server-sent event stream.
   * Undefined when the integrator did not choose, so each component keeps its
   * own default.
   */
  streaming?: boolean;

  /**
   * Translations for the texts the library renders itself, keyed by the
   * English text. Undefined when the integrator configured none.
   */
  translations?: DevicTranslations;

  /**
   * Whether the provider is properly configured
   */
  isConfigured: boolean;

  /**
   * Whether debug logging is enabled
   */
  debug?: boolean;

  /**
   * Active references created by AIElementWrapper components.
   * The ChatDrawer reads them to display chips and prefix outgoing messages.
   */
  references: AIReference[];

  /**
   * Add a new reference. Returns the generated ID.
   */
  addReference: (ref: Omit<AIReference, 'id'>) => string;

  /**
   * Remove a reference by ID.
   */
  removeReference: (id: string) => void;

  /**
   * Clear all references.
   */
  clearReferences: () => void;

  /**
   * Register a ChatDrawer handle so AIElementWrapper can open it.
   * Returns an unregister function for cleanup.
   */
  registerDrawer: (handle: DrawerRegistration) => () => void;

  /**
   * Open the registered drawer (no-op if none is registered). With a
   * `chatUid`, that conversation is loaded first.
   */
  openDrawer: (chatUid?: string) => void;

  /**
   * Whether a ChatDrawer is currently registered, so a widget that offers to
   * open one — the voice bubble's *Open in chat* — can know whether to.
   */
  hasDrawer: boolean;
}

/**
 * Props for the DevicProvider component
 */
export interface DevicProviderProps extends DevicProviderConfig {
  children: React.ReactNode;
}
