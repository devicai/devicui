import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import type { Integration } from "../../api/types";
import { IntegrationLogo } from "./IntegrationLogo";
import type { IntegrationsState } from "./useIntegrations";
import "./IntegrationsModal.css";

export interface IntegrationsHintProps {
  /** Shared listing (see `useIntegrations`). */
  state: IntegrationsState;
  /** Opens the connected-apps modal. */
  onOpen: () => void;
  /**
   * Text on the left. Defaults to "Connect your apps", or "Explore connected
   * apps" once at least one is connected — an invitation the user has already
   * accepted stops being an invitation.
   */
  label?: string;
  /** Most logos to show before the `+N` box. @default 6 */
  maxLogos?: number;
  /**
   * Identity the dismissal is remembered against, so closing it for one end
   * user does not close it for the next one on the same browser.
   */
  storageKey?: string;
  /** Where the bar flies to when closed — the header control. */
  flyToSelector?: string;
  /** Light chips for a dark surface. */
  dark?: boolean;
  className?: string;
}

const STORAGE_PREFIX = "devic:apps-hint-dismissed:";

/** Reading storage throws in Safari's private mode and in sandboxed frames. */
function wasDismissed(key?: string): boolean {
  if (!key) return false;
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal(key?: string): void {
  if (!key) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, "1");
  } catch {
    // Then it comes back next session. Not worth a word to the user.
  }
}

/** Connected first, same order as the header control. */
function order(integrations: Integration[]): Integration[] {
  return [...integrations].sort((a, b) => {
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    return 0;
  });
}

/**
 * How many 24px chips fit once the label and the close button are paid for.
 *
 * The label is the whole reason this row exists, so it gets its space first:
 * a strip reading "Connect your …" beside seven logos has lost the argument.
 * Never fewer than three chips, below which the row stops reading as a set of
 * apps at all.
 */
function boxesThatFit(width: number, max: number): number {
  if (!width) return max + 1;
  const LABEL_AND_CLOSE = 195;
  return Math.max(3, Math.min(max + 1, Math.floor((width - LABEL_AND_CLOSE) / 30)));
}

/**
 * The strip above the composer that tells the end user their own apps can be
 * connected here.
 *
 * It exists because the header control is a row of small logos and nothing
 * else: discoverable once you know what it is, invisible until then. This says
 * it in words, once, and then gets out of the way for good — the dismissal is
 * remembered per end user, and closing it animates towards the header so that
 * what was dismissed is understood to still be there.
 */
export function IntegrationsHint({
  state,
  onOpen,
  label,
  maxLogos = 6,
  storageKey,
  flyToSelector = ".devic-int-launcher",
  dark = false,
  className = "",
}: IntegrationsHintProps): JSX.Element | null {
  const sorted = useMemo(() => order(state.integrations), [state.integrations]);
  const ref = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState(maxLogos + 1);
  const [dismissed, setDismissed] = useState(() => wasDismissed(storageKey));
  const [leaving, setLeaving] = useState(false);

  // A different end user has their own answer to whether this was dismissed.
  useEffect(() => {
    setDismissed(wasDismissed(storageKey));
    setLeaving(false);
  }, [storageKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () =>
      setBoxes(boxesThatFit(el.getBoundingClientRect().width, maxLogos));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxLogos, state.offered, dismissed]);

  /**
   * Sends a copy of the logos from the bar to the header control.
   *
   * A dismissal that simply blanks the row reads as "that is gone now". The
   * flight is the sentence "it moved up there" said without words — so if it
   * cannot be drawn (reduced motion, no target, no Web Animations API), the bar
   * just closes and nothing is lost.
   */
  const flyToLauncher = useCallback(() => {
    const bar = ref.current;
    if (!bar || typeof document === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // Scoped to the drawer this bar lives in: a page with two drawers has two
    // launchers, and the copy must fly to its own.
    const root = bar.closest(".devic-drawer") ?? document;
    const target = flyToSelector
      ? (root.querySelector(flyToSelector) as HTMLElement | null)
      : null;
    if (!target) return;

    const logos = bar.querySelector(".devic-int-hint-logos");
    const from = (logos ?? bar).getBoundingClientRect();
    const to = target.getBoundingClientRect();

    const ghost = (logos ?? bar).cloneNode(true) as HTMLElement;
    ghost.classList.add("devic-int-hint-ghost");
    ghost.style.left = `${from.left}px`;
    ghost.style.top = `${from.top}px`;
    ghost.style.width = `${from.width}px`;
    ghost.style.height = `${from.height}px`;
    document.body.appendChild(ghost);

    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = from.width ? Math.max(0.4, to.width / from.width) : 0.6;

    const animation = ghost.animate?.(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 0.95 },
        {
          transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
          opacity: 0,
        },
      ],
      { duration: 420, easing: "cubic-bezier(0.4, 0, 0.2, 1)" }
    );

    const remove = () => ghost.remove();
    if (animation) animation.onfinish = remove;
    else remove();
    // Belt and braces: a tab backgrounded mid-flight never fires onfinish.
    window.setTimeout(remove, 1200);
  }, [flyToSelector]);

  const dismiss = () => {
    flyToLauncher();
    rememberDismissal(storageKey);
    setLeaving(true);
    window.setTimeout(() => setDismissed(true), 220);
  };

  if (dismissed || !state.offered || sorted.length === 0) return null;

  const text =
    label ??
    (sorted.some((i) => i.connected)
      ? "Explore connected apps"
      : "Connect your apps");

  // When some apps will not fit, the `+N` box takes one of the slots itself.
  const capacity = Math.max(1, boxes);
  const shown = sorted.slice(
    0,
    sorted.length > capacity ? capacity - 1 : capacity
  );
  const extra = sorted.length - shown.length;

  return (
    <div
      ref={ref}
      className={`devic-int-hint ${className}`.trim()}
      data-dark={dark}
      data-leaving={leaving}
    >
      <button
        type="button"
        className="devic-int-hint-main"
        onClick={onOpen}
        title={text}
      >
        <span className="devic-int-hint-label">{text}</span>
        <span className="devic-int-hint-logos" aria-hidden="true">
          {shown.map((integration) => (
            <span
              key={integration.app}
              className="devic-int-hint-item"
              data-connected={integration.connected}
            >
              <IntegrationLogo
                integration={integration}
                className="devic-int-hint-logo"
              />
            </span>
          ))}
          {extra > 0 && (
            <span className="devic-int-hint-item devic-int-hint-more">
              +{extra}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        className="devic-int-hint-close"
        onClick={dismiss}
        aria-label="Hide this"
        title="Hide this. Your apps stay in the header."
      >
        ×
      </button>
    </div>
  );
}

export default IntegrationsHint;
