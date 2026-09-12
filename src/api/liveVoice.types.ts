import type { ProcessMessageDto } from './types';

export interface LiveVoiceConfiguration {
  enabled: boolean;
  voice?: string;
  recordSessions?: boolean;
  maxDurationSeconds?: number;
}
export type LiveVoiceContext = Pick<ProcessMessageDto,
  'tenantId' | 'subtenantId' | 'metadata' | 'tools' | 'enabledTools' | 'disabledIntegrations' | 'tags'>;
export interface CreateLiveSessionRequest extends LiveVoiceContext { sdp: string; chatUid?: string; }
export interface LiveVoiceSession { sessionId: string; chatUid: string; sdp: string; maxDurationSeconds: number; }
export interface LiveVoiceTurn { role: 'user' | 'assistant'; text: string; }
export interface LiveVoiceSessionStatus {
  sessionId: string;
  chatUid: string;
  status: string;
  seconds: number;
  connected: boolean;
  interrupted?: boolean;
  restartRequested?: boolean;
  finalized?: boolean;
  transcript?: LiveVoiceTurn[];
  billing: 'included';
}
export interface LiveVoiceRecording {
  sessionId: string;
  chatUid: string;
  startedAt: number;
  status: string;
  seconds?: number;
  byteLength?: number;
  partial?: boolean;
}
export interface LiveVoiceUsage { seconds: number; sessions: number; unconfirmedSessions: number; billing: 'included'; }
