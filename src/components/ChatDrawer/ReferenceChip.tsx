import React from "react";

/**
 * Visual context a {@link ReferenceChip} is rendered in:
 * - `input`: inside the prompt box, as an editable, removable chip.
 * - `message`: above a sent user bubble, as a read-only chip.
 */
export type ReferenceChipVariant = "input" | "message";

export interface ReferenceChipProps {
  /** Short label shown inside the chip (quoted automatically). */
  label: string;
  /**
   * When provided, renders a remove (×) button that invokes this handler.
   * Only meaningful for the `input` variant.
   */
  onRemove?: () => void;
  /** Visual context. Defaults to `input`. */
  variant?: ReferenceChipVariant;
  /** Optional custom icon replacing the default reference arrow. */
  icon?: React.ReactNode;
  /** Extra className appended to the chip root. */
  className?: string;
}

/**
 * Reusable chip node for an AIElementWrapper reference. Shared by the
 * ChatInput (active references in the prompt box) and ChatMessages
 * (references parsed out of a sent user message), so both render the
 * exact same chip markup and styling.
 */
export function ReferenceChip({
  label,
  onRemove,
  variant = "input",
  icon,
  className,
}: ReferenceChipProps): JSX.Element {
  const base =
    variant === "message"
      ? "devic-message-reference-chip"
      : "devic-reference-chip";

  return (
    <div className={className ? `${base} ${className}` : base} title={label}>
      {icon ?? <ReferenceArrowIcon />}
      <span className={`${base}-label`}>"{label}"</span>
      {onRemove && (
        <button
          type="button"
          className="devic-reference-chip-remove"
          onClick={onRemove}
          aria-label="Quitar referencia"
        >
          &times;
        </button>
      )}
    </div>
  );
}

/** Corner-down-right arrow used as the default reference glyph. */
function ReferenceArrowIcon(): JSX.Element {
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
      aria-hidden="true"
    >
      <polyline points="15 10 20 15 15 20" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </svg>
  );
}
