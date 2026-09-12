import { useCallback, useEffect, useRef, useState } from 'react';
import type { DevicApiClient } from '../api/client';
import type { LiveVoiceContext } from '../api/liveVoice.types';
import type { LiveVoiceController, LiveVoiceSnapshot } from '../voice/LiveVoiceController';

export interface UseDevicLiveVoiceOptions {
  client: DevicApiClient | null;
  assistantId: string;
  chatUid?: string | null;
  enabled?: boolean;
  context?: LiveVoiceContext;
  onChatCreated?: (chatUid: string) => void;
  onError?: (error: Error) => void;
}
export interface UseDevicLiveVoiceResult extends LiveVoiceSnapshot {
  active: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  mute: (muted: boolean) => void;
  play: () => Promise<void>;
}

export function useDevicLiveVoice(options: UseDevicLiveVoiceOptions): UseDevicLiveVoiceResult {
  const [snapshot, setSnapshot] = useState<LiveVoiceSnapshot>({ state: 'idle', muted: false, seconds: 0, transcript: [] });
  const controller = useRef<LiveVoiceController>();
  const latest = useRef(options); latest.current = options;
  const generation = useRef(0);
  const starting = useRef(false);
  const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot;
  const adopted = useRef(options.chatUid);
  const signature = JSON.stringify(options.context ?? {});
  const stop = useCallback(async () => {
    ++generation.current; starting.current = false;
    if (!controller.current) setSnapshot(previous => ({ ...previous, state: 'idle' }));
    await controller.current?.stop();
  }, []);
  useEffect(() => {
    setSnapshot({ state: 'idle', muted: false, seconds: 0, transcript: [] });
    return () => {
      ++generation.current; starting.current = false;
      controller.current?.dispose(); controller.current = undefined;
    };
  }, [options.client, options.assistantId, signature, options.enabled]);
  useEffect(() => {
    if (options.chatUid !== adopted.current) { void stop(); adopted.current = options.chatUid; }
  }, [options.chatUid, stop]);
  const start = useCallback(async () => {
    const value = latest.current;
    if (!value.enabled || !value.client || starting.current || !['idle', 'error'].includes(snapshotRef.current.state)) return;
    starting.current = true;
    setSnapshot(previous => ({ ...previous, state: 'connecting', error: undefined }));
    const ticket = ++generation.current;
    try {
      const { LiveVoiceController } = await import('../voice/LiveVoiceController');
      if (ticket !== generation.current) return;
      if (!controller.current) controller.current = new LiveVoiceController(value.client, value.assistantId,
        JSON.parse(JSON.stringify(value.context ?? {})), setSnapshot, uid => {
          adopted.current = uid;
          latest.current.onChatCreated?.(uid);
        });
      await controller.current.start(adopted.current || undefined);
    } catch (error) {
      if (ticket === generation.current) setSnapshot(previous => ({ ...previous, state: 'error', error: error as Error }));
    } finally { if (ticket === generation.current) starting.current = false; }
  }, []);
  useEffect(() => { if (snapshot.error) latest.current.onError?.(snapshot.error); }, [snapshot.error]);
  return { ...snapshot, active: !['idle', 'error'].includes(snapshot.state), start, stop,
    mute: useCallback((muted: boolean) => controller.current?.mute(muted), []),
    play: useCallback(async () => { await controller.current?.play(); }, []) };
}
