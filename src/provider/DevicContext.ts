import { createContext, useContext } from 'react';
import type { DevicContextValue } from './types';

/**
 * Context for Devic configuration
 */
export const DevicContext = createContext<DevicContextValue | null>(null);

/**
 * Hook to access the Devic context
 * @throws Error if used outside of DevicProvider
 */
export function useDevicContext(): DevicContextValue {
  const context = useContext(DevicContext);
  if (!context) {
    throw new Error(
      'useDevicContext must be used within a DevicProvider. ' +
      'Make sure to wrap your component tree with <DevicProvider>.'
    );
  }
  return context;
}

/**
 * Hook to optionally access the Devic context
 * Returns null if not within a provider (for components that can work standalone)
 */
export function useOptionalDevicContext(): DevicContextValue | null {
  return useContext(DevicContext);
}
