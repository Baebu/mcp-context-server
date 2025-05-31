import { injectable, inject } from 'inversify';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ISecurityValidator } from '../../core/interfaces/security.interface.js';
import { logger } from '../../utils/logger.js';
import type { ServerConfig } from '../../infrastructure/config/types.js';

@injectable()
export class SecurityValidator implements ISecurityValidator {
  private allowedCommands: Set<string>;
  private safeZones: string[];

  constructor(@inject('Config') private config: ServerConfig) {
    this.allowedCommands = new Set(
      Array.isArray(this.config.security.allowedCommands) ? this.config.security.allowedCommands : []
    );
    this.safeZones = this.config.security.safezones.map((zone: string) => path.resolve(zone));
  }

  async validatePath(inputPath: string): Promise<string> {
    const resolvedPath = path.resolve(inputPath);
    const canonicalPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);

    if (!this.isPathInSafeZone(canonicalPath)) {
      throw new Error(`Path access denied: ${inputPath}`);
    }

    return canonicalPath;
  }

  async validateCommand(command: string, args: string[]): Promise<void> {
    if (this.allowedCommands.has('all')) {
      return; // All commands allowed
    }

    if (!this.allowedCommands.has(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }

    // Additional validation for potentially dangerous arguments
    const dangerousPatterns = [/rm\s+-rf/i, /del\s+\/s/i, /format\s+c:/i, /sudo/i, /passwd/i];

    const fullCommand = `${command} ${args.join(' ')}`;
    for (const pattern of dangerousPatterns) {
      if (pattern.test(fullCommand)) {
        throw new Error(`Potentially dangerous command blocked: ${command}`);
      }
    }

    logger.debug({ command, args }, 'Command validated');
  }

  isPathInSafeZone(testPath: string): boolean {
    const resolvedPath = path.resolve(testPath);
    return this.safeZones.some(zone => resolvedPath.startsWith(zone));
  }

  sanitizeInput(input: string): string {
    return input
      .replace(/[<>:"'|?*]/g, '') // Remove potentially dangerous characters
      .replace(/\.\./g, '') // Remove directory traversal attempts
      .trim();
  }
}
