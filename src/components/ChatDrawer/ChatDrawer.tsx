import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { useDevicChat } from '../../hooks/useDevicChat';
import { useOptionalDevicContext } from '../../provider';
import { DevicApiClient } from '../../api/client';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { ConversationSelector } from './ConversationSelector';
import { ChatDrawerErrorBoundary } from './ErrorBoundary';
import { UsageBar } from './UsageBar';
import { LimitBanner } from './LimitBanner';
import type { ChatDrawerProps, ChatDrawerOptions, ChatDrawerHandle } from './ChatDrawer.types';
import './styles.css';

const DEFAULT_OPTIONS: Required<ChatDrawerOptions> = {
  position: 'right',
  width: '100%',
  defaultOpen: false,
  color: '#1890ff',
  welcomeMessage: '',
  suggestedMessages: [],
  enableFileUploads: false,
  allowedFileTypes: { images: true, documents: true },
  maxFileSize: 10 * 1024 * 1024,
  enableSpeechToText: false,
  speechLanguage: undefined as any,
  speechAutoStop: true,
  speechAutoStopCountdownMs: 1000,
  speechAutoStopSilenceMs: 1000,
  speechAutoStopSilenceRatio: 0.1,
  speechAutoStopSilenceLevel: 0.02,
  speechAutoStopSpeechLevel: 0.12,
  speechHandoff: false,
  speechHandoffSendDelayMs: 1000,
  inputPlaceholder: 'Type a message...',
  title: 'Chat',
  showAvatar: false,
  showToolTimeline: true,
  zIndex: 1000,
  borderRadius: 0,
  resizable: false,
  minWidth: 300,
  maxWidth: 800,
  style: {},
  fontFamily: undefined as any,
  backgroundColor: undefined as any,
  textColor: undefined as any,
  secondaryBackgroundColor: undefined as any,
  borderColor: undefined as any,
  userBubbleColor: undefined as any,
  userBubbleTextColor: undefined as any,
  assistantBubbleColor: undefined as any,
  assistantBubbleTextColor: undefined as any,
  sendButtonColor: undefined as any,
  loadingIndicator: undefined as any,
  sendButtonContent: undefined as any,
  toolRenderers: undefined as any,
  toolIcons: undefined as any,
  showFeedback: true,
  handoffWidgetRenderer: undefined as any,
  toolGroups: undefined as any,
  stopButtonContent: undefined as any,
  debug: false,
  persistConversation: false,
  customPromptBox: undefined as any,
  conversationPreview: 'date',
  showUsageBar: false,
  usageBarMetric: undefined as any,
  hideLimitBanner: false,
  limitBannerRenderer: undefined as any,
};

/**
 * Chat drawer component for Devic assistants
 *
 * @example
 * ```tsx
 * <ChatDrawer
 *   ref={drawerRef}
 *   assistantId="my-assistant"
 *   options={{
 *     position: 'right',
 *     width: 400,
 *     welcomeMessage: 'Hello! How can I help you?',
 *     suggestedMessages: ['Help me with...', 'Tell me about...'],
 *   }}
 *   modelInterfaceTools={[
 *     {
 *       toolName: 'get_user_location',
 *       schema: { ... },
 *       callback: async () => ({ lat: 40.7, lng: -74.0 })
 *     }
 *   ]}
 *   onMessageReceived={(msg) => console.log('Received:', msg)}
 * />
 * ```
 */
export const ChatDrawer = forwardRef<ChatDrawerHandle, ChatDrawerProps>(
  function ChatDrawer(props, ref) {
    return (
      <ChatDrawerErrorBoundary>
        <ChatDrawerInner {...props} forwardedRef={ref} />
      </ChatDrawerErrorBoundary>
    );
  }
);

interface ChatDrawerInnerProps extends ChatDrawerProps {
  forwardedRef?: React.Ref<ChatDrawerHandle>;
}

