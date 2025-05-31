export interface ISecurityValidator {
  validatePath(path: string): Promise<string>;
  validateCommand(command: string, args: string[]): Promise<void>;
  isPathInSafeZone(path: string): boolean;
  sanitizeInput(input: string): string;
}
