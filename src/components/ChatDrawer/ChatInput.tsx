import React, { useState, useRef, useCallback } from 'react';
import type { ChatInputProps } from './ChatDrawer.types';
import type { ChatFile } from '../../api/types';

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
  sendButtonContent,
}: ChatInputProps): JSX.Element {
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    // Convert File objects to ChatFile format
    const chatFiles: ChatFile[] = files.map((file) => ({
      name: file.name,
      fileType: getFileType(file.type),
    }));

    onSend(trimmedMessage, chatFiles.length > 0 ? chatFiles : undefined);
    setMessage('');
    setFiles([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, files, onSend]);

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

        <textarea
          ref={textareaRef}
          className="devic-input"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />

        {sendButtonContent ? (
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
      </div>
    </div>
  );
}

/**
 * Get file type category from MIME type
 */
function getFileType(
  mimeType: string
): 'image' | 'document' | 'audio' | 'video' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (
    mimeType.startsWith('application/pdf') ||
    mimeType.startsWith('application/msword') ||
    mimeType.startsWith('text/')
  ) {
    return 'document';
  }
  return 'other';
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
