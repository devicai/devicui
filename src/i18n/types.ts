/**
 * Dictionary of translations for the texts this library renders itself.
 *
 * The key is the exact English text the widget shows; the value is what to
 * show instead. Nothing else is needed — no key catalogue to learn, and no
 * i18n runtime bundled here: you keep whatever you already use (i18next,
 * react-intl, a plain object per locale) and hand over the resulting strings.
 *
 * ```ts
 * const translations = {
 *   'New chat': 'Nueva conversación',
 *   'Type a message...': 'Escribe un mensaje...',
 *   '{count} left': 'Quedan {count}',
 * };
 * ```
 *
 * A text that carries a `{name}` placeholder keeps it in the translation:
 * placeholders are filled after the lookup, so they can be reordered or
 * dropped freely. A text with no entry is shown in English.
 */
export type DevicTranslations = Record<string, string>;

/**
 * Resolves one English text to what should be rendered.
 *
 * `vars` fills the `{name}` placeholders of the result.
 */
export type Translator = (
  text: string,
  vars?: Record<string, string | number>
) => string;
