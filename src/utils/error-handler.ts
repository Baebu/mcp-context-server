// Enhanced Error Handler with Panic Safety and Better Reporting
// File: src/utils/error-handler.ts

import { logger } from './logger.js';

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
  timestamp?: string;
  requestId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  category?: 'system' | 'security' | 'validation' | 'resource' | 'external';
  recovery?: {
    retryable: boolean;
    maxRetries?: number;
    backoffMs?: number;
    suggestions?: string[];
  };
}

export interface ErrorContext {
  operation?: string;
  userId?: string;
  requestId?: string;
  toolName?: string;
  resourcePath?: string;
  additionalData?: Record<string, unknown>;
}

export interface SystemHealthMetrics {
  errorCounts: Record<string, number>;
  criticalErrors: number;
  lastCriticalError?: Date;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  uptime: number;
}

// Define Node.js error interface to avoid dependency on @types/node globals
interface NodeError extends Error {
  code?: string;
  path?: string;
  timeout?: number;
  errno?: number;
  syscall?: string;
  address?: string;
  port?: number;
}

interface ValidationError extends Error {
  issues?: Array<{
    path: string[];
    message: string;
    code: string;
  }>;
}

export class MCPErrorHandler {
  private static errorCounts: Map<string, number> = new Map();
  private static criticalErrorCount = 0;
  private static lastCriticalError?: Date;
  private static errorHistory: Array<{ error: MCPError; timestamp: Date }> = [];
  private static readonly MAX_ERROR_HISTORY = 100;

  // Comprehensive error handling with context and recovery information
  static handle(error: unknown, context?: ErrorContext): MCPError {
    const timestamp = new Date().toISOString();
    const requestId = context?.requestId || this.generateRequestId();

    // Log the error with full context
    logger.error(
      {
        error,
        context,
        timestamp,
        requestId,
        stack: error instanceof Error ? error.stack : undefined
      },
      'MCP Error occurred'
    );

    let mcpError: MCPError;

    // Type guard to check if error has MCP error structure
    if (this.isMCPError(error)) {
      mcpError = {
        ...error,
        timestamp,
        requestId
      };
    } else {
      mcpError = this.mapErrorToMCP(error, context, timestamp, requestId);
    }

    // Track error statistics
    this.trackError(mcpError);

    // Add to error history
    this.errorHistory.push({ error: mcpError, timestamp: new Date() });
    if (this.errorHistory.length > this.MAX_ERROR_HISTORY) {
      this.errorHistory.shift();
    }

    // Check for critical errors that might require panic recovery
    if (mcpError.severity === 'critical') {
      this.handleCriticalError(mcpError, context);
    }

    return mcpError;
  }

