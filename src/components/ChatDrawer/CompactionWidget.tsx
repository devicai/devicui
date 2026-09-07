import { useState, type JSX, type ReactNode } from "react";
import type {
  CompactionActivity,
  CompactionCheckpoint,
  CompactionSummary,
} from "../../api/types";

/** Data handed to a custom compaction renderer. */
export interface CompactionRendererProps {
  /**
   * The checkpoint at this point of the conversation. Null while a compaction
   * is being written and there is nothing to show yet.
   */
  checkpoint: CompactionCheckpoint | null;
  /**
   * True for the checkpoint that currently governs the context. Each
   * compaction merges the previous summary into itself, so the earlier ones
   * are a record rather than something still being sent.
   */
  isActive: boolean;
  /**
   * The compaction happening right now, or null. Present without a checkpoint
   * means one is being written; the numbers say what it is folding.
   */
  activity: CompactionActivity | null;
}

/** Replaces the built-in compaction marker. Return null to hide it. */
export type CompactionRenderer = (props: CompactionRendererProps) => ReactNode;

function formatTokens(value: number): string {
  if (!value) return "0";
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}

function CompressIcon(): JSX.Element {
  return (
    <svg
      className="devic-compaction-icon"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function ChevronIcon({ up }: { up: boolean }): JSX.Element {
  return (
    <svg
      className="devic-compaction-chevron"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: up ? "rotate(180deg)" : undefined }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="devic-compaction-section">
      <span className="devic-compaction-section-title">{title}</span>
      {children}
    </div>
  );
}

function Bullets({ items }: { items?: string[] }): JSX.Element | null {
  if (!items?.length) return null;
  return (
    <ul className="devic-compaction-list">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function hasStructure(summary: CompactionSummary): boolean {
  return Boolean(
    summary.goal ||
      summary.constraints?.length ||
      summary.inProgress ||
      summary.pending?.length ||
      summary.decisions?.length ||
      summary.data?.length ||
      summary.done?.length ||
      summary.openQuestions?.length
  );
}

export interface CompactionWidgetProps {
  checkpoint: CompactionCheckpoint | null;
  isActive?: boolean;
  activity?: CompactionActivity | null;
  renderer?: CompactionRenderer;
}

/**
 * The cut line in the conversation.
 *
 * Anchored to the last message a checkpoint folded, it marks the exact point
 * where the assistant's view of the conversation stops: everything above it
 * is still here, still readable, and no longer sent. Collapsed it is a rule
 * across the thread with the headline numbers; expanded it shows what the
 * assistant reads in place of those messages.
 *
 * With no checkpoint yet and a compaction in flight it says so instead — that
 * is a model call of its own, and without it the conversation just appears to
 * have gone quiet.
 *
 * Deliberately not a message bubble: a checkpoint is not something anyone
 * said.
 */
export function CompactionWidget({
  checkpoint,
  isActive = true,
  activity = null,
  renderer,
}: CompactionWidgetProps): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  if (renderer) {
    return <>{renderer({ checkpoint, isActive, activity })}</>;
  }

  const running = activity?.state === "running";

  if (!checkpoint) {
    if (!running) return null;
    return (
      <div className="devic-compaction devic-compaction-running">
        <span className="devic-compaction-rule" />
        <span className="devic-compaction-pill">
          <CompressIcon />
          <span className="devic-compaction-title">Compacting context</span>
          <span className="devic-compaction-meta">
            {activity!.messageCount} message
            {activity!.messageCount === 1 ? "" : "s"} ·{" "}
            {formatTokens(activity!.tokensBefore)} tokens
          </span>
          <span className="devic-compaction-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </span>
        <span className="devic-compaction-rule" />
      </div>
    );
  }

  const summary = checkpoint.summary || {};
  const structured = hasStructure(summary);

  return (
    <div className="devic-compaction">
      <div className="devic-compaction-head">
        <span className="devic-compaction-rule" />
        <button
          type="button"
          className="devic-compaction-pill"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={`${checkpoint.compactedMessageCount} message${
            checkpoint.compactedMessageCount === 1 ? "" : "s"
          } are still in this conversation but no longer sent to the assistant`}
        >
          <CompressIcon />
          <span className="devic-compaction-title">
            Context compacted
            {checkpoint.index > 1 ? ` (#${checkpoint.index})` : ""}
          </span>
          <span className="devic-compaction-meta">
            {checkpoint.compactedMessageCount} messages ·{" "}
            {formatTokens(checkpoint.tokensBefore)} →{" "}
            {formatTokens(checkpoint.tokensAfter)} tokens
          </span>
          {!isActive && (
            <span
              className="devic-compaction-tag"
              title="Superseded by a later compaction, which merged this summary into itself. Kept for the record."
            >
              superseded
            </span>
          )}
          <ChevronIcon up={expanded} />
        </button>
        <span className="devic-compaction-rule" />
      </div>

      {expanded && (
        <div className="devic-compaction-body">
          <div className="devic-compaction-note">
            This is what the assistant reads in place of the messages above.
            The messages themselves are still here.
          </div>

          {structured && (
            <>
              {summary.goal && <Section title="Goal">{summary.goal}</Section>}
              {!!summary.constraints?.length && (
                <Section title="Constraints">
                  <Bullets items={summary.constraints} />
                </Section>
              )}
              {summary.inProgress && (
                <Section title="In progress">{summary.inProgress}</Section>
              )}
              {!!summary.pending?.length && (
                <Section title="Pending">
                  <Bullets items={summary.pending} />
                </Section>
              )}
              {!!summary.decisions?.length && (
                <Section title="Decisions">
                  <Bullets items={summary.decisions} />
                </Section>
              )}
              {!!summary.data?.length && (
                <Section title="Key data">
                  <Bullets
                    items={summary.data.map((entry) =>
                      entry.label ? `${entry.label}: ${entry.value}` : entry.value
                    )}
                  />
                </Section>
              )}
              {!!summary.done?.length && (
                <Section title="Done">
                  <Bullets items={summary.done} />
                </Section>
              )}
              {!!summary.openQuestions?.length && (
                <Section title="Open questions">
                  <Bullets items={summary.openQuestions} />
                </Section>
              )}
            </>
          )}

          {summary.raw && (
            <Section title={structured ? "Notes" : "Summary"}>
              <div className="devic-compaction-raw">{summary.raw}</div>
            </Section>
          )}

          {!!checkpoint.facts?.length && (
            <Section title="Preserved exactly">
              <div className="devic-compaction-facts">
                {checkpoint.facts.map((fact, i) => (
                  <span key={i} className="devic-compaction-fact">
                    {fact.label ? (
                      <span className="devic-compaction-fact-label">
                        {fact.label}:{" "}
                      </span>
                    ) : null}
                    {fact.value}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

export default CompactionWidget;
