import React from "react";
import type { ReactNode } from "react";

/**
 * What the backend records when a guardrail stops a turn. Sent as the content
 * of a `guard_rail` message, and mirrored on the conversation itself.
 *
 * Every field is optional on purpose: this is a provider payload, its shape
 * varies with the guardrail that fired, and the notice has to survive whatever
 * comes back.
 */
export interface GuardrailPayload {
  tripwireTriggered?: boolean;
  info?: {
    guardrail_name?: string;
    flagged?: boolean;
    confidence?: number;
    threshold?: number;
    stage_name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface GuardrailNoticeProps {
  /** The guardrail result, when the backend sent a structured one. */
  payload?: GuardrailPayload;
  /** The message text, when the backend sent a plain sentence instead. */
  text?: string;
}

export type GuardrailRenderer = (props: GuardrailNoticeProps) => ReactNode;

/**
 * The line that replaces the answer when a guardrail stopped the turn.
 *
 * It is deliberately not a message bubble: nobody said this, the assistant was
 * prevented from speaking. What it does say is which guardrail fired, because
 * a reader who only sees "blocked" cannot tell a topic filter from an outage.
 */
export function GuardrailNotice({
  payload,
  text,
}: GuardrailNoticeProps): JSX.Element {
  return (
    <div className="devic-guardrail-notice" role="status">
      <span className="devic-guardrail-notice-icon" aria-hidden="true">
        <ShieldIcon />
      </span>
      <span>{text || noticeText(payload)}</span>
    </div>
  );
}

/**
 * Names the guardrail when the payload carries a name, and stays vague when it
 * does not — an invented name is worse than no name.
 */
function noticeText(payload?: GuardrailPayload): string {
  const name = payload?.info?.guardrail_name;
  const stage = payload?.info?.stage_name;

  if (!name) {
    return "This message was stopped by a guardrail.";
  }
  if (stage === "input") {
    return `Your message was stopped by the “${name}” guardrail.`;
  }
  return `The answer was stopped by the “${name}” guardrail.`;
}

function ShieldIcon(): JSX.Element {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
