import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
} from 'react';
import { useAutocomplete } from './useAutocomplete';
import { useOptionalDevicContext } from '../../provider';
import type {
  AutocompleteInputProps,
  AutocompleteInputHandle,
} from './AutocompleteInput.types';
import './AutocompleteInput.css';

export const AutocompleteInput = forwardRef<
  AutocompleteInputHandle,
  AutocompleteInputProps
>(function AutocompleteInput(props, ref) {
  const {
    assistantId,
    instanceId,
    value,
    onChange,
    multiline = false,
    rows = 3,
    placeholder,
    disabled,
    readOnly,
    name,
    className,
    enableAutocomplete = true,
    debounceMs,
    minLength,
    triggerCharPattern,
    templateParameters,
    tenantId,
    tenantMetadata,
    apiKey: apiKeyProp,
    baseUrl: baseUrlProp,
    options = {},
    onSuggestionReceived,
    onSuggestionAccepted,
    onSuggestionDismissed,
    onAutocompleteError,
    onFocus,
    onBlur,
    onKeyDown,
  } = props;

  const context = useOptionalDevicContext();
  const apiKey = apiKeyProp ?? context?.apiKey ?? '';
  const baseUrl = baseUrlProp ?? context?.baseUrl ?? '';

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const ghostRef = useRef<HTMLPreElement>(null);

  const {
    suggestion,
    isLoading,
    isGloballyDisabled,
    isInstanceDisabled,
    triggerAutocomplete,
    acceptSuggestion,
    dismissSuggestion,
    cancelRequest,
    setInstanceDisabled,
  } = useAutocomplete({
    assistantId,
    instanceId,
    value,
    enabled: enableAutocomplete,
    debounceMs,
    minLength,
    triggerCharPattern,
    templateParameters,
    tenantId,
    tenantMetadata,
    apiKey,
    baseUrl,
    onSuggestionReceived,
    onError: onAutocompleteError,
  });

  const isDisabled = isGloballyDisabled || isInstanceDisabled;

  useImperativeHandle(ref, () => ({
    triggerAutocomplete,
    acceptSuggestion: () => {
      const text = acceptSuggestion();
      if (text) {
        onChange(value + text);
        onSuggestionAccepted?.(text);
      }
    },
    dismissSuggestion,
    focus: () => inputRef.current?.focus(),
  }));

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (suggestion && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const text = acceptSuggestion();
        if (text) {
          onChange(value + text);
          onSuggestionAccepted?.(text);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (e.shiftKey && instanceId) {
          e.preventDefault();
          setInstanceDisabled(true);
          dismissSuggestion();
          return;
        }
        if (suggestion || isLoading) {
          e.preventDefault();
          dismissSuggestion();
          cancelRequest();
          onSuggestionDismissed?.();
          return;
        }
      }

      onKeyDown?.(e);
    },
    [
      suggestion,
      isLoading,
      instanceId,
      value,
      onChange,
      acceptSuggestion,
      dismissSuggestion,
      cancelRequest,
      setInstanceDisabled,
      onSuggestionAccepted,
      onSuggestionDismissed,
      onKeyDown,
    ]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Sync scroll between input/textarea and ghost overlay
  const syncScroll = useCallback(() => {
    if (inputRef.current && ghostRef.current) {
      ghostRef.current.scrollTop = inputRef.current.scrollTop;
      ghostRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }, []);

  // Resolve CSS variable values for inline styles
  const bgColor = options.backgroundColor || '#fff';
  const textColor = options.textColor || '#333';
  const borderColor = options.borderColor || '#d9d9d9';
  const accentColor = options.color || '#1890ff';
  const suggestionColor = options.suggestionColor || 'rgba(100, 100, 100, 0.5)';
  const fontFamily = options.fontFamily || 'inherit';
  const fontSize = typeof options.fontSize === 'number' ? `${options.fontSize}px` : (options.fontSize || '14px');
  const borderRadius = typeof options.borderRadius === 'number' ? `${options.borderRadius}px` : (options.borderRadius || '6px');
  const padding = typeof options.padding === 'number' ? `${options.padding}px` : (options.padding || '8px 12px');

  // Common text styles shared between input and ghost overlay (must match exactly)
  const textStyles: React.CSSProperties = {
    fontFamily,
    fontSize,
    lineHeight: '1.5',
    padding,
    margin: 0,
    border: 'none',
    outline: 'none',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    boxSizing: 'border-box',
  };

  const showGhost = !!suggestion && !isDisabled;

  return (
    <div
      className={`devic-ac-wrapper${className ? ` ${className}` : ''}`}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: '100%',
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius,
        overflow: 'hidden',
        ...options.style,
      }}
    >
      {/* Ghost text overlay — sits behind the textarea */}
      <pre
        ref={ghostRef}
        aria-hidden="true"
        style={{
          ...textStyles,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          color: 'transparent',
          backgroundColor: 'transparent',
          overflow: 'auto',
          zIndex: 1,
        }}
      >
        <span>{value}</span>
        {showGhost && <span style={{ color: suggestionColor }}>{suggestion}</span>}
      </pre>

      {/* Actual input — transparent background so ghost shows through */}
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          name={name}
          value={value}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          onScroll={syncScroll}
          autoComplete="off"
          spellCheck={false}
          style={{
            ...textStyles,
            position: 'relative',
            width: '100%',
            height: '100%',
            resize: 'vertical',
            color: textColor,
            backgroundColor: 'transparent',
            caretColor: textColor,
            zIndex: 2,
          }}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          name={name}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          onScroll={syncScroll}
          autoComplete="off"
          spellCheck={false}
          style={{
            ...textStyles,
            position: 'relative',
            width: '100%',
            color: textColor,
            backgroundColor: 'transparent',
            caretColor: textColor,
            zIndex: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        />
      )}

      {/* Tab hint badge */}
      {showGhost && (
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            padding: '3px 8px',
            backgroundColor: 'rgba(0,0,0,0.75)',
            borderRadius: '4px',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>Tab</span>
          <span style={{ color: '#aaa', fontSize: 10 }}>to accept</span>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            right: 10,
            transform: 'translateY(-50%)',
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: accentColor,
            opacity: 0.6,
            zIndex: 10,
            animation: 'devic-ac-pulse 1s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
});
