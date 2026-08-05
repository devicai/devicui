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

/** Relative luminance of a CSS colour, or null when it cannot be read. */
function luminance(color?: string): number | null {
  if (!color) return null;
  const value = color.trim().toLowerCase();

  let r: number, g: number, b: number;
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((d) => d + d)
            .join("")
        : hex[1];
    r = parseInt(digits.slice(0, 2), 16);
    g = parseInt(digits.slice(2, 4), 16);
    b = parseInt(digits.slice(4, 6), 16);
  } else {
    const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
    if (!rgb) return null;
    [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }

  // Perceived brightness, good enough to tell a dark surface from a light one.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Whether this theme paints on a dark surface.
 *
 * Used for the one thing CSS variables cannot express: third-party app logos.
 * Many are solid black with a transparent background, and on a dark chip they
 * turn into a smudge — so on a dark theme the chip behind them goes light.
 * Unknown or unreadable colours count as light, which is the default anyway.
 */
export function isDarkTheme(theme?: DevicTheme): boolean {
  const l = luminance(theme?.backgroundColor) ?? luminance(theme?.secondaryBackgroundColor);
  return l !== null && l < 0.45;
}
