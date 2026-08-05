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
  getToken,
  baseUrl = DEFAULT_BASE_URL,
  tenantId,
  tenantMetadata,
  subtenantId,
  subtenantMetadata,
  tags,
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

  // Held in a ref so an inline `getToken={() => …}` — which is a new function
  // on every render — does not rebuild the client and throw away the session
  // it is holding, which would mean fetching a token per render.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const usesSessions = !!getToken;

  const client = useMemo(
    () =>
      new DevicApiClient({
        apiKey,
        baseUrl,
        getToken: usesSessions
          ? () => getTokenRef.current!()
          : undefined,
      }),
    [apiKey, baseUrl, usesSessions]
  );

  const contextValue = useMemo<DevicContextValue>(
    () => ({
      client,
      apiKey,
      getToken,
      baseUrl,
      tenantId,
      tenantMetadata,
      subtenantId,
      subtenantMetadata,
      tags,
      isConfigured: !!apiKey || usesSessions,
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
      getToken,
      usesSessions,
      baseUrl,
      tenantId,
      tenantMetadata,
      subtenantId,
      subtenantMetadata,
      tags,
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
