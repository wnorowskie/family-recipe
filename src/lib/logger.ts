type LogLevel = 'info' | 'warn' | 'error';

interface LogMeta {
  [key: string]: unknown;
}

const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_META_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'jwt',
  'jwtsecret',
  'authorization',
  'cookie',
  'set-cookie',
  'familymasterkey',
  'family_master_key',
  'database_url',
  'databaseurl',
]);

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (SENSITIVE_META_KEYS.has(normalized)) return true;
  if (normalized.includes('password')) return true;
  if (normalized.includes('secret')) return true;
  if (normalized.endsWith('token')) return true;
  return false;
}

function redactMeta(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null) return value;
  if (typeof value !== 'object') return value;

  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactMeta(item, seen));
  }

  const record = value as Record<string, unknown>;
  const redacted: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(record)) {
    redacted[key] = isSensitiveKey(key)
      ? REDACTED_VALUE
      : redactMeta(val, seen);
  }

  return redacted;
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
    payload.meta = redactMeta(meta);
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
