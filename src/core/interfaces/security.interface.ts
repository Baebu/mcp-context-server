export interface ISecurityValidator {
  validatePath(path: string): Promise<string>;
  validateCommand(command: string, args: string[]): Promise<void>;
  isPathInSafeZone(path: string): boolean;
  sanitizeInput(input: string): string;

  // Added for enhanced diagnostics
  getSecurityInfo?(): {
    safeZones: string[];
    restrictedZones: string[];
    safeZoneMode: string;
    blockedPatterns: number;
  };
  testPathAccess?(path: string): Promise<{
    allowed: boolean;
    reason: string;
    resolvedPath: string;
    inputPath?: string;
    matchedSafeZone?: string;
    matchedRestrictedZone?: string;
  }>;
  // Added reinitializeZones method to the interface
  reinitializeZones?(): void;
}
