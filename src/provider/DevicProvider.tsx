import React, { useMemo } from 'react';
import { DevicContext } from './DevicContext';
import { DevicApiClient } from '../api/client';
import type { DevicProviderProps, DevicContextValue } from './types';

const DEFAULT_BASE_URL = 'https://api.devic.ai';

/**
 * Provider component for Devic UI configuration
 *
 * @example
 * ```tsx
 * <DevicProvider
 *   apiKey="devic-xxx"
 *   baseUrl="https://api.devic.ai"
 *   tenantId="tenant-123"
 *   tenantMetadata={{ userId: '456' }}
 * >
 *   <App />
 * </DevicProvider>
 * ```
 */
export function DevicProvider({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  tenantId,
  tenantMetadata,
  children,
}: DevicProviderProps): JSX.Element {
  const contextValue = useMemo<DevicContextValue>(() => {
    const client = new DevicApiClient({
      apiKey,
      baseUrl,
    });

    return {
      client,
      apiKey,
      baseUrl,
      tenantId,
      tenantMetadata,
      isConfigured: !!apiKey,
    };
  }, [apiKey, baseUrl, tenantId, tenantMetadata]);

  return (
    <DevicContext.Provider value={contextValue}>
      {children}
    </DevicContext.Provider>
  );
}
