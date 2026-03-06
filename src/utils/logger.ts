/**
 * Conditional logger for devic-ui.
 * Only outputs when debug mode is enabled via the Provider or component props.
 */
export function createLogger(enabled: boolean) {
  const noop = () => {};
  return {
    log: enabled ? console.log.bind(console) : noop,
    warn: enabled ? console.warn.bind(console) : noop,
    error: enabled ? console.error.bind(console) : noop,
  };
}

export type DevicLogger = ReturnType<typeof createLogger>;
