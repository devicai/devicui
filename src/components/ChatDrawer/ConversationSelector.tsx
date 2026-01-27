import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOptionalDevicContext } from '../../provider';
import { DevicApiClient } from '../../api/client';
import type { ConversationSummary } from '../../api/types';
import type { ConversationSelectorProps } from './ChatDrawer.types';

export function ConversationSelector({
  assistantId,
  currentChatUid,
  onSelect,
  onNewChat,
  apiKey: propsApiKey,
  baseUrl: propsBaseUrl,
  tenantId: propsTenantId,
}: ConversationSelectorProps): JSX.Element {
  const context = useOptionalDevicContext();
  const apiKey = propsApiKey || context?.apiKey;
  const baseUrl = propsBaseUrl || context?.baseUrl || 'https://api.devic.ai';
  const tenantId = propsTenantId || context?.tenantId;

  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<DevicApiClient | null>(null);

  if (!clientRef.current && apiKey) {
    clientRef.current = new DevicApiClient({ apiKey, baseUrl });
  }

  // Update client config when props/context change
  useEffect(() => {
    if (clientRef.current && apiKey) {
      clientRef.current.setConfig({ apiKey, baseUrl });
    } else if (!clientRef.current && apiKey) {
      clientRef.current = new DevicApiClient({ apiKey, baseUrl });
    }
  }, [apiKey, baseUrl]);

  const fetchConversations = useCallback(async () => {
    if (!clientRef.current) return;
    setLoading(true);
    try {
      const list = await clientRef.current.listConversations(assistantId, { tenantId });
      setConversations(list);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [assistantId, tenantId]);

  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen, fetchConversations]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const currentConv = conversations.find((c) => c.chatUID === currentChatUid);
  const currentName = currentConv
    ? currentConv.name || formatDate(currentConv.creationTimestampMs)
    : 'New chat';

  const filtered = conversations.filter((c) =>
    !search || (c.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="devic-conversation-selector" ref={dropdownRef}>
      <button
        className="devic-conversation-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="devic-conversation-selector-label">{currentName}</span>
        <ChevronIcon open={isOpen} />
      </button>

      {isOpen && (
        <div className="devic-conversation-dropdown">
          <div className="devic-conversation-search-wrapper">
            <input
              className="devic-conversation-search"
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="devic-conversation-list">
            {loading && (
              <div className="devic-conversation-loading">Loading...</div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="devic-conversation-empty">No conversations</div>
            )}
            {!loading &&
              filtered.map((conv) => (
                <button
                  key={conv.chatUID}
                  className="devic-conversation-item"
                  data-active={conv.chatUID === currentChatUid}
                  type="button"
                  onClick={() => {
                    onSelect(conv.chatUID);
                    setIsOpen(false);
                  }}
                >
                  {conv.chatUID === currentChatUid && (
                    <span className="devic-conversation-item-check">
                      <CheckIcon />
                    </span>
                  )}
                  <span className="devic-conversation-item-name">
                    {conv.name || formatDate(conv.creationTimestampMs)}
                  </span>
                  <span className="devic-conversation-item-date">
                    {formatDate(conv.lastEditTimestampMs || conv.creationTimestampMs)}
                  </span>
                </button>
              ))}
          </div>

          <button
            className="devic-conversation-new"
            type="button"
            onClick={() => {
              onNewChat();
              setIsOpen(false);
            }}
          >
            + Start a new chat
          </button>
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : undefined, transition: '0.2s' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