function ChatDrawerInner({
  assistantId,
  chatUid: initialChatUid,
  options = {},
  enabledTools,
  modelInterfaceTools,
  tenantId,
  tenantMetadata,
  subtenantId,
  subtenantMetadata,
  apiKey,
  baseUrl,
  onMessageSent,
  onMessageReceived,
  onToolCall,
  onError,
  onChatCreated,
  onFileUpload,
  onOpen,
  onClose,
  isOpen: controlledIsOpen,
  className,
  mode = 'drawer',
  onConversationChange,
  forwardedRef,
}: ChatDrawerInnerProps): JSX.Element {
  // Merge options with defaults
  const mergedOptions = useMemo(
    () => ({ ...DEFAULT_OPTIONS, ...options }),
    [options]
  );

  // localStorage key for persisting selected conversation
  const storageKey = mergedOptions.persistConversation
    ? `devic-ui-chatUid-${assistantId}`
    : null;

  // Resolve initial chatUid: prop takes priority, then localStorage
  const resolvedInitialChatUid = useMemo(() => {
    if (initialChatUid) return initialChatUid;
    if (storageKey) {
      try { return localStorage.getItem(storageKey) || undefined; } catch { return undefined; }
    }
    return undefined;
  }, [initialChatUid, storageKey]);

  // Drawer open state (can be controlled or uncontrolled; inline mode is always open)
  const [internalIsOpen, setInternalIsOpen] = useState(mergedOptions.defaultOpen);
  const isInline = mode === 'inline';
  const isOpen = isInline ? true : (controlledIsOpen ?? internalIsOpen);

  // Wrap onChatCreated to persist chatUid in localStorage
  const handleChatCreated = useCallback(
    (chatUid: string) => {
      if (storageKey) {
        try { localStorage.setItem(storageKey, chatUid); } catch {}
      }
      onChatCreated?.(chatUid);
    },
    [storageKey, onChatCreated]
  );

  // Use chat hook
  const chat = useDevicChat({
    assistantId,
    chatUid: resolvedInitialChatUid,
    apiKey,
    baseUrl,
    tenantId,
    tenantMetadata,
    subtenantId,
    subtenantMetadata,
    enabledTools,
    modelInterfaceTools,
    onMessageSent,
    onMessageReceived,
    onToolCall,
    onError,
    onChatCreated: handleChatCreated,
    onFileUpload,
    debug: mergedOptions.debug,
  });

  // Fetch assistant avatar when showAvatar is enabled
  const context = useOptionalDevicContext();
  const resolvedApiKey = apiKey || context?.apiKey;
  const resolvedBaseUrl = baseUrl || context?.baseUrl || 'https://api.devic.ai';
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const avatarFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!mergedOptions.showAvatar || !resolvedApiKey || avatarFetchedRef.current === assistantId) return;
    avatarFetchedRef.current = assistantId;
    const client = new DevicApiClient({ apiKey: resolvedApiKey, baseUrl: resolvedBaseUrl });
    client.getAssistant(assistantId).then((a) => {
      if (a.imgUrl) setAvatarUrl(a.imgUrl);
    }).catch(() => {});
  }, [mergedOptions.showAvatar, assistantId, resolvedApiKey, resolvedBaseUrl]);

  // Tenant/subtenant resolution mirrors useDevicChat (prop overrides provider).
  const resolvedTenantId = tenantId || context?.tenantId;
  const resolvedSubtenantId = subtenantId || context?.subtenantId;

  // Usage bar (above the input) — only when enabled and a tenant is known.
  // Refetches after each turn via the message count as refresh key.
  const usageBarNode =
    mergedOptions.showUsageBar && resolvedTenantId ? (
      <UsageBar
        apiKey={resolvedApiKey}
        baseUrl={resolvedBaseUrl}
        tenantId={resolvedTenantId}
        subtenantId={resolvedSubtenantId}
        mode={mergedOptions.showUsageBar === 'onDemand' ? 'onDemand' : 'always'}
        metric={mergedOptions.usageBarMetric}
        color={mergedOptions.color}
        refreshKey={chat.messages.length}
        debug={mergedOptions.debug}
      />
    ) : null;

  // Default usage-limit banner (above the input) — opt-out via hideLimitBanner,
  // override via limitBannerRenderer.
  const limitBannerNode =
    chat.limitExceeded && !mergedOptions.hideLimitBanner
      ? mergedOptions.limitBannerRenderer
        ? mergedOptions.limitBannerRenderer(chat.limitExceeded)
        : <LimitBanner limit={chat.limitExceeded} />
      : null;

  // Speech-to-text transcription, exposed to custom prompt boxes so a developer
  // can transcribe audio (binary or URL) and attach the resulting transcriptId.
  const transcribeAudio = useCallback(
    (
      audio: Blob | string,
      transcribeOptions?: {
        language?: string;
        messageUid?: string;
        chatUid?: string;
        tenantId?: string;
      },
    ) => {
      if (!resolvedApiKey) {
        return Promise.reject(
          new Error('API key not configured. Cannot transcribe audio.'),
        );
      }
      const client = new DevicApiClient({ apiKey: resolvedApiKey, baseUrl: resolvedBaseUrl });
      return client.transcribeAudio(audio, {
        language: transcribeOptions?.language ?? mergedOptions.speechLanguage,
        messageUid: transcribeOptions?.messageUid,
        chatUid: transcribeOptions?.chatUid,
        tenantId: transcribeOptions?.tenantId ?? tenantId,
      });
    },
    [resolvedApiKey, resolvedBaseUrl, mergedOptions.speechLanguage, tenantId],
  );

  // Handle open/close
  const handleOpen = useCallback(() => {
    setInternalIsOpen(true);
    onOpen?.();
  }, [onOpen]);

  const handleClose = useCallback(() => {
    setInternalIsOpen(false);
    onClose?.();
  }, [onClose]);

  const handleToggle = useCallback(() => {
    setInternalIsOpen((prev) => !prev);
  }, []);

  // Expose handle for programmatic control
  useImperativeHandle(forwardedRef, () => ({
    open: handleOpen,
    close: handleClose,
    toggle: handleToggle,
    setChatUid: (chatUid: string) => {
      chat.loadChat(chatUid);
    },
    sendMessage: (message: string) => {
      chat.sendMessage(message);
    },
  }), [handleOpen, handleClose, handleToggle, chat]);

  // Register this drawer in the DevicProvider so AIElementWrapper can open it
  useEffect(() => {
    if (!context?.registerDrawer) return;
    const unregister = context.registerDrawer({
      open: handleOpen,
      close: handleClose,
      toggle: handleToggle,
      sendMessage: (message: string) => chat.sendMessage(message),
    });
    return unregister;
  }, [context, handleOpen, handleClose, handleToggle, chat]);

  // Partition pending widget calls by render mode
  const { inlineWidgets, inputWidget } = useMemo(() => {
    const inline: typeof chat.pendingWidgetCalls = [];
    let input: typeof chat.pendingWidgetCalls[number] | null = null;
    for (const wc of chat.pendingWidgetCalls) {
      if (wc.widget.render === 'input' && !input) {
        input = wc;
      } else {
        inline.push(wc);
      }
    }
    return { inlineWidgets: inline, inputWidget: input };
  }, [chat.pendingWidgetCalls]);

  // Active references from DevicProvider (created by AIElementWrapper)
  const references = context?.references ?? [];
  const removeReference = useCallback(
    (id: string) => {
      context?.removeReference(id);
    },
    [context]
  );
  const clearReferences = useCallback(() => {
    context?.clearReferences();
  }, [context]);

  // Handle send message — prefix references and clear them after sending
  const handleSend = useCallback(
    (message: string, files?: File[], meta?: { transcriptId?: string }) => {
      let finalMessage = message;
      if (references.length > 0) {
        const labels = references.map((r) => `"${r.label}"`).join(', ');
        finalMessage = `Elemento referenciado: ${labels}\n\n${message}`;
      }
      chat.sendMessage(finalMessage, { files, transcriptId: meta?.transcriptId });
      if (references.length > 0) clearReferences();
    },
    [chat, references, clearReferences]
  );

  // Handle conversation selection
  const handleConversationSelect = useCallback(
    (chatUid: string) => {
      chat.loadChat(chatUid);
      onConversationChange?.(chatUid);
      if (storageKey) {
        try { localStorage.setItem(storageKey, chatUid); } catch {}
      }
    },
    [chat, onConversationChange, storageKey]
  );

  const handleNewChat = useCallback(() => {
    chat.clearChat();
    if (storageKey) {
      try { localStorage.removeItem(storageKey); } catch {}
    }
  }, [chat, storageKey]);

  // Handle suggested message click
  const handleSuggestedClick = useCallback(
    (message: string) => {
      chat.sendMessage(message);
    },
    [chat]
  );

  // Feedback state
  const [feedbackMap, setFeedbackMap] = useState<Map<string, 'positive' | 'negative'>>(new Map());
  const feedbackClientRef = useRef<DevicApiClient | null>(null);

  // Initialize feedback client
  useEffect(() => {
    if (resolvedApiKey && !feedbackClientRef.current) {
      feedbackClientRef.current = new DevicApiClient({
        apiKey: resolvedApiKey,
        baseUrl: resolvedBaseUrl,
      });
    }
  }, [resolvedApiKey, resolvedBaseUrl]);

  // Load existing feedback when chat changes
  useEffect(() => {
    if (!chat.chatUid || !feedbackClientRef.current || !mergedOptions.showFeedback) return;

    feedbackClientRef.current.getChatFeedback(assistantId, chat.chatUid)
      .then((entries) => {
        const newMap = new Map<string, 'positive' | 'negative'>();
        for (const entry of entries) {
          if (entry.feedback !== undefined) {
            newMap.set(entry.requestId, entry.feedback ? 'positive' : 'negative');
          }
        }
        setFeedbackMap(newMap);
      })
      .catch(() => {
        // Silently ignore feedback loading errors
      });
  }, [chat.chatUid, assistantId, mergedOptions.showFeedback]);

  // Handle feedback submission
  const handleFeedback = useCallback(
    async (messageId: string, positive: boolean, comment?: string) => {
      if (!chat.chatUid || !feedbackClientRef.current) return;

      try {
        await feedbackClientRef.current.submitChatFeedback(assistantId, chat.chatUid, {
          messageId,
          feedback: positive,
          feedbackComment: comment,
        });

        setFeedbackMap((prev) => {
          const newMap = new Map(prev);
          newMap.set(messageId, positive ? 'positive' : 'negative');
          return newMap;
        });
      } catch (err) {
        console.error('Failed to submit feedback:', err);
        throw err;
      }
    },
    [chat.chatUid, assistantId]
  );

  // Apply CSS variables for theming on the drawer element itself
  // (must target the component root so they override the defaults defined on .devic-chat-drawer)
  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    const vars: [string, string | undefined][] = [
      ['--devic-primary', mergedOptions.color !== DEFAULT_OPTIONS.color ? mergedOptions.color : undefined],
      ['--devic-font-family', mergedOptions.fontFamily],
      ['--devic-bg', mergedOptions.backgroundColor],
      ['--devic-text', mergedOptions.textColor],
      ['--devic-bg-secondary', mergedOptions.secondaryBackgroundColor],
      ['--devic-border', mergedOptions.borderColor],
      ['--devic-user-bubble', mergedOptions.userBubbleColor],
      ['--devic-user-bubble-text', mergedOptions.userBubbleTextColor],
      ['--devic-assistant-bubble', mergedOptions.assistantBubbleColor],
      ['--devic-assistant-bubble-text', mergedOptions.assistantBubbleTextColor],
      ['--devic-send-btn', mergedOptions.sendButtonColor],
    ];
    for (const [name, value] of vars) {
      if (value) {
        el.style.setProperty(name, value);
      } else {
        el.style.removeProperty(name);
      }
    }
  }, [mergedOptions.color, mergedOptions.fontFamily, mergedOptions.backgroundColor, mergedOptions.textColor, mergedOptions.secondaryBackgroundColor, mergedOptions.borderColor, mergedOptions.userBubbleColor, mergedOptions.userBubbleTextColor, mergedOptions.assistantBubbleColor, mergedOptions.assistantBubbleTextColor, mergedOptions.sendButtonColor]);

  // Resizable drawer
  const [resizedWidth, setResizedWidth] = useState<number | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = drawerRef.current?.offsetWidth ?? 0;
      const isLeft = mergedOptions.position === 'left';

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const newWidth = startWidth + (isLeft ? delta : -delta);
        const clamped = Math.min(
          mergedOptions.maxWidth,
          Math.max(mergedOptions.minWidth, newWidth)
        );
        setResizedWidth(clamped);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [mergedOptions.position, mergedOptions.minWidth, mergedOptions.maxWidth]
  );

  // Build style object
  const baseWidth = resizedWidth
    ? `${resizedWidth}px`
    : typeof mergedOptions.width === 'number'
      ? `${mergedOptions.width}px`
      : mergedOptions.width;

  const drawerStyle = useMemo(
    () => ({
      width: baseWidth,
      zIndex: mergedOptions.zIndex,
      borderRadius: typeof mergedOptions.borderRadius === 'number'
        ? `${mergedOptions.borderRadius}px`
        : mergedOptions.borderRadius,
      ...mergedOptions.style,
    }),
    [baseWidth, mergedOptions.zIndex, mergedOptions.borderRadius, mergedOptions.style]
  );

  const overlayStyle = useMemo(
    () => ({
      zIndex: mergedOptions.zIndex - 1,
    }),
    [mergedOptions.zIndex]
  );

  const triggerStyle = useMemo(
    () => ({
      zIndex: mergedOptions.zIndex - 1,
      [mergedOptions.position]: 20,
      bottom: 20,
    }),
    [mergedOptions.zIndex, mergedOptions.position]
  );

  return (
    <>
      {/* Overlay (drawer mode only) */}
      {!isInline && (
        <div
          className="devic-drawer-overlay"
          data-open={isOpen}
          style={overlayStyle}
          onClick={handleClose}
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`devic-chat-drawer ${className || ''}`}
        data-position={mergedOptions.position}
        data-open={isOpen}
        data-mode={mode}
        style={drawerStyle}
      >
        {/* Resize handle */}
        {mergedOptions.resizable && (
          <div
            className="devic-resize-handle"
            data-position={mergedOptions.position}
            onMouseDown={handleResizeStart}
          />
        )}

        {/* Header */}
        <div className="devic-drawer-header">
          {avatarUrl && (
            <img
              className="devic-drawer-avatar"
              src={avatarUrl}
              alt=""
              aria-hidden="true"
            />
          )}
          <h2 className="devic-drawer-title">{mergedOptions.title}</h2>
          <ConversationSelector
            assistantId={assistantId}
            currentChatUid={chat.chatUid}
            onSelect={handleConversationSelect}
            onNewChat={handleNewChat}
            apiKey={apiKey}
            baseUrl={baseUrl}
            tenantId={tenantId}
            conversationPreview={mergedOptions.conversationPreview}
          />
          <div className="devic-drawer-header-actions">
            <button
              className="devic-new-chat-btn"
              onClick={handleNewChat}
              type="button"
              aria-label="New chat"
              title="New chat"
            >
              <PlusIcon />
            </button>
            {!isInline && (
              <button
                className="devic-drawer-close"
                onClick={handleClose}
                type="button"
                aria-label="Close chat"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </div>

        {/* Error display */}
        {chat.error && (
          <div className="devic-error">
            {chat.error.message}
          </div>
        )}

        {/* Messages */}
        <ChatMessages
          messages={chat.messages}
          allMessages={chat.messages}
          isLoading={chat.isLoading}
          welcomeMessage={mergedOptions.welcomeMessage}
          suggestedMessages={mergedOptions.suggestedMessages}
          onSuggestedClick={handleSuggestedClick}
          showToolTimeline={mergedOptions.showToolTimeline}
          toolRenderers={mergedOptions.toolRenderers}
          toolIcons={mergedOptions.toolIcons}
          loadingIndicator={mergedOptions.loadingIndicator}
          showFeedback={mergedOptions.showFeedback}
          feedbackMap={feedbackMap}
          onFeedback={handleFeedback}
          handedOffSubThreadId={chat.handedOffSubThreadId || undefined}
          onHandoffCompleted={chat.onHandoffCompleted}
          handoffWidgetRenderer={mergedOptions.handoffWidgetRenderer}
          toolGroups={mergedOptions.toolGroups}
          apiKey={resolvedApiKey}
          baseUrl={resolvedBaseUrl}
          pendingInlineWidgets={inlineWidgets}
          onSubmitWidget={chat.submitWidgetResponse}
          onCancelWidget={chat.cancelWidgetCall}
        />

        {/* Input */}
        {mergedOptions.customPromptBox ? (
          <div className="devic-input-area">
            {limitBannerNode}
            {usageBarNode}
            {mergedOptions.customPromptBox({
              sendMessage: handleSend,
              transcribeAudio,
              stop: chat.stopChat,
              isLoading: chat.isLoading,
              newConversation: chat.clearChat,
              references,
              removeReference,
              clearReferences,
              limitExceeded: chat.limitExceeded,
            })}
          </div>
        ) : (
          <ChatInput
            onSend={handleSend}
            disabled={
              chat.isLoading ||
              chat.handedOff ||
              inlineWidgets.length > 0 ||
              !!chat.limitExceeded
            }
            placeholder={mergedOptions.inputPlaceholder}
            enableFileUploads={mergedOptions.enableFileUploads}
            allowedFileTypes={mergedOptions.allowedFileTypes}
            maxFileSize={mergedOptions.maxFileSize}
            enableSpeechToText={mergedOptions.enableSpeechToText}
            speechLanguage={mergedOptions.speechLanguage}
            speechTenantId={tenantId}
            speechAutoStop={mergedOptions.speechAutoStop}
            speechAutoStopCountdownMs={mergedOptions.speechAutoStopCountdownMs}
            speechAutoStopSilenceMs={mergedOptions.speechAutoStopSilenceMs}
            speechAutoStopSilenceRatio={mergedOptions.speechAutoStopSilenceRatio}
            speechAutoStopSilenceLevel={mergedOptions.speechAutoStopSilenceLevel}
            speechAutoStopSpeechLevel={mergedOptions.speechAutoStopSpeechLevel}
            speechHandoff={mergedOptions.speechHandoff}
            speechHandoffSendDelayMs={mergedOptions.speechHandoffSendDelayMs}
            apiKey={resolvedApiKey}
            baseUrl={resolvedBaseUrl}
            sendButtonContent={mergedOptions.sendButtonContent}
            disabledMessage={
              chat.handedOff
                ? 'Waiting for subagent to complete'
                : inlineWidgets.length > 0
                  ? 'Waiting for tool response'
                  : undefined
            }
            isProcessing={chat.isLoading && !chat.handedOff}
            onStop={chat.stopChat}
            stopButtonContent={mergedOptions.stopButtonContent}
            pendingInputWidget={inputWidget}
            onSubmitWidget={chat.submitWidgetResponse}
            onCancelWidget={chat.cancelWidgetCall}
            references={references}
            onRemoveReference={removeReference}
            usageBar={usageBarNode}
            limitBanner={limitBannerNode}
          />
        )}
      </div>

      {/* Trigger button (drawer mode only, when closed) */}
      {!isInline && !isOpen && (
        <button
          className="devic-trigger"
          onClick={handleOpen}
          style={triggerStyle}
          type="button"
          aria-label="Open chat"
        >
          <ChatIcon />
        </button>
      )}
    </>
  );
}

/**
 * Close icon
 */
function CloseIcon(): JSX.Element {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * Plus icon for new chat button
 */
function PlusIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/**
 * Chat icon for trigger button
 */
function ChatIcon(): JSX.Element {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
    </svg>
  );
}
