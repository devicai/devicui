import React, { useEffect, useRef, useState } from "react";
import type { ChatMessage, PinnedMessage } from "../../api/types";
import { useTranslations, type Translator } from "../../i18n";
import {
  messageKey,
  messagePreviewText,
  messageThumbnail,
  type MessageThumbnail,
} from "./messageText";

/** A pinned message, resolved against the messages on screen. */
export interface PinnedMessageView {
  /** Server uid of the pinned message. */
  messageUid: string;
  role: "user" | "assistant";
  /** When it was pinned, epoch ms. */
  pinnedAt: number;
  /** userUID of whoever pinned it. */
  pinnedBy?: string;
  /** The message as the conversation renders it. */
  message: ChatMessage;
  /**
   * The beginning of what it says, as plain text on one line. Empty when the
   * message is only attachments.
   */
  preview: string;
  /** Its first image, or its first file, when it carries any. */
  thumbnail?: MessageThumbnail;
}

/** What a pinned-messages bar, the built-in one or yours, receives. */
export interface PinnedMessagesRendererProps {
  /** Pinned messages in the order they appear in the conversation. */
  pins: PinnedMessageView[];
  /** Scroll the conversation to a message and flash it. */
  scrollToMessage: (messageUid: string) => void;
  /** Unpin a message. */
  unpin: (messageUid: string) => void;
}

export type PinnedMessagesRenderer = (
  props: PinnedMessagesRendererProps
) => React.ReactNode;

/**
 * Resolves the stored pins against the messages on screen, in conversation
 * order. A pin whose message is not in the list — gone from the conversation,
 * or not loaded — is left out: there is nothing to show or jump to.
 */
export function buildPinnedMessageViews(
  pins: PinnedMessage[],
  messages: ChatMessage[]
): PinnedMessageView[] {
  if (!pins.length) return [];
  const position = new Map<string, number>();
  messages.forEach((m, i) => position.set(messageKey(m), i));
  return pins
    .filter((pin) => position.has(pin.messageUid))
    .sort((a, b) => position.get(a.messageUid)! - position.get(b.messageUid)!)
    .map((pin) => {
      const message = messages[position.get(pin.messageUid)!];
      return {
        ...pin,
        message,
        preview: messagePreviewText(message),
        thumbnail: messageThumbnail(message),
      };
    });
}

/** Segments of the track shown at once; more pins scroll through them. */
const MAX_SEGMENTS = 4;

/**
 * The bar above the conversation that keeps its pinned messages at hand.
 *
 * It shows one pin at a time — the beginning of the message, with a thumbnail
 * when it carries an image or a file — and a segmented track on its left edge
 * with one line per pin, the one shown highlighted. Clicking the bar jumps to
 * that message and moves the bar on to the previous pin, so clicking again
 * walks back through all of them. The list button opens every pin at once.
 */
