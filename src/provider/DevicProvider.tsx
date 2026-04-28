import React, { useMemo, useState, useRef, useCallback } from 'react';
import { DevicContext } from './DevicContext';
import { DevicApiClient } from '../api/client';
import { generateId } from '../utils';
import type {
  DevicProviderProps,
  DevicContextValue,
  AIReference,
  DrawerRegistration,
} from './types';

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
  debug,
  children,
}: DevicProviderProps): JSX.Element {
  const [references, setReferences] = useState<AIReference[]>([]);
  const drawerRef = useRef<DrawerRegistration | null>(null);

  const addReference = useCallback((ref: Omit<AIReference, 'id'>): string => {
    const id = generateId();
    setReferences((prev) => [...prev, { ...ref, id }]);
    return id;
  }, []);

  const removeReference = useCallback((id: string) => {
    setReferences((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clearReferences = useCallback(() => {
    setReferences([]);
  }, []);

  const registerDrawer = useCallback((handle: DrawerRegistration) => {
    drawerRef.current = handle;
    return () => {
      if (drawerRef.current === handle) {
        drawerRef.current = null;
      }
    };
  }, []);

  const openDrawer = useCallback(() => {
    drawerRef.current?.open();
  }, []);

  const client = useMemo(
    () => new DevicApiClient({ apiKey, baseUrl }),
    [apiKey, baseUrl]
  );

  const contextValue = useMemo<DevicContextValue>(
    () => ({
      client,
      apiKey,
      baseUrl,
      tenantId,
      tenantMetadata,
      isConfigured: !!apiKey,
      debug,
      references,
      addReference,
      removeReference,
      clearReferences,
      registerDrawer,
      openDrawer,
    }),
    [
      client,
      apiKey,
      baseUrl,
      tenantId,
      tenantMetadata,
      debug,
      references,
      addReference,
      removeReference,
      clearReferences,
      registerDrawer,
      openDrawer,
    ]
  );

  return (
    <DevicContext.Provider value={contextValue}>
      {children}
    </DevicContext.Provider>
  );
}
