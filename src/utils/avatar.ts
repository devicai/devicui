import { blobatarUri } from 'blobatar/uri';
import type { BlobatarOptions } from 'blobatar';

/**
 * The generated avatar an agent or an assistant falls back to when it has no
 * uploaded image.
 *
 * Derived from the entity's id, and the platform derives it the same way from
 * the same value — so an assistant embedded here wears the face its owner sees
 * in the console. `AvatarStyle` is only what has been pinned on top of that:
 * an absent field keeps following the id.
 */
export type AvatarShape =
  | 'round'
  | 'organic'
  | 'boxy'
  | 'nub'
  | 'cloud'
  | 'sun';

export type AvatarTone =
  | 'pastel'
  | 'neutral'
  | 'mid'
  | 'deep'
  | 'bright'
  | 'ink';

export interface AvatarStyle {
  shape?: AvatarShape;
  /** Hue in degrees, 0-359. */
  hue?: number;
  tone?: AvatarTone;
}

/**
 * Where each name sits in the renderer's 0-1 trait space — the middle of each
 * band, so a pinned value lands nowhere near a threshold. Kept identical to the
 * platform's mapping: the same style must resolve to the same avatar in both.
 */
const SHAPE_POSITION: Record<AvatarShape, number> = {
  round: 0.14,
  organic: 0.43,
  boxy: 0.65,
  nub: 0.78,
  cloud: 0.885,
  sun: 0.965,
};

const TONE_POSITION: Record<AvatarTone, number> = {
  pastel: 0.1,
  neutral: 0.28,
  mid: 0.49,
  deep: 0.71,
  bright: 0.865,
  ink: 0.965,
};

function blobatarOptions(style?: AvatarStyle): BlobatarOptions {
  const opts: BlobatarOptions = {};
  if (style?.shape) opts.traits = { shape: SHAPE_POSITION[style.shape] };
  if (typeof style?.hue === 'number') opts.hue = style.hue;
  if (style?.tone) opts.tone = TONE_POSITION[style.tone];
  return opts;
}

/**
 * Memoised: a drawer header and every hand-off card in the transcript can be
 * asking for the same few avatars, and each one is a few hundred bytes of path
 * data to solve. Bounded, since a long conversation can hand off to many
 * subagents.
 */
const cache = new Map<string, string>();
const CACHE_LIMIT = 100;

export function avatarUri(seed: string, style?: AvatarStyle): string {
  const key = `${seed}|${style?.shape ?? ''}|${style?.hue ?? ''}|${style?.tone ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const uri = blobatarUri(seed, blobatarOptions(style));
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, uri);
  return uri;
}
