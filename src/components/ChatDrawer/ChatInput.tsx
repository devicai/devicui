import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { ChatInputProps } from './ChatDrawer.types';
import { useSpeechRecording } from '../../hooks/useSpeechRecording';
import { DevicApiClient } from '../../api/client';

const FILE_TYPE_ACCEPT: Record<string, string[]> = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  documents: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
  ],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  video: ['video/mp4', 'video/webm', 'video/ogg'],
};

// Handoff (hands-free) loop timings.
const HANDOFF_PENDING_MS = 1000; // default cancellable countdown before auto-send
const HANDOFF_INACTIVITY_MS = 6000; // silence (no speech) that ends the loop

/**
 * Chat input component with file upload support
 */
export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  enableFileUploads = false,
  allowedFileTypes = { images: true, documents: true },
  maxFileSize = 10 * 1024 * 1024, // 10MB
  enableSpeechToText = false,
  speechLanguage,
  speechTenantId,
  speechAutoStop = true,
  speechAutoStopCountdownMs,
  speechAutoStopSilenceMs,
  speechAutoStopSilenceRatio,
  speechAutoStopSilenceLevel,
  speechAutoStopSpeechLevel,
  speechHandoff = false,
  speechHandoffSendDelayMs,
  apiKey,
  baseUrl,
  sendButtonContent,
  disabledMessage,
  isProcessing = false,
  onStop,
  stopButtonContent,
  pendingInputWidget,
  onSubmitWidget,
  onCancelWidget,
  references,
  onRemoveReference,
  usageBar,
  limitBanner,
}: ChatInputProps): JSX.Element {
  // When a widget is pending as 'input', render it in place of the textarea
  if (pendingInputWidget) {
    const WidgetComponent = pendingInputWidget.widget.component;
    return (
      <div className="devic-input-area" data-widget-mode="input">
        <div className="devic-input-widget" data-tool-name={pendingInputWidget.toolName}>
          <WidgetComponent
            toolCall={pendingInputWidget.toolCall}
            params={pendingInputWidget.params}
            submit={(response) => onSubmitWidget?.(pendingInputWidget.toolCall.id, response)}
            cancel={(reason) => onCancelWidget?.(pendingInputWidget.toolCall.id, reason)}
          />
        </div>
      </div>
    );
  }
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Speech-to-text state
  const [transcriptId, setTranscriptId] = useState<string | undefined>();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  // Holds the latest confirmRecording so the auto-stop callback (created before
  // confirmRecording is defined) always calls the current closure.
  const confirmRef = useRef<() => void>(() => {});
  const recording = useSpeechRecording({
    bars: 5,
    autoStop: speechAutoStop,
    ...(speechAutoStopCountdownMs != null && {
      autoStopCountdownMs: speechAutoStopCountdownMs,
    }),
    ...(speechAutoStopSilenceMs != null && {
      autoStopSilenceMs: speechAutoStopSilenceMs,
    }),
    ...(speechAutoStopSilenceRatio != null && {
      autoStopSilenceRatio: speechAutoStopSilenceRatio,
    }),
    ...(speechAutoStopSilenceLevel != null && {
      autoStopSilenceLevel: speechAutoStopSilenceLevel,
    }),
    ...(speechAutoStopSpeechLevel != null && {
      autoStopSpeechLevel: speechAutoStopSpeechLevel,
    }),
    onAutoStop: () => confirmRef.current(),
  });

  // --- Handoff (hands-free loop) state ---
  const [handoffActive, setHandoffActive] = useState(false);
  const [pendingSend, setPendingSend] = useState(false);
  const [pendingProgress, setPendingProgress] = useState(1);
  // Ref mirror so async callbacks (rAF, timers, document listeners) read the
  // live value without going stale.
  const handoffActiveRef = useRef(false);
  const pendingRafRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevProcessingRef = useRef(isProcessing);
  // Always-fresh send fn so the deferred auto-send uses the latest message.
  const handleSendRef = useRef<() => void>(() => {});

  // Client used only for the /whisper transcription call.
  const transcribeClient = useMemo(() => {
    if (!enableSpeechToText || !apiKey) return null;
    return new DevicApiClient({
      apiKey,
      baseUrl: baseUrl || 'https://api.devic.ai',
    });
  }, [enableSpeechToText, apiKey, baseUrl]);

  const speechEnabled =
    enableSpeechToText && recording.isSupported && !!transcribeClient;
  const isRecordingActive = recording.isRecording || recording.isPaused;

  // Calculate accepted file types
  const acceptedTypes = Object.entries(allowedFileTypes)
    .filter(([, enabled]) => enabled)
    .flatMap(([type]) => FILE_TYPE_ACCEPT[type] || [])
    .join(',');

  // Auto-resize textarea
  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  // Handle send
  const handleSend = useCallback(() => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage && files.length === 0) return;

    onSend(
      trimmedMessage,
      files.length > 0 ? files : undefined,
      transcriptId ? { transcriptId } : undefined,
    );
    setMessage('');
    setFiles([]);
    setTranscriptId(undefined);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, files, onSend, transcriptId]);
  // Keep a fresh send fn for the deferred handoff auto-send.
  handleSendRef.current = handleSend;

  // --- Speech-to-text handlers ---

  const clearPending = useCallback(() => {
    if (pendingRafRef.current !== null) {
      cancelAnimationFrame(pendingRafRef.current);
      pendingRafRef.current = null;
    }
    setPendingSend(false);
    setPendingProgress(1);
  }, []);

  // Fully exit the hands-free loop and stop any recording in progress.
  const cancelHandoff = useCallback(() => {
    handoffActiveRef.current = false;
    setHandoffActive(false);
    clearPending();
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    recording.cancel();
  }, [clearPending, recording]);

  const startRecording = useCallback(() => {
    setSpeechError(null);
    if (speechHandoff) {
      handoffActiveRef.current = true;
      setHandoffActive(true);
    }
    void recording.start();
  }, [recording, speechHandoff]);

  const cancelRecording = useCallback(() => {
    cancelHandoff();
  }, [cancelHandoff]);

  // Stop recording, transcribe the audio and fill the input for review.
  // Returns the trimmed transcription (or null if nothing was transcribed) so
  // the handoff loop can decide whether to auto-send or end.
  const confirmRecording = useCallback(async (): Promise<string | null> => {
    if (!transcribeClient) return null;
    const blob = await recording.stop();
    if (!blob || blob.size === 0) return null;

    setIsTranscribing(true);
    setSpeechError(null);
    try {
      const result = await transcribeClient.transcribeAudio(blob, {
        language: speechLanguage,
        tenantId: speechTenantId,
      });
      const text = (result.text || '').trim();
      if (text) {
        setMessage((prev) => (prev ? `${prev} ${text}`.trim() : text));
        setTranscriptId(result.transcriptId);
      }
      // Resize textarea and focus for review/edit.
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.style.height = 'auto';
          textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
          textarea.focus();
        }
      });
      return text;
    } catch (e) {
      setSpeechError(
        `Could not transcribe the audio: ${(e as Error)?.message || 'unknown error'}`,
      );
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [transcribeClient, recording, speechLanguage, speechTenantId]);

  // Cancellable countdown, then auto-send. Handoff stays active across the send
  // so the loop can continue after the assistant replies.
  const startPendingSend = useCallback(() => {
    const totalMs = speechHandoffSendDelayMs ?? HANDOFF_PENDING_MS;
    setPendingSend(true);
    setPendingProgress(1);
    const startedAt = Date.now();
    const step = () => {
      const elapsed = Date.now() - startedAt;
      setPendingProgress(Math.max(0, 1 - elapsed / totalMs));
      if (elapsed >= totalMs) {
        pendingRafRef.current = null;
        setPendingSend(false);
        setPendingProgress(1);
        handleSendRef.current(); // auto-send with the freshest message
        return;
      }
      pendingRafRef.current = requestAnimationFrame(step);
    };
    pendingRafRef.current = requestAnimationFrame(step);
  }, [speechHandoffSendDelayMs]);

  // Drives both the mic auto-stop and the manual confirm button, branching on
  // whether the hands-free loop is active.
  const handleConfirm = useCallback(async () => {
    const text = await confirmRecording();
    if (!handoffActiveRef.current) return; // normal mode: input already filled
    if (!text) {
      // Silent / empty turn → end the hands-free loop.
      cancelHandoff();
      setMessage('');
      setTranscriptId(undefined);
      return;
    }
    startPendingSend();
  }, [confirmRecording, cancelHandoff, startPendingSend]);

  // Auto-stop fires handleConfirm with the freshest closure.
  useEffect(() => {
    confirmRef.current = () => void handleConfirm();
  }, [handleConfirm]);

  // Any interaction during the pending countdown cancels the auto-send and
  // exits the loop (the user is taking manual control); text stays for editing.
  useEffect(() => {
    if (!pendingSend) return;
    const onInteract = () => {
      clearPending();
      handoffActiveRef.current = false;
      setHandoffActive(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    };
    document.addEventListener('mousedown', onInteract, true);
    document.addEventListener('keydown', onInteract, true);
    return () => {
      document.removeEventListener('mousedown', onInteract, true);
      document.removeEventListener('keydown', onInteract, true);
    };
  }, [pendingSend, clearPending]);

  // When the assistant finishes (isProcessing falls) while the loop is active,
  // re-activate listening for the next turn.
  useEffect(() => {
    const wasProcessing = prevProcessingRef.current;
    prevProcessingRef.current = isProcessing;
    if (
      handoffActive &&
      wasProcessing &&
      !isProcessing &&
      !disabled &&
      !pendingSend &&
      !isTranscribing &&
      !recording.isRecording &&
      !recording.isPaused
    ) {
      void recording.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing, handoffActive, disabled, pendingSend, isTranscribing]);

  // While listening in handoff with no speech yet, end the loop after a silence
  // window (an open mic with nothing said means the user is done).
  useEffect(() => {
    if (!(handoffActive && recording.isRecording && !recording.speechDetected)) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }
    inactivityTimerRef.current = setTimeout(() => {
      if (handoffActiveRef.current && !recording.speechDetected) cancelHandoff();
    }, HANDOFF_INACTIVITY_MS);
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [handoffActive, recording.isRecording, recording.speechDetected, cancelHandoff]);

  // Cleanup deferred work on unmount.
  useEffect(() => {
    return () => {
      if (pendingRafRef.current !== null) cancelAnimationFrame(pendingRafRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, []);

  // Handle key press
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Handle file selection
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);

      // Filter valid files
      const validFiles = selectedFiles.filter((file) => {
        if (file.size > maxFileSize) {
          console.warn(`File ${file.name} exceeds maximum size`);
          return false;
        }
        return true;
      });

      setFiles((prev) => [...prev, ...validFiles]);

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [maxFileSize]
  );

  // Remove file
  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="devic-input-area">
      {limitBanner}
      {usageBar}
      {disabledMessage && disabled && (
        <div className="devic-input-disabled-notice">
          <WaitingIcon />
          {disabledMessage}
        </div>
      )}
      {speechError && (
        <div className="devic-speech-error" role="alert">
          {speechError}
        </div>
      )}
      {handoffActive && (
        <div className="devic-handoff-bar" data-waiting={isProcessing ? 'true' : 'false'}>
          <span className="devic-handoff-dot" aria-hidden="true" />
          <span className="devic-handoff-label">
            {isProcessing ? 'Hands-free · waiting for reply' : 'Hands-free on'}
          </span>
          <button
            type="button"
            className="devic-handoff-stop"
            onClick={cancelHandoff}
            title="Stop hands-free"
            aria-label="Stop hands-free"
          >
            <CloseIcon />
          </button>
        </div>
      )}
      {references && references.length > 0 && (
        <div className="devic-reference-chips">
          {references.map((ref) => (
            <div key={ref.id} className="devic-reference-chip" title={ref.label}>
              <ReferenceIcon />
              <span className="devic-reference-chip-label">"{ref.label}"</span>
              <button
                type="button"
                className="devic-reference-chip-remove"
                onClick={() => onRemoveReference?.(ref.id)}
                aria-label="Quitar referencia"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="devic-file-preview">
          {files.map((file, idx) => (
            <div key={idx} className="devic-file-preview-item">
              <FileIcon />
              <span>{file.name}</span>
              <button
                className="devic-file-remove"
                onClick={() => removeFile(idx)}
                type="button"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="devic-input-wrapper">
        {pendingSend ? (
          <div className="devic-speech-panel" data-state="pending">
            <div className="devic-handoff-pending">
              <div className="devic-handoff-pending-icon">
                <SendCountdownRing progress={pendingProgress} />
                <SendIcon />
              </div>
              <div className="devic-handoff-pending-text">
                <span className="devic-handoff-pending-title">
                  Sending… interact to cancel
                </span>
                {message.trim() && (
                  <span className="devic-handoff-pending-preview">{message.trim()}</span>
                )}
              </div>
            </div>
          </div>
        ) : isTranscribing ? (
          <div className="devic-speech-panel" data-state="processing">
            <span className="devic-speech-spinner" aria-hidden="true" />
            <span className="devic-speech-status">Transcribing…</span>
          </div>
        ) : isRecordingActive ? (
          <div className="devic-speech-panel" data-state="recording">
            <button
              className="devic-input-btn devic-speech-cancel"
              onClick={cancelRecording}
              type="button"
              title="Cancel recording"
            >
              <CloseIcon />
            </button>
            <div className="devic-speech-live">
              <Equalizer levels={recording.levels} paused={recording.isPaused} />
              <span className="devic-speech-timer">
                {formatDuration(recording.durationMs)}
              </span>
            </div>
            <button
              className="devic-input-btn"
              onClick={recording.isPaused ? recording.resume : recording.pause}
              type="button"
              title={recording.isPaused ? 'Resume' : 'Pause'}
            >
              {recording.isPaused ? <PlayIcon /> : <PauseIcon />}
            </button>
            <div
              className="devic-speech-confirm-wrap"
              data-autostop={recording.isAutoStopping ? 'true' : 'false'}
            >
              {recording.isAutoStopping && (
                <AutoStopRing progress={recording.autoStopProgress} />
              )}
              <button
                className="devic-input-btn devic-speech-confirm"
                onClick={() => void handleConfirm()}
                type="button"
                title={
                  recording.isAutoStopping
                    ? 'Auto-sending… keep talking to cancel'
                    : 'Confirm'
                }
              >
                <CheckIcon />
              </button>
            </div>
          </div>
        ) : (
          <>
            {enableFileUploads && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptedTypes}
                  multiple
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <button
                  className="devic-input-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  type="button"
                  title="Attach file"
                >
                  <AttachIcon />
                </button>
              </>
            )}

            {speechEnabled && (
              <button
                className="devic-input-btn devic-speech-mic"
                onClick={startRecording}
                disabled={disabled || isProcessing}
                type="button"
                title="Record voice message"
              >
                <MicIcon />
              </button>
            )}

            <textarea
              ref={textareaRef}
              className="devic-input"
              value={message}
              onChange={(e) => {
                const value = e.target.value;
                setMessage(value);
                // If the user clears the field, drop the transcript link so a fresh
                // message isn't wrongly attributed to the previous transcription.
                if (transcriptId && value.trim() === '') setTranscriptId(undefined);
                handleInput();
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
            />

            {isProcessing ? (
              stopButtonContent ? (
                <div className="devic-send-btn-wrapper">
                  <div className="devic-send-btn-custom" aria-hidden="true">
                    {stopButtonContent}
                  </div>
                  <button
                    className="devic-send-btn-overlay"
                    onClick={onStop}
                    type="button"
                    title="Stop"
                  />
                </div>
              ) : (
                <button
                  className="devic-input-btn devic-stop-btn"
                  onClick={onStop}
                  type="button"
                  title="Stop"
                >
                  <StopIcon />
                </button>
              )
            ) : sendButtonContent ? (
              <div className="devic-send-btn-wrapper">
                <div className="devic-send-btn-custom" aria-hidden="true">
                  {sendButtonContent}
                </div>
                <button
                  className="devic-send-btn-overlay"
                  onClick={handleSend}
                  disabled={disabled || (!message.trim() && files.length === 0)}
                  type="button"
                  title="Send message"
                />
              </div>
            ) : (
              <button
                className="devic-input-btn devic-send-btn"
                onClick={handleSend}
                disabled={disabled || (!message.trim() && files.length === 0)}
                type="button"
                title="Send message"
              >
                <SendIcon />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Live equalizer rendered from the recording amplitude levels (0..1 per bar).
 * When paused, bars collapse to a flat baseline.
 */
function Equalizer({
  levels,
  paused,
}: {
  levels: number[];
  paused: boolean;
}): JSX.Element {
  return (
    <div className="devic-equalizer" aria-hidden="true" data-paused={paused}>
      {levels.map((level, i) => (
        <span
          key={i}
          className="devic-equalizer-bar"
          style={{ height: `${Math.max(10, Math.round((paused ? 0 : level) * 100))}%` }}
        />
      ))}
    </div>
  );
}

// Geometry for the auto-stop ring drawn around the confirm button.
const AUTOSTOP_RING_R = 18;
const AUTOSTOP_RING_C = 2 * Math.PI * AUTOSTOP_RING_R;

/**
 * Inverted circular progress drawn around the confirm button. Driven by
 * `progress` (1 → 0): a full ring that drains to empty over the countdown.
 */
function AutoStopRing({ progress }: { progress: number }): JSX.Element {
  return (
    <svg className="devic-autostop-ring" viewBox="0 0 40 40" aria-hidden="true">
      <circle
        className="devic-autostop-ring-track"
        cx="20"
        cy="20"
        r={AUTOSTOP_RING_R}
      />
      <circle
        className="devic-autostop-ring-progress"
        cx="20"
        cy="20"
        r={AUTOSTOP_RING_R}
        style={{
          strokeDasharray: AUTOSTOP_RING_C,
          strokeDashoffset: AUTOSTOP_RING_C * (1 - progress),
        }}
      />
    </svg>
  );
}

/**
 * Draining ring around the send icon during the handoff pending countdown.
 * Visually distinct from the auto-stop ring (slate→primary track, larger).
 */
function SendCountdownRing({ progress }: { progress: number }): JSX.Element {
  return (
    <svg className="devic-handoff-ring" viewBox="0 0 44 44" aria-hidden="true">
      <circle className="devic-handoff-ring-track" cx="22" cy="22" r={AUTOSTOP_RING_R} />
      <circle
        className="devic-handoff-ring-progress"
        cx="22"
        cy="22"
        r={AUTOSTOP_RING_R}
        style={{
          strokeDasharray: AUTOSTOP_RING_C,
          strokeDashoffset: AUTOSTOP_RING_C * (1 - progress),
        }}
      />
    </svg>
  );
}

/** Formats milliseconds as m:ss. */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Attach icon
 */
function AttachIcon(): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

/**
 * Send icon
 */
function SendIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

/**
 * File icon
 */
function FileIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}

/**
 * Microphone icon
 */
function MicIcon(): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

/**
 * Pause icon (two bars)
 */
function PauseIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

/**
 * Play icon (triangle)
 */
function PlayIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

/**
 * Check icon (confirm)
 */
function CheckIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Close icon (cancel)
 */
function CloseIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * Stop icon (square)
 */
function StopIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

/**
 * Reference icon (corner-down-right arrow)
 */
function ReferenceIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 10 20 15 15 20" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </svg>
  );
}

/**
 * Waiting icon (clock)
 */
function WaitingIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );
}
