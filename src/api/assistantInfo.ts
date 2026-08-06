import { useEffect, useState } from 'react';
import { DevicApiClient } from './client';
import type { AssistantSpecialization } from './types';

/**
 * One in-flight request per assistant, shared by everything that asks.
 *
 * An assistant's description does not depend on who is looking or on anything
 * that changes while a page is open, so asking twice can only ever produce the
 * same answer. It was being asked more than twice: the header wants the avatar,
 * the connected-apps control wants to know whether it should exist, and a host
 * that remounts the drawer to reset a conversation — which the console does —
 * made every one of them ask again.
 *
 * Cached as the promise rather than the result, so callers that arrive while
 * the first request is still open wait for it instead of starting a second.
 */
const inFlight = new Map<string, Promise<AssistantSpecialization | null>>();

/**
 * Same assistant, same deployment, same credential — anything else is a
 * different answer. The credential is part of it because an API key carries
 * the account: two keys can each have an assistant under the same identifier.
 */
function cacheKey(
  baseUrl: string,
  assistantId: string,
  credential: string
): string {
  return `${baseUrl}|${credential}|${assistantId}`;
}

/** Forget what is known about an assistant, so the next ask reaches the API. */
export function forgetAssistant(
  baseUrl: string,
  assistantId: string,
  credential = 'session'
): void {
  inFlight.delete(cacheKey(baseUrl, assistantId, credential));
}

export interface UseAssistantInfoOptions {
  assistantId: string;
  client: DevicApiClient | null;
  baseUrl: string;
  /** Distinguishes accounts in the cache key. */
  credential?: string;
  /** Ask only when this is true. */
  enabled?: boolean;
}

export interface AssistantInfoState {
  assistant: AssistantSpecialization | null;
  /**
   * True once an answer — or a failure — has arrived. Callers that gate on the
   * assistant must wait for this rather than for `assistant`, or they would
   * read a null that only means "not yet".
   */
  settled: boolean;
}

/**
 * What the API says about an assistant, fetched at most once per assistant.
 *
 * A failure resolves to `null` and `settled: true`: not knowing is an ordinary
 * outcome here, and every caller is expected to have something reasonable to do
 * without the answer.
 */
export function useAssistantInfo(
  options: UseAssistantInfoOptions
): AssistantInfoState {
  const {
    assistantId,
    client,
    baseUrl,
    credential = 'session',
    enabled = true,
  } = options;

  const [state, setState] = useState<AssistantInfoState>({
    assistant: null,
    settled: false,
  });

  useEffect(() => {
    if (!enabled || !client || !assistantId) return;

    const key = cacheKey(baseUrl, assistantId, credential);
    let cancelled = false;

    let request = inFlight.get(key);
    if (!request) {
      request = client.getAssistant(assistantId).catch(() => null);
      inFlight.set(key, request);
    }

    setState((prev) => (prev.settled ? { ...prev, settled: false } : prev));
    void request.then((assistant) => {
      if (!cancelled) setState({ assistant, settled: true });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, client, assistantId, baseUrl, credential]);

  return state;
}
