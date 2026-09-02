import type { JSX } from "react";
import { IntegrationsPanel, type IntegrationsPanelProps } from "./IntegrationsPanel";

export interface IntegrationsModalProps
  extends Omit<IntegrationsPanelProps, "active" | "dialog" | "onClose"> {
  /** Whether the modal is visible. */
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal where the END USER of an application manages their *own* third-party
 * accounts: the apps the developer offered to tenants of this assistant, each
 * with the accounts this tenant has connected, and the buttons to add or
 * remove one.
 *
 * The dialog shape of `IntegrationsPanel`, which is where all of it lives —
 * see there for what it does and why. Use that one directly to put the same
 * content in a page instead of over it.
 *
 * Closed, it stays mounted and simply renders nothing: what it has already
 * loaded survives, so reopening costs a re-read rather than the whole listing
 * again.
 */
export function IntegrationsModal({
  isOpen,
  ...rest
}: IntegrationsModalProps): JSX.Element | null {
  return <IntegrationsPanel {...rest} active={isOpen} dialog />;
}

export default IntegrationsModal;