  private static isMCPError(error: unknown): error is MCPError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      typeof (error as MCPError).code === 'number' &&
      typeof (error as MCPError).message === 'string'
    );
  }

  private static mapErrorToMCP(
    error: unknown,
    context?: ErrorContext,
    timestamp?: string,
    requestId?: string
  ): MCPError {
    // Handle Node.js errors
    if (error instanceof Error) {
      const nodeError = error as NodeError;
      const validationError = error as ValidationError;

      // File system errors
      if (nodeError.code === 'ENOENT') {
        return {
          code: -32001,
          message: 'File or directory not found',
          data: { path: nodeError.path, operation: context?.operation },
          timestamp,
          requestId,
          severity: 'medium',
          category: 'resource',
          recovery: {
            retryable: false,
            suggestions: [
              'Verify the file path exists',
              'Check file permissions',
              'Ensure the directory structure is correct'
            ]
          }
        };
      }

      if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
        return {
          code: -32002,
          message: 'Permission denied',
          data: { path: nodeError.path, operation: context?.operation },
          timestamp,
          requestId,
          severity: 'high',
          category: 'security',
          recovery: {
            retryable: false,
            suggestions: [
              'Check file/directory permissions',
              'Run with appropriate user privileges',
              'Verify safe zones configuration'
            ]
          }
        };
      }

      if (nodeError.code === 'ENOTDIR') {
        return {
          code: -32003,
          message: 'Not a directory',
          data: { path: nodeError.path },
          timestamp,
          requestId,
          severity: 'medium',
          category: 'validation',
          recovery: {
            retryable: false,
            suggestions: ['Verify the path points to a directory, not a file']
          }
        };
      }

      if (nodeError.code === 'EMFILE' || nodeError.code === 'ENFILE') {
        return {
          code: -32004,
          message: 'Too many open files',
          data: { syscall: nodeError.syscall },
          timestamp,
          requestId,
          severity: 'critical',
          category: 'system',
          recovery: {
            retryable: true,
            maxRetries: 3,
            backoffMs: 1000,
            suggestions: [
              'Close unnecessary file handles',
              'Increase system file limits',
              'Check for file handle leaks'
            ]
          }
        };
      }

      if (nodeError.code === 'EADDRINUSE') {
        return {
          code: -32005,
          message: 'Address already in use',
          data: { address: nodeError.address, port: nodeError.port },
          timestamp,
          requestId,
          severity: 'high',
          category: 'system',
          recovery: {
            retryable: true,
            maxRetries: 5,
            backoffMs: 2000,
            suggestions: [
              'Change the port number',
              'Stop other services using this port',
              'Wait for port to be released'
            ]
          }
        };
      }

      // Network errors
      if (nodeError.code === 'ECONNREFUSED' || nodeError.code === 'ENOTFOUND') {
        return {
          code: -32006,
          message: 'Network connection failed',
          data: { address: nodeError.address, code: nodeError.code },
          timestamp,
          requestId,
          severity: 'medium',
          category: 'external',
          recovery: {
            retryable: true,
            maxRetries: 3,
            backoffMs: 5000,
            suggestions: ['Check network connectivity', 'Verify the target address/port', 'Check firewall settings']
          }
        };
      }

      // Timeout errors
      if (error.name === 'TimeoutError' || nodeError.code === 'ETIMEDOUT') {
        return {
          code: -32007,
          message: 'Operation timeout',
          data: { timeout: nodeError.timeout, operation: context?.operation },
          timestamp,
          requestId,
          severity: 'medium',
          category: 'system',
          recovery: {
            retryable: true,
            maxRetries: 2,
            backoffMs: 2000,
            suggestions: ['Increase timeout duration', 'Check system performance', 'Verify operation complexity']
          }
        };
      }

      // Validation errors (Zod, etc.)
      if (error.name === 'ValidationError' || validationError.issues) {
        const issues = validationError.issues || [];
        return {
          code: -32602,
          message: 'Invalid parameters',
          data: {
            issues: issues.map(issue => ({
              path: issue.path.join('.'),
              message: issue.message,
              code: issue.code
            })),
            originalMessage: error.message
          },
          timestamp,
          requestId,
          severity: 'low',
          category: 'validation',
          recovery: {
            retryable: false,
            suggestions: [
              'Check parameter types and formats',
              'Refer to tool schema documentation',
              'Validate input data before submission'
            ]
          }
        };
      }

      // Database errors
      if (error.message.includes('database') || error.message.includes('SQLITE')) {
        return {
          code: -32008,
          message: 'Database operation failed',
          data: { originalError: error.message, operation: context?.operation },
          timestamp,
          requestId,
          severity: 'high',
          category: 'system',
          recovery: {
            retryable: true,
            maxRetries: 2,
            backoffMs: 1000,
            suggestions: [
              'Check database file integrity',
              'Verify sufficient disk space',
              'Run database integrity check',
              'Consider database backup/restore'
            ]
          }
        };
      }

      // Security-related errors
      if (error.message.includes('blocked') || error.message.includes('denied') || error.message.includes('unsafe')) {
        return {
          code: -32009,
          message: 'Security policy violation',
          data: { violation: error.message, context: context?.operation },
          timestamp,
          requestId,
          severity: 'high',
          category: 'security',
          recovery: {
            retryable: false,
            suggestions: [
              'Review security configuration',
              'Check allowed commands and safe zones',
              'Ensure operation complies with security policies'
            ]
          }
        };
      }

      // Memory errors
      if (error.message.includes('out of memory') || error.message.includes('heap')) {
        return {
          code: -32010,
          message: 'Memory allocation failed',
          data: { memoryUsage: process.memoryUsage() },
          timestamp,
          requestId,
          severity: 'critical',
          category: 'system',
          recovery: {
            retryable: true,
            maxRetries: 1,
            backoffMs: 5000,
            suggestions: [
              'Reduce operation scope',
              'Increase available memory',
              'Check for memory leaks',
              'Consider system restart'
            ]
          }
        };
      }

      // JSON parsing errors
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return {
          code: -32700,
          message: 'JSON parsing error',
          data: { originalError: error.message },
          timestamp,
          requestId,
          severity: 'medium',
          category: 'validation',
          recovery: {
            retryable: false,
            suggestions: ['Verify JSON syntax', 'Check for special characters', 'Validate data encoding']
          }
        };
      }

      // Generic error handling
      return {
        code: -32603,
        message: 'Internal error',
        data: {
          originalError: error.message,
          errorName: error.name,
          operation: context?.operation
        },
        timestamp,
        requestId,
        severity: 'medium',
        category: 'system',
        recovery: {
          retryable: true,
          maxRetries: 1,
          backoffMs: 1000,
          suggestions: [
            'Check system logs for more details',
            'Verify system resources',
            'Contact system administrator if issue persists'
          ]
        }
      };
    }

    // Non-Error objects
    return {
      code: -32603,
      message: 'Internal error',
      data: { error: String(error), context: context?.operation },
      timestamp,
      requestId,
      severity: 'medium',
      category: 'system',
      recovery: {
        retryable: false,
        suggestions: ['Check system logs for more details']
      }
    };
  }

  private static trackError(error: MCPError): void {
    // Track by error code
    const codeKey = `code_${error.code}`;
    this.errorCounts.set(codeKey, (this.errorCounts.get(codeKey) || 0) + 1);

    // Track by category
    if (error.category) {
      const categoryKey = `category_${error.category}`;
      this.errorCounts.set(categoryKey, (this.errorCounts.get(categoryKey) || 0) + 1);
    }

    // Track by severity
    if (error.severity) {
      const severityKey = `severity_${error.severity}`;
      this.errorCounts.set(severityKey, (this.errorCounts.get(severityKey) || 0) + 1);
    }

    // Track critical errors
    if (error.severity === 'critical') {
      this.criticalErrorCount++;
      this.lastCriticalError = new Date();
    }
  }

  private static handleCriticalError(error: MCPError, context?: ErrorContext): void {
    logger.fatal(
      {
        error,
        context,
        systemHealth: this.getSystemHealth(),
        timestamp: new Date().toISOString()
      },
      'CRITICAL ERROR: System stability may be compromised'
    );

    // Implement panic recovery strategies
    if (error.code === -32010) {
      // Memory error
      this.performMemoryCleanup();
    }

    if (error.code === -32004) {
      // Too many files
      this.performFileHandleCleanup();
    }

    // Consider graceful degradation
    this.enableGracefulDegradation(error);
  }

  private static performMemoryCleanup(): void {
    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.info('Forced garbage collection completed');
      }

      // Log memory usage after cleanup
      const memoryUsage = process.memoryUsage();
      logger.info({ memoryUsage }, 'Memory usage after cleanup');
    } catch (error) {
      logger.warn({ error }, 'Memory cleanup failed');
    }
  }

  private static performFileHandleCleanup(): void {
    // This is a placeholder - in a real implementation, you'd track and close unused file handles
    logger.warn('File handle cleanup requested - manual intervention may be required');
  }

  private static enableGracefulDegradation(error: MCPError): void {
    // Implement strategies to keep the system running even with critical errors
    logger.warn({ error }, 'Enabling graceful degradation mode');

    // Example strategies:
    // - Reduce concurrent operations
    // - Disable non-essential features
    // - Increase error tolerance
    // - Switch to safe-mode operations
  }

  // Utility methods for error handling
  static isRetryable(error: MCPError): boolean {
    return error.recovery?.retryable ?? false;
  }

  static getRetryDelay(error: MCPError, attemptNumber: number): number {
    const baseDelay = error.recovery?.backoffMs ?? 1000;
    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attemptNumber - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }

  static getMaxRetries(error: MCPError): number {
    return error.recovery?.maxRetries ?? 0;
  }

  // System health monitoring
  static getSystemHealth(): SystemHealthMetrics {
    return {
      errorCounts: Object.fromEntries(this.errorCounts),
      criticalErrors: this.criticalErrorCount,
      lastCriticalError: this.lastCriticalError,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  static getErrorHistory(limit?: number): Array<{ error: MCPError; timestamp: Date }> {
    return limit ? this.errorHistory.slice(-limit) : [...this.errorHistory];
  }

  static clearErrorHistory(): void {
    this.errorHistory.length = 0;
    logger.info('Error history cleared');
  }

  static resetErrorCounts(): void {
    this.errorCounts.clear();
    this.criticalErrorCount = 0;
    this.lastCriticalError = undefined;
    logger.info('Error statistics reset');
  }

  // Helper methods
  private static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Panic recovery for unhandled errors
  static setupPanicRecovery(): void {
    process.on('uncaughtException', error => {
      const mcpError = this.handle(error, { operation: 'uncaught_exception' });

      logger.fatal(
        {
          error: mcpError,
          stack: error.stack,
          systemHealth: this.getSystemHealth()
        },
        'PANIC: Uncaught exception - system may be unstable'
      );

      // Give some time for logging to complete
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    process.on('unhandledRejection', (reason, promise) => {
      const mcpError = this.handle(reason, { operation: 'unhandled_rejection' });

      logger.fatal(
        {
          error: mcpError,
          promise: String(promise),
          systemHealth: this.getSystemHealth()
        },
        'PANIC: Unhandled promise rejection - system may be unstable'
      );

      // Give some time for logging to complete
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    logger.info('Panic recovery handlers installed');
  }
}
