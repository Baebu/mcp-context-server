// Option 1: CommonJS Style Import
const pino = require('pino');

const logLevel = process.env.MCP_LOG_LEVEL || 'info';
const isPretty = process.env.NODE_ENV === 'development' || process.env.MCP_LOG_PRETTY === 'true';

const loggerOptions = {
  level: logLevel,
  serializers: {
    error: pino.stdSerializers.err
  },
  base: {
    service: 'mcp-context-server'
  },
  ...(isPretty && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'UTC:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  })
};

export const logger = pino(loggerOptions);
