import type { CSSProperties } from "react";

/**
 * Colours and font a component should paint itself with.
 *
 * The same names the drawer's options use, so passing them through is a
 * one-liner and an integrator who already themed the drawer has nothing new to
 * learn.
 */
export interface DevicTheme {
  /** Accent: primary buttons, focus rings, links. */
  color?: string;
  fontFamily?: string;
  /** Surface the component sits on. */
  backgroundColor?: string;
  textColor?: string;
  /** Secondary surface: rows, chips, hover states. */
  secondaryBackgroundColor?: string;
  borderColor?: string;
  /** Muted text: captions, timestamps, empty states. */
  mutedTextColor?: string;
}

/**
 * A theme as inline CSS variables.
 *
 * Needed because the modals render through a portal into `document.body`: the
 * drawer sets these variables on its own element, and a portal is not inside
 * it, so nothing cascades down. A white dialog then opens over a dark
 * application, which is what this exists to prevent.
 *
 * Only the values actually given are emitted — an absent one must fall through
 * to the stylesheet default rather than be pinned to `undefined`.
 */
export function themeVars(theme?: DevicTheme): CSSProperties {
  if (!theme) return {};
  const vars: Record<string, string> = {};
  const set = (name: string, value?: string) => {
    if (value) vars[name] = value;
  };

  set("--devic-primary", theme.color);
  set("--devic-font-family", theme.fontFamily);
  set("--devic-bg", theme.backgroundColor);
  set("--devic-text", theme.textColor);
  set("--devic-bg-secondary", theme.secondaryBackgroundColor);
  set("--devic-border", theme.borderColor);
  set("--devic-text-muted", theme.mutedTextColor);

  return vars as CSSProperties;
}
