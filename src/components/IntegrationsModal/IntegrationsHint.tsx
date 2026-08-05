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

/** Whether an element is on screen right now. */
function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  return (
    r.bottom > 0 &&
    r.right > 0 &&
    r.top < window.innerHeight &&
    r.left < window.innerWidth
  );
}

/**
 * The header control this bar belongs to.
 *
 * Scoped to its own drawer first — a page can hold several, each with its own
 * header — and only then to the nearest visible one anywhere. The class name is
 * checked against both the drawer's own container and the legacy one, because
 * getting this wrong is silent: `closest` returns null, the search widens to the
 * whole document, and the copy flies to whichever control happens to be first
 * in the DOM.
 */
function flyTarget(bar: Element, selector: string): HTMLElement | null {
  if (!selector) return null;

  const drawer = bar.closest(".devic-chat-drawer, .devic-drawer");
  const own = drawer?.querySelector(selector) as HTMLElement | null;
  if (own && isVisible(own)) return own;

  const barRect = bar.getBoundingClientRect();
  const candidates = [...document.querySelectorAll(selector)].filter(isVisible);
  if (!candidates.length) return null;

  // Nearest to the bar, so a page with several drawers still animates towards
  // the one the user is looking at.
  return candidates.reduce((best, el) => {
    const d = (e: Element) => {
      const r = e.getBoundingClientRect();
      return Math.hypot(r.left - barRect.left, r.top - barRect.top);
    };
    return d(el) < d(best) ? el : best;
  }) as HTMLElement;
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

    const target = flyTarget(bar, flyToSelector);
    // Nothing to fly to, or nothing the user can see: the bar just closes.
    // A copy sailing off towards something 2000px down the page says the
    // opposite of what this animation is for.
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

    // An arc, not a straight line. The bow is perpendicular to the path, which
    // is what actually reads as a curve: this trip is nearly vertical, and
    // pulling only on Y just makes it accelerate. It opens away from the
    // target's side so the copy swings out and comes back in, and both terms
    // scale with the distance — a short hop should not loop — and are capped so
    // a long page does not throw it off screen.
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(48, Math.max(16, len * 0.18));
    const side = dx <= 0 ? 1 : -1;
    const bowX = ((-dy / len) * bow) * side;
    const bowY = ((dx / len) * bow) * side;
    const lift = Math.min(70, Math.max(18, len * 0.18));

    // The curve the copy travels, as a quadratic Bézier through that midpoint.
    // The control point is derived so the curve actually passes through it —
    // a Bézier does not go through its control.
    const midX = dx * 0.45 + bowX;
    const midY = dy * 0.5 - lift + bowY;
    const ctrlX = 2 * midX - dx / 2;
    const ctrlY = 2 * midY - dy / 2;

    // Sampled into many linear steps rather than three keyframes with an easing
    // each. Per-keyframe easings ease OUT into the midpoint and IN out of it,
    // which is a stop halfway — the shape was right and the motion was two
    // hops. Here the keyframes carry only the shape, and one global easing
    // carries the pace: speed builds to a peak at the centre and settles into
    // the target.
    const STEPS = 24;
    // Above the 1.2 of a plain keyframe: this rides on top of the shrink
    // towards the target's size, so the two partly cancel at the apex.
    const PEAK = 1.35;
    const frames = Array.from({ length: STEPS + 1 }, (_, i) => {
      const t = i / STEPS;
      const u = 1 - t;
      return {
        offset: t,
        transform:
          `translate(${2 * u * t * ctrlX + t * t * dx}px, ` +
          `${2 * u * t * ctrlY + t * t * dy}px) ` +
          // Swells on the way and shrinks into the header, so the eye follows
          // the thing rather than the fade.
          `scale(${1 + (scale - 1) * t + (PEAK - 1) * Math.sin(Math.PI * t)})`,
        opacity: t <= 0.5 ? 1 : 1 - Math.pow((t - 0.5) * 2, 1.6),
        easing: "linear",
      };
    });

    const animation = ghost.animate?.(frames, {
      duration: 780,
      easing: "cubic-bezier(0.5, 0, 0.5, 1)",
      fill: "forwards",
    });

    const remove = () => ghost.remove();
    if (animation) animation.onfinish = remove;
    else remove();
    // Belt and braces: a tab backgrounded mid-flight never fires onfinish.
    window.setTimeout(remove, 2000);
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
