type LogLevel = 'info' | 'warn' | 'error';

interface LogMeta {
  [key: string]: unknown;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return { message: 'Unknown error', value: String(error) };
}

function writeLog(level: LogLevel, event: string, meta?: LogMeta) {
  const payload: Record<string, unknown> = {
    level,
    event,
    timestamp: new Date().toISOString(),
  };

  if (meta && Object.keys(meta).length > 0) {
    payload.meta = meta;
  }

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(event: string, meta?: LogMeta) {
  writeLog('info', event, meta);
}

export function logWarn(event: string, meta?: LogMeta) {
  writeLog('warn', event, meta);
}

export function logError(event: string, error: unknown, meta?: LogMeta) {
  writeLog('error', event, { ...meta, error: serializeError(error) });
}
