/* eslint-disable no-console */
// MCP-compliant logger that ONLY uses stderr to avoid contaminating stdout

const logLevel = process.env.MCP_LOG_LEVEL || 'info';

const levels = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5
} as const;

type LogLevel = keyof typeof levels;

const currentLevel = levels[logLevel as LogLevel] ?? levels.info;

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= currentLevel;
}

function formatMessage(level: string, obj: unknown, msg?: string, childContext?: string): string {
  const timestamp = new Date().toISOString();
  const message = msg || (typeof obj === 'string' ? obj : '');
  const data = typeof obj === 'object' && obj !== null ? JSON.stringify(obj, null, 2) : '';
  const context = childContext ? `[${childContext}] ` : '';

  return `[${timestamp}] [${level.toUpperCase()}] ${context}${message}${data ? `\n${data}` : ''}`;
}

interface Logger {
  trace: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  fatal: (obj: unknown, msg?: string) => void;
  child: (obj: unknown) => Logger;
  level: string;
}

function createLogger(context?: string): Logger {
  return {
    trace: (obj: unknown, msg?: string) => {
      if (shouldLog('trace')) {
        // CRITICAL: Use console.error to write to stderr, NOT stdout
        console.error(formatMessage('trace', obj, msg, context));
      }
    },
    debug: (obj: unknown, msg?: string) => {
      if (shouldLog('debug')) {
        console.error(formatMessage('debug', obj, msg, context));
      }
    },
    info: (obj: unknown, msg?: string) => {
      if (shouldLog('info')) {
        console.error(formatMessage('info', obj, msg, context));
      }
    },
    warn: (obj: unknown, msg?: string) => {
      if (shouldLog('warn')) {
        console.error(formatMessage('warn', obj, msg, context));
      }
    },
    error: (obj: unknown, msg?: string) => {
      if (shouldLog('error')) {
        console.error(formatMessage('error', obj, msg, context));
      }
    },
    fatal: (obj: unknown, msg?: string) => {
      if (shouldLog('fatal')) {
        console.error(formatMessage('fatal', obj, msg, context));
      }
    },
    child: (obj: unknown) => {
      const childContext =
        typeof obj === 'object' && obj !== null && 'component' in obj
          ? String((obj as { component: unknown }).component)
          : String(obj);
      return createLogger(childContext);
    },
    level: logLevel
  };
}

export const logger = createLogger();
