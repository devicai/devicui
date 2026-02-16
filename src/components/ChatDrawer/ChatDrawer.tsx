import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { useDevicChat } from '../../hooks/useDevicChat';
import { useOptionalDevicContext } from '../../provider';
import { DevicApiClient } from '../../api/client';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { ConversationSelector } from './ConversationSelector';
import { ChatDrawerErrorBoundary } from './ErrorBoundary';
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
  apiKey,
  baseUrl,
  onMessageSent,
  onMessageReceived,
  onToolCall,
  onError,
  onChatCreated,
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

  // Drawer open state (can be controlled or uncontrolled; inline mode is always open)
  const [internalIsOpen, setInternalIsOpen] = useState(mergedOptions.defaultOpen);
  const isInline = mode === 'inline';
  const isOpen = isInline ? true : (controlledIsOpen ?? internalIsOpen);

  // Use chat hook
  const chat = useDevicChat({
    assistantId,
    chatUid: initialChatUid,
    apiKey,
    baseUrl,
    tenantId,
    tenantMetadata,
    enabledTools,
    modelInterfaceTools,
    onMessageSent,
    onMessageReceived,
    onToolCall,
    onError,
    onChatCreated,
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

  // Handle send message
  const handleSend = useCallback(
    (message: string, files?: any[]) => {
      chat.sendMessage(message, { files });
    },
    [chat]
  );

  // Handle conversation selection
  const handleConversationSelect = useCallback(
    (chatUid: string) => {
      chat.loadChat(chatUid);
      onConversationChange?.(chatUid);
    },
    [chat, onConversationChange]
  );

  const handleNewChat = useCallback(() => {
    chat.clearChat();
  }, [chat]);

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
        />

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          disabled={chat.isLoading || chat.handedOff}
          placeholder={mergedOptions.inputPlaceholder}
          enableFileUploads={mergedOptions.enableFileUploads}
          allowedFileTypes={mergedOptions.allowedFileTypes}
          maxFileSize={mergedOptions.maxFileSize}
          sendButtonContent={mergedOptions.sendButtonContent}
          disabledMessage={chat.handedOff ? 'Waiting for subagent to complete' : undefined}
          isProcessing={chat.isLoading && !chat.handedOff}
          onStop={chat.stopChat}
          stopButtonContent={mergedOptions.stopButtonContent}
        />
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
