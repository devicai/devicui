import type { ChatMessage } from "../../api/types";
import { normalizeMessageFile } from "../../api/types";
import { parsePastedBlocks } from "./pastedText";

/**
 * `content.message` is typed as a string, but it does not always arrive as
 * one: a tripped guardrail puts the whole provider result object there. Every
 * text path downstream — the reference prefix, the pasted blocks, markdown —
 * assumes a string and throws on anything else, taking the drawer with it.
 * Read the field through here so a bad shape renders as nothing instead.
 */
export function readMessageText(message: ChatMessage): string | undefined {
  const raw = message.content?.message;
  return typeof raw === "string" ? raw : undefined;
}

/**
 * Extracts the "Elemento referenciado: ..." prefix that ChatDrawer prepends
 * to user messages when AIElementWrapper references are active. Returns the
 * parsed labels and the message text without the prefix. Returns null when
 * the content does not start with the prefix.
 */
const REFERENCE_PREFIX_RE =
  /^Elemento referenciado: ((?:"[^"]+")(?:, "[^"]+")*)\n\n([\s\S]*)$/;

export function parseReferencedPrefix(
  content: string
): { references: string[]; cleanContent: string } | null {
  const m = content.match(REFERENCE_PREFIX_RE);
  if (!m) return null;
  const labels = (m[1].match(/"([^"]+)"/g) || []).map((s) =>
    s.slice(1, -1)
  );
  return { references: labels, cleanContent: m[2] };
}

/** The server uid of a message: the one pins and other references use. */
export function messageKey(message: ChatMessage): string {
  return message.serverUid ?? message.uid;
}

/**
 * Whether a message can be pinned: a bubble someone wrote, that the server
 * already has. A queued message, one still being streamed or an optimistic
 * copy the poll has not matched yet has no uid the API would recognise.
 */
export function isPinnableMessage(message: ChatMessage): boolean {
  return (
    (message.role === "user" || message.role === "assistant") &&
    !message.queued &&
    !message.streaming &&
    !messageKey(message).startsWith("temp-")
  );
}

/** Most characters of a message worth keeping for a one-line preview. */
const PREVIEW_MAX_CHARS = 160;

/**
 * The beginning of what a message says, as plain text on one line: without the
 * reference prefix and pasted blocks the bubble does not show either, and
 * without markdown syntax. Empty when the message is only attachments.
 */
export function messagePreviewText(message: ChatMessage): string {
  const raw = readMessageText(message);
  if (!raw) return "";
  let text = message.role === "user"
    ? (parseReferencedPrefix(raw)?.cleanContent ?? raw)
    : raw;
  if (message.role === "user") {
    text = parsePastedBlocks(text)?.cleanContent ?? text;
  }
  text = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, "")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/(^|\s)[*_](\S[^*_]*)[*_](?=\s|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > PREVIEW_MAX_CHARS
    ? `${text.slice(0, PREVIEW_MAX_CHARS).trimEnd()}…`
    : text;
}

/** What to show beside a message preview: its first image, or its first file. */
export type MessageThumbnail =
  | { kind: "image"; url: string; name: string }
  | { kind: "file"; name: string; extension?: string };

export function messageThumbnail(
  message: ChatMessage
): MessageThumbnail | undefined {
  const files = (message.content?.files ?? []).map(normalizeMessageFile);
  const image = files.find(
    (f) => f.type.toLowerCase() === "image" && f.url
  );
  if (image) return { kind: "image", url: image.url, name: image.name };
  const file = files[0];
  if (!file) return undefined;
  const dot = file.name?.lastIndexOf(".") ?? -1;
  return {
    kind: "file",
    name: file.name,
    extension:
      dot > 0 ? file.name.slice(dot + 1, dot + 5).toUpperCase() : undefined,
  };
}
