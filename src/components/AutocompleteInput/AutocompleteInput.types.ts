import type { CSSProperties, FocusEvent, KeyboardEvent } from 'react';

export interface AutocompleteInputOptions {
  color?: string;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  fontFamily?: string;
  fontSize?: string | number;
  borderRadius?: number | string;
  padding?: string | number;
  placeholderColor?: string;
  suggestionColor?: string;
  style?: CSSProperties;
}

export interface AutocompleteInputProps {
  assistantId: string;
  instanceId?: string;
  value: string;
  onChange: (value: string) => void;

  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  name?: string;
  className?: string;

  enableAutocomplete?: boolean;
  debounceMs?: number;
  minLength?: number;
  triggerCharPattern?: RegExp;

  templateParameters?: Record<string, any>;
  tenantId?: string;
  tenantMetadata?: Record<string, any>;
  apiKey?: string;
  baseUrl?: string;

  options?: AutocompleteInputOptions;

  onSuggestionReceived?: (suggestion: string) => void;
  onSuggestionAccepted?: (suggestion: string) => void;
  onSuggestionDismissed?: () => void;
  onAutocompleteError?: (error: Error) => void;
  onFocus?: (e: FocusEvent) => void;
  onBlur?: (e: FocusEvent) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
}

export interface AutocompleteInputHandle {
  triggerAutocomplete: (value?: string) => Promise<void>;
  acceptSuggestion: () => void;
  dismissSuggestion: () => void;
  focus: () => void;
}
