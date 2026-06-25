import type { DevicApiClient } from '../api/client';

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
   * API key for authentication
   */
  apiKey: string;

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
   * Current API key
   */
  apiKey: string;

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
   * Open the registered drawer (no-op if none is registered).
   */
  openDrawer: () => void;
}

/**
 * Props for the DevicProvider component
 */
export interface DevicProviderProps extends DevicProviderConfig {
  children: React.ReactNode;
}
