import React, { useState } from "react";
import type { PendingToolApproval } from "../../api/types";

export interface ToolApprovalRendererProps {
  approvals: PendingToolApproval[];
  onResolve: (
    decisions: { toolCallId: string; approved: boolean }[],
  ) => Promise<void>;
}

/** Replaces the built-in approval card while keeping the resolution action. */
export type ToolApprovalRenderer = (
  props: ToolApprovalRendererProps,
) => React.ReactNode;

export interface ToolApprovalCardProps extends ToolApprovalRendererProps {
  /** Optional complete visual override. Called only while approvals are pending. */
  renderer?: ToolApprovalRenderer;
}

/** Shared approval surface used by ChatDrawer/DeviQI and exportable to Active Chat. */
export function ToolApprovalCard({
  approvals,
  onResolve,
  renderer,
}: ToolApprovalCardProps): JSX.Element | null {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!approvals.length) return null;

  if (renderer) {
    return <>{renderer({ approvals, onResolve })}</>;
  }

  const resolveAll = async (approved: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      await onResolve(
        approvals.map((item) => ({ toolCallId: item.toolCallId, approved })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="devic-tool-approval" aria-live="polite">
      <div className="devic-tool-approval__title">Approval required</div>
      <p className="devic-tool-approval__description">
        The assistant wants to run{" "}
        {approvals.length === 1 ? "this tool" : "these tools"}. Nothing listed
        here runs until you approve it.
      </p>
      <div className="devic-tool-approval__calls">
        {approvals.map((approval) => (
          <details
            key={approval.toolCallId}
            className="devic-tool-approval__call"
          >
            <summary>
              <code>{approval.toolName}</code>
              {approval.toolServerName ? ` · ${approval.toolServerName}` : ""}
            </summary>
            {!!approval.categories.length && (
              <div className="devic-tool-approval__categories">
                {approval.categories.map((category) => (
                  <span key={category.id}>{category.name}</span>
                ))}
              </div>
            )}
            <pre>{JSON.stringify(approval.arguments, null, 2)}</pre>
          </details>
        ))}
      </div>
      {error && <div className="devic-tool-approval__error">{error}</div>}
      <div className="devic-tool-approval__actions">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void resolveAll(false)}
        >
          Reject
        </button>
        <button
          type="button"
          className="devic-tool-approval__approve"
          disabled={submitting}
          onClick={() => void resolveAll(true)}
        >
          {submitting ? "Submitting…" : "Approve and run"}
        </button>
      </div>
    </section>
  );
}
