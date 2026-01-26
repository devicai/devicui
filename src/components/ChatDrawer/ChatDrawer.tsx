import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDevicChat } from '../../hooks/useDevicChat';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import type { ChatDrawerProps, ChatDrawerOptions } from './ChatDrawer.types';
import './styles.css';

const DEFAULT_OPTIONS: Required<ChatDrawerOptions> = {
  position: 'right',
  width: 400,
  defaultOpen: false,
  color: '#1890ff',
  welcomeMessage: '',
  suggestedMessages: [],
  enableFileUploads: false,
  allowedFileTypes: { images: true, documents: true },
  maxFileSize: 10 * 1024 * 1024,
  inputPlaceholder: 'Type a message...',
  title: 'Chat',
  showToolTimeline: true,
  zIndex: 1000,
};

/**
 * Chat drawer component for Devic assistants
 *
 * @example
 * ```tsx
 * <ChatDrawer
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
export function ChatDrawer({
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
}: ChatDrawerProps): JSX.Element {
  // Merge options with defaults
  const mergedOptions = useMemo(
    () => ({ ...DEFAULT_OPTIONS, ...options }),
    [options]
  );

  // Drawer open state (can be controlled or uncontrolled)
  const [internalIsOpen, setInternalIsOpen] = useState(mergedOptions.defaultOpen);
  const isOpen = controlledIsOpen ?? internalIsOpen;

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

  // Handle open/close
  const handleOpen = useCallback(() => {
    setInternalIsOpen(true);
    onOpen?.();
  }, [onOpen]);

  const handleClose = useCallback(() => {
    setInternalIsOpen(false);
    onClose?.();
  }, [onClose]);

  // Handle send message
  const handleSend = useCallback(
    (message: string, files?: any[]) => {
      chat.sendMessage(message, { files });
    },
    [chat]
  );

  // Handle suggested message click
  const handleSuggestedClick = useCallback(
    (message: string) => {
      chat.sendMessage(message);
    },
    [chat]
  );

  // Apply CSS variable for primary color
  useEffect(() => {
    if (mergedOptions.color !== DEFAULT_OPTIONS.color) {
      document.documentElement.style.setProperty(
        '--devic-primary',
        mergedOptions.color
      );
    }
  }, [mergedOptions.color]);

  // Build style object
  const drawerStyle = useMemo(
    () => ({
      width: mergedOptions.width,
      zIndex: mergedOptions.zIndex,
    }),
    [mergedOptions.width, mergedOptions.zIndex]
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
      {/* Overlay */}
      <div
        className="devic-drawer-overlay"
        data-open={isOpen}
        style={overlayStyle}
        onClick={handleClose}
      />

      {/* Drawer */}
      <div
        className={`devic-chat-drawer ${className || ''}`}
        data-position={mergedOptions.position}
        data-open={isOpen}
        style={drawerStyle}
      >
        {/* Header */}
        <div className="devic-drawer-header">
          <h2 className="devic-drawer-title">{mergedOptions.title}</h2>
          <button
            className="devic-drawer-close"
            onClick={handleClose}
            type="button"
            aria-label="Close chat"
          >
            <CloseIcon />
          </button>
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
          isLoading={chat.isLoading}
          welcomeMessage={mergedOptions.welcomeMessage}
          suggestedMessages={mergedOptions.suggestedMessages}
          onSuggestedClick={handleSuggestedClick}
          showToolTimeline={mergedOptions.showToolTimeline}
        />

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          disabled={chat.isLoading}
          placeholder={mergedOptions.inputPlaceholder}
          enableFileUploads={mergedOptions.enableFileUploads}
          allowedFileTypes={mergedOptions.allowedFileTypes}
          maxFileSize={mergedOptions.maxFileSize}
        />
      </div>

      {/* Trigger button (when drawer is closed) */}
      {!isOpen && (
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
