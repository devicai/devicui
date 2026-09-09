import React, { createContext, useContext, useMemo } from 'react';
import { useOptionalDevicContext } from '../provider/DevicContext';
import { createTranslator, mergeTranslations } from './translate';
import type { DevicTranslations, Translator } from './types';

/**
 * Dictionary contributed by an enclosing component, on top of the provider's.
 *
 * It exists so `<ChatDrawer options={{ translations }}>` reaches the input,
 * the message list and the dialogs it opens without every one of them taking
 * a prop for it. Nesting merges rather than replaces.
 */
const TranslationsScope = createContext<DevicTranslations | undefined>(undefined);

export interface DevicTranslationsProviderProps {
  /** Entries added on top of the enclosing dictionaries. */
  translations?: DevicTranslations;
  children: React.ReactNode;
}

/**
 * Scopes a dictionary to a subtree. Rarely needed directly — the components
 * that take a `translations` option already wrap their own subtree with it —
 * but useful to translate one region of a page differently.
 */
export function DevicTranslationsProvider({
  translations,
  children,
}: DevicTranslationsProviderProps): JSX.Element {
  const outer = useContext(TranslationsScope);
  const value = useMemo(
    () => mergeTranslations(outer, translations),
    [outer, translations]
  );
  return (
    <TranslationsScope.Provider value={value}>
      {children}
    </TranslationsScope.Provider>
  );
}

/**
 * The dictionary in force here: the provider's, plus any scoped by an
 * enclosing component, plus the `local` argument. Later layers win.
 */
export function useTranslationsDictionary(
  local?: DevicTranslations
): DevicTranslations | undefined {
  const context = useOptionalDevicContext();
  const scoped = useContext(TranslationsScope);
  const global = context?.translations;
  return useMemo(
    () => mergeTranslations(global, scoped, local),
    [global, scoped, local]
  );
}

/**
 * Returns `t`, the translator for every text this library renders itself.
 *
 * Works with or without a `DevicProvider`: with no dictionary anywhere it
 * returns the English text unchanged, which is what a component mounted
 * standalone gets.
 *
 * @example
 * ```tsx
 * const t = useTranslations();
 * <button aria-label={t('New chat')}>…</button>
 * ```
 */
export function useTranslations(local?: DevicTranslations): Translator {
  const dictionary = useTranslationsDictionary(local);
  return useMemo(() => createTranslator(dictionary), [dictionary]);
}
