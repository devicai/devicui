import type { DevicApiClient } from '../api/client';

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
   * Global tenant metadata
   */
  tenantMetadata?: Record<string, any>;

  /**
   * Global subtenant ID identifying a user/entity inside the tenant
   * (e.g. an end user of a SaaS that integrates Devic).
   */
  subtenantId?: string;

  /**
   * Global subtenant metadata (e.g. { id, name, email }). Used for
   * per-subtenant cost attribution and automatic tenant domain detection.
   */
  subtenantMetadata?: Record<string, any>;

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
  tenantMetadata?: Record<string, any>;

  /**
   * Global subtenant ID
   */
  subtenantId?: string;

  /**
   * Global subtenant metadata
   */
  subtenantMetadata?: Record<string, any>;

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
