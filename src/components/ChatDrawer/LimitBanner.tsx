import React from 'react';
import type { TenantLimitExceeded } from '../../api/types';
import { useTranslations } from '../../i18n';
import type { Translator } from '../../i18n';

export interface LimitBannerProps {
  limit: TenantLimitExceeded;
}

function resetText(t: Translator, resetsAt?: number): string | null {
  if (!resetsAt) return null;
  const ms = resetsAt - Date.now();
  if (ms <= 0) return t('You can try again now.');
  const mins = Math.round(ms / 60000);
  if (mins < 60) {
    return mins === 1
      ? t('Resets in 1 minute.')
      : t('Resets in {count} minutes.', { count: mins });
  }
  const hours = Math.round(mins / 60);
  if (hours < 48) {
    return hours === 1
      ? t('Resets in 1 hour.')
      : t('Resets in {count} hours.', { count: hours });
  }
  const days = Math.round(hours / 24);
  return days === 1
    ? t('Resets in 1 day.')
    : t('Resets in {count} days.', { count: days });
}

/**
 * Default banner shown above the chat input when a message is blocked by a
 * tenant/subtenant usage limit. Antd-free — styled via `.devic-limit-banner*`.
 * Suppress it with `options.hideLimitBanner` or replace it with
 * `options.limitBannerRenderer`.
 */
export function LimitBanner({ limit }: LimitBannerProps): JSX.Element {
  const t = useTranslations();
  const message = limit.message || t('Usage limit reached.');
  const reset = resetText(t, limit.resetsAt);
  return (
    <div className="devic-limit-banner" role="alert">
      <span className="devic-limit-banner-icon" aria-hidden="true">
        <WarningIcon />
      </span>
      <div className="devic-limit-banner-text">
        <span className="devic-limit-banner-title">{message}</span>
        {reset && <span className="devic-limit-banner-reset">{reset}</span>}
      </div>
    </div>
  );
}

function WarningIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
