/**
 * Shared contract for long blocks of pasted text.
 *
 * A long paste is shown in the prompt box as an attachment card instead of
 * flooding the textarea, but its content still reaches the model in full: on
 * send it is prepended to the message inside a <pasted-text> block. The thread
 * parses those blocks back out so the bubble shows a card too, rather than
 * thousands of lines of raw text.
 *
 * Both sides of that round-trip live here so they can never drift apart.
 */

export interface PastedText {
  id: string;
  text: string;
}

/**
 * A pasted block could itself contain the literal closing tag (pasting this
 * very file, say), which would truncate the block when parsed back. Escaping it
 * on the way out keeps the round-trip exact and still reads as the intended
 * text to the model.
 */
const CLOSING_TAG = '</pasted-text>';
const ESCAPED_CLOSING_TAG = '<\\/pasted-text>';

const PASTED_BLOCK_RE = /<pasted-text id="([^"]*)">\n([\s\S]*?)\n<\/pasted-text>/g;

/** Serialize a pasted block for the message sent to the assistant. */
export function toPastedBlock({ id, text }: PastedText): string {
  const escaped = text.split(CLOSING_TAG).join(ESCAPED_CLOSING_TAG);
  return `<pasted-text id="${id}">\n${escaped}\n${CLOSING_TAG}`;
}

/**
 * Pull the pasted blocks out of a user message, returning them alongside the
 * message with those blocks removed. Returns null when there are none, so
 * callers can keep rendering untouched messages exactly as before.
 */
export function parsePastedBlocks(
  content: string
): { blocks: PastedText[]; cleanContent: string } | null {
  const blocks: PastedText[] = [];
  const cleanContent = content
    .replace(PASTED_BLOCK_RE, (_match, id: string, text: string) => {
      blocks.push({
        id,
        text: text.split(ESCAPED_CLOSING_TAG).join(CLOSING_TAG),
      });
      return '';
    })
    .trim();

  if (blocks.length === 0) return null;
  return { blocks, cleanContent };
}

/** Short, single-line-ish excerpt shown on the collapsed card. */
export function pastedPreview(text: string, maxChars = 160): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxChars
    ? `${collapsed.slice(0, maxChars)}…`
    : collapsed;
}

/** Line count shown on the card, mirroring how editors report a selection. */
export function pastedLineCount(text: string): number {
  return text.split('\n').length;
}
