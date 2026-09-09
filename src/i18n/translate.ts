import type { DevicTranslations, Translator } from './types';

/**
 * Replace `{name}` placeholders. A placeholder with no matching value is
 * dropped rather than left in the text — half-substituted braces on screen
 * read as a bug to the end user.
 */
export function fillTemplate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? '' : String(value);
  });
}

/**
 * Look one English text up in the dictionary, then fill its placeholders.
 * An absent entry falls back to the English text itself, so a partial
 * dictionary is perfectly usable.
 */
export function translate(
  dictionary: DevicTranslations | undefined,
  text: string,
  vars?: Record<string, string | number>
): string {
  return fillTemplate(dictionary?.[text] ?? text, vars);
}

/**
 * Build a translator bound to one dictionary. Stable for as long as the
 * dictionary is, so it is safe in a dependency list.
 */
export function createTranslator(dictionary?: DevicTranslations): Translator {
  return (text, vars) => translate(dictionary, text, vars);
}

/**
 * Merge dictionaries, later ones winning. `undefined` layers are skipped so
 * callers can pass optional ones straight in.
 */
export function mergeTranslations(
  ...layers: (DevicTranslations | undefined)[]
): DevicTranslations | undefined {
  const present = layers.filter(Boolean) as DevicTranslations[];
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return Object.assign({}, ...present) as DevicTranslations;
}
