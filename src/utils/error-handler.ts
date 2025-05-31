import { logger } from './logger.js';

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

// Define Node.js error interface to avoid dependency on @types/node globals
interface NodeError extends Error {
  code?: string;
  path?: string;
  timeout?: number;
}

export class MCPErrorHandler {
  static handle(error: unknown): MCPError {
    logger.error({ error }, 'MCP Error occurred');

    // Type guard to check if error has MCP error structure
    if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
      return error as MCPError;
    }

    // Handle Node.js errors
    if (error instanceof Error) {
      const nodeError = error as NodeError;

      // Map common Node.js errors to MCP error codes
      if (nodeError.code === 'ENOENT') {
        return {
          code: -32001,
          message: 'File or directory not found',
          data: { path: nodeError.path }
        };
      }

      if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
        return {
          code: -32002,
          message: 'Permission denied',
          data: { path: nodeError.path }
        };
      }

      if (nodeError.code === 'ENOTDIR') {
        return {
          code: -32003,
          message: 'Not a directory',
          data: { path: nodeError.path }
        };
      }

      if (error.name === 'ValidationError') {
        return {
          code: -32602,
          message: 'Invalid params',
          data: error.message
        };
      }

      if (error.name === 'TimeoutError') {
        return {
          code: -32004,
          message: 'Operation timeout',
          data: { timeout: nodeError.timeout }
        };
      }
    }

    // Generic internal error
    return {
      code: -32603,
      message: 'Internal error',
      data: error instanceof Error ? error.message : String(error)
    };
  }

  static isRetryable(error: MCPError): boolean {
    const retryableCodes = [-32004]; // Timeout errors
    return retryableCodes.includes(error.code);
  }
}
