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
   * Whether the provider is properly configured
   */
  isConfigured: boolean;
}

/**
 * Props for the DevicProvider component
 */
export interface DevicProviderProps extends DevicProviderConfig {
  children: React.ReactNode;
}
