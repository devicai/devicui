import React, { useMemo, useState, useRef, useCallback } from 'react';
import { DevicContext } from './DevicContext';
import { DevicApiClient } from '../api/client';
import { createSharedSession } from './sharedSession';
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
  getTenantSession,
  onSessionExpired,
  baseUrl = DEFAULT_BASE_URL,
  tenantId,
  tenantMetadata,
  subtenantId,
  subtenantMetadata,
  tags,
  pollingInterval,
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

  // Both callbacks are read through a ref and handed on as stable wrappers.
  // An inline `getTenantSession={() => …}` is a new function on every render,
  // and passing it straight through would rebuild the client — throwing away
  // the session it holds, so the page fetches a token per render — and rebuild
  // the context, so every component below it would do the same.
  const sessionSourceRef = useRef(getTenantSession);
  sessionSourceRef.current = getTenantSession;
  const expiredRef = useRef(onSessionExpired);
  expiredRef.current = onSessionExpired;
  const usesSessions = !!getTenantSession;

  // One session for the whole tree: every component below builds its own API
  // client, and each dedupes only its own renewals — so without this, N clients
  // ask for N tokens. See `createSharedSession`.
  const tenantSession = useMemo(
    () =>
      usesSessions
        ? createSharedSession(() => sessionSourceRef.current!())
        : undefined,
    [usesSessions]
  );
  const sessionExpired = useMemo(() => () => expiredRef.current?.(), []);

  const client = useMemo(
    () =>
      new DevicApiClient({
        apiKey,
        baseUrl,
        getTenantSession: tenantSession,
        onSessionExpired: sessionExpired,
      }),
    [apiKey, baseUrl, tenantSession, sessionExpired]
  );

  const contextValue = useMemo<DevicContextValue>(
    () => ({
      client,
      apiKey,
      getTenantSession: tenantSession,
      onSessionExpired: sessionExpired,
      baseUrl,
      tenantId,
      tenantMetadata,
      subtenantId,
      subtenantMetadata,
      tags,
      pollingInterval,
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
      tenantSession,
      sessionExpired,
      usesSessions,
      baseUrl,
      tenantId,
      tenantMetadata,
      subtenantId,
      subtenantMetadata,
      tags,
      pollingInterval,
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