export function PinnedMessagesBar({
  pins,
  scrollToMessage,
  unpin,
}: PinnedMessagesRendererProps): JSX.Element | null {
  const t = useTranslations();
  const count = pins.length;
  const [active, setActive] = useState(count - 1);
  const [listOpen, setListOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Follow the list as it changes: a single pin just added is shown, as the
  // one the reader is most likely to want next; a list replaced wholesale (a
  // different conversation) starts again from its latest pin; otherwise the
  // position is kept within bounds.
  const knownUidsRef = useRef<string[]>(pins.map((p) => p.messageUid));
  const uidsKey = pins.map((p) => p.messageUid).join("|");
  useEffect(() => {
    const known = new Set(knownUidsRef.current);
    const added = pins
      .map((p, i) => (known.has(p.messageUid) ? -1 : i))
      .filter((i) => i >= 0);
    knownUidsRef.current = pins.map((p) => p.messageUid);
    setActive((prev) =>
      added.length === 1 && known.size > 0
        ? added[0]
        : added.length > 0
          ? count - 1
          : Math.min(Math.max(prev, 0), count - 1)
    );
    if (count <= 1) setListOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uidsKey]);

  // The list closes on a click anywhere else, and on Escape.
  useEffect(() => {
    if (!listOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setListOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setListOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [listOpen]);

  if (count === 0) return null;
  const index = Math.min(Math.max(active, 0), count - 1);
  const current = pins[index];

  const handleMainClick = () => {
    scrollToMessage(current.messageUid);
    setActive((index - 1 + count) % count);
  };

  const visible = Math.min(count, MAX_SEGMENTS);
  const windowStart = Math.min(Math.max(index - (visible - 2), 0), count - visible);

  const title =
    count === 1
      ? t("Pinned message")
      : t("Pinned message #{index}", { index: index + 1 });

  return (
    <div
      className="devic-pinned-bar"
      ref={barRef}
      role="region"
      aria-label={t("Pinned messages")}
    >
      <div className="devic-pinned-track" aria-hidden="true">
        {Array.from({ length: visible }, (_, i) => (
          <span
            key={windowStart + i}
            className="devic-pinned-segment"
            data-active={windowStart + i === index ? "true" : "false"}
          />
        ))}
      </div>

      <button
        type="button"
        className="devic-pinned-main"
        onClick={handleMainClick}
        title={t("Go to pinned message")}
      >
        <PinThumbnail thumbnail={current.thumbnail} />
        <span className="devic-pinned-text">
          <span className="devic-pinned-title">{title}</span>
          <span className="devic-pinned-preview">
            {previewLabel(current, t)}
          </span>
        </span>
      </button>

      {count > 1 && (
        <button
          type="button"
          className="devic-pinned-icon-btn"
          onClick={() => setListOpen((open) => !open)}
          aria-expanded={listOpen}
          aria-label={t("All pinned messages")}
          title={t("All pinned messages")}
        >
          <ListGlyph />
        </button>
      )}
      <button
        type="button"
        className="devic-pinned-icon-btn"
        onClick={() => unpin(current.messageUid)}
        aria-label={t("Unpin message")}
        title={t("Unpin message")}
      >
        <PinOffGlyph />
      </button>

      {listOpen && (
        <div className="devic-pinned-list" role="list">
          <div className="devic-pinned-list-header">
            {t("{count} pinned messages", { count })}
          </div>
          {pins.map((pin, i) => (
            <div
              key={pin.messageUid}
              className="devic-pinned-list-item"
              role="listitem"
              data-active={i === index ? "true" : "false"}
            >
              <button
                type="button"
                className="devic-pinned-list-open"
                onClick={() => {
                  scrollToMessage(pin.messageUid);
                  setActive(i);
                  setListOpen(false);
                }}
              >
                <PinThumbnail thumbnail={pin.thumbnail} />
                <span className="devic-pinned-text">
                  <span className="devic-pinned-list-role">
                    {pin.role === "user" ? t("You") : t("Assistant")}
                  </span>
                  <span className="devic-pinned-preview">
                    {previewLabel(pin, t)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="devic-pinned-icon-btn"
                onClick={() => unpin(pin.messageUid)}
                aria-label={t("Unpin message")}
                title={t("Unpin message")}
              >
                <CloseGlyph />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The preview, or what the message carries when it has no text. */
function previewLabel(
  pin: PinnedMessageView,
  t: Translator
): string {
  if (pin.preview) return pin.preview;
  if (pin.thumbnail?.kind === "image") return t("Image");
  if (pin.thumbnail?.kind === "file") return pin.thumbnail.name || t("Attachment");
  return t("Message");
}

function PinThumbnail({
  thumbnail,
}: {
  thumbnail?: MessageThumbnail;
}): JSX.Element | null {
  const [broken, setBroken] = useState(false);
  const url = thumbnail?.kind === "image" ? thumbnail.url : undefined;
  useEffect(() => setBroken(false), [url]);
  if (!thumbnail) return null;
  if (thumbnail.kind === "image" && !broken) {
    return (
      <img
        className="devic-pinned-thumb"
        src={thumbnail.url}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  const extension = thumbnail.kind === "file" ? thumbnail.extension : undefined;
  return (
    <span className="devic-pinned-thumb devic-pinned-thumb--file" aria-hidden="true">
      <FileGlyph />
      {extension && <span className="devic-pinned-thumb-ext">{extension}</span>}
    </span>
  );
}

/* ── Icons ── */

function PinOffGlyph(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89" />
      <path d="m2 2 20 20" />
      <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />
    </svg>
  );
}

function ListGlyph(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function CloseGlyph(): JSX.Element {
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
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function FileGlyph(): JSX.Element {
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
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}
