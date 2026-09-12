import type { CSSProperties, ReactNode } from 'react';
import type { DevicTheme } from '../theme';
import type { DevicTranslations } from '../../i18n';
import type { TenantMetadata, SubtenantMetadata } from '../../provider';
import type { UseDevicLiveVoiceResult } from '../../hooks/useDevicLiveVoice';

/** What a finished call leaves behind. */
export interface LiveVoiceCallSummary {
  /** The conversation the call was written to, once the server created it. */
  chatUid?: string;
  /** Seconds the call lasted. */
  seconds: number;
  /** Why the server ended it, when it did — `idle` for silence. */
  endReason?: string;
  /** The spoken turns as the transport reported them. */
  transcript: UseDevicLiveVoiceResult['transcript'];
}

export interface LiveVoiceBubbleProps {
  /** The assistant to call. It must have live voice enabled on the server. */
  assistantId: string;
  /** API key; defaults to the provider's. */
  apiKey?: string;
  /** API base URL; defaults to the provider's. */
  baseUrl?: string;
  tenantId?: string;
  tenantMetadata?: TenantMetadata;
  subtenantId?: string;
  subtenantMetadata?: SubtenantMetadata;
  /** Tags of the conversations the calls create; merged with the provider's. */
  tags?: string[];
  /** Backend tools the assistant may use during the call, as the chat option of the same name. */
  enabledTools?: string[];
  /** Integrations kept out of the call, as the chat option of the same name. */
  disabledIntegrations?: string[];
  /**
   * `floating` pins the bubble to a corner of the viewport; `inline` renders
   * it where it is placed, the call panel opening next to it.
   * @default 'floating'
   */
  placement?: 'floating' | 'inline';
  /** Corner of a floating bubble. @default 'right' */
  side?: 'left' | 'right';
  /** Distance of a floating bubble from the bottom and the side. @default 24 */
  offset?: number | string;
  /** Where the call panel opens relative to the bubble. @default 'above' */
  panelSide?: 'above' | 'below';
  /** Diameter of the bubble in pixels. @default 56 */
  size?: number;
  zIndex?: number;
  /** Accessible name and tooltip of the bubble. @default "Call {name}" */
  label?: string;
  /** Name in the panel header. @default the assistant's name */
  title?: string;
  /** Face in the panel header. @default the assistant's image, or its generated avatar */
  avatarUrl?: string;
  /** What the bubble shows instead of the phone icon. */
  icon?: ReactNode;
  /** Colours and font, the same names the drawer's options use. */
  theme?: DevicTheme;
  /** Translations for the texts the bubble renders itself. */
  translations?: DevicTranslations;
  /** The bubble cannot start a call. */
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  /** The server created the conversation the call is written to. */
  onChatCreated?: (chatUid: string) => void;
  /** A call started connecting. */
  onCallStart?: () => void;
  /** A call ended — by the person, the server or a failure. */
  onCallEnd?: (summary: LiveVoiceCallSummary) => void;
  onError?: (error: Error) => void;
  /**
   * The person asked to continue the finished call in a chat. Defaults to the
   * ChatDrawer registered on the DevicProvider, opened on that conversation;
   * without one the option is not offered.
   */
  onOpenInChat?: (chatUid: string) => void;
  /** The panel was closed after a call. */
  onClose?: (summary: LiveVoiceCallSummary) => void;
}

export interface LiveVoiceBubbleHandle {
  /** Open the panel and start a call. */
  start: () => Promise<void>;
  /** End the running call. */
  stop: () => Promise<void>;
  /** Show the panel. */
  expand: () => void;
  /** Hide the panel; a running call goes on. */
  collapse: () => void;
}
