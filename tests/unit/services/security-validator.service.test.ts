import { SecurityValidator } from '@application/services/security-validator.service';
import type { ServerConfig } from '@infrastructure/config/types';
import { logger } from '@utils/logger'; // Mocked
import path from 'node:path';

// Mock fs.promises for realpath behavior
const mockFsPromises = global.mockFsAdapter;

jest.mock('@utils/logger'); // Ensure logger is fully mocked here if not by setup

describe('SecurityValidator', () => {
  let securityValidator: SecurityValidator;
  let mockConfig: ServerConfig;

  const CWD = path.resolve(process.cwd()); // Use resolved CWD

  beforeEach(() => {
    mockFsPromises.__clearFs(); // Clear mock file system
    // Setup mock realpath to return the path itself by default
    mockFsPromises.realpath.mockImplementation(async (p: string) => path.resolve(p));

    mockConfig = {
      server: { name: 'test-server', version: '1.0.0' },
      security: {
        allowedCommands: ['ls', 'cat', 'echo'],
        safezones: [CWD, path.join(CWD, 'safe'), '/tmp/safezone'],
        maxExecutionTime: 1000,
        maxFileSize: 1024,
        unsafeArgumentPatterns: ['^--dangerous', '.*delete.*']
      },
      database: { path: './db.sqlite', backupInterval: 0 },
      logging: { level: 'error', pretty: false },
      performance: { maxConcurrency: 1, queueSize: 10 }
    };
    securityValidator = new SecurityValidator(mockConfig);
  });

  describe('validatePath', () => {
    it('should allow paths within a configured safe zone', async () => {
      const safePath = path.join(CWD, 'safe/file.txt');
      mockFsPromises.__setFile(safePath, 'content');
      mockFsPromises.realpath.mockResolvedValue(path.resolve(safePath));
      await expect(securityValidator.validatePath(safePath)).resolves.toBe(path.resolve(safePath));
    });

    it('should allow paths that are exactly a safe zone', async () => {
      const exactSafeZone = path.join(CWD, 'safe');
      mockFsPromises.__setDirectory(exactSafeZone); // Mark as directory
      mockFsPromises.realpath.mockResolvedValue(path.resolve(exactSafeZone));
      await expect(securityValidator.validatePath(exactSafeZone)).resolves.toBe(path.resolve(exactSafeZone));
    });

    it('should resolve and allow paths within /tmp/safezone', async () => {
      const tempSafePath = '/tmp/safezone/another.log';
      mockFsPromises.__setFile(tempSafePath, 'log content');
      // Ensure realpath mock returns the fully resolved path for consistency
      const resolvedTempSafePath = path.resolve(tempSafePath);
      mockFsPromises.realpath.mockResolvedValue(resolvedTempSafePath);
      await expect(securityValidator.validatePath(tempSafePath)).resolves.toBe(resolvedTempSafePath);
    });

    it('should deny paths outside configured safe zones', async () => {
      const unsafePath = '/etc/passwd';
      mockFsPromises.realpath.mockResolvedValue(path.resolve(unsafePath)); // mock realpath
      await expect(securityValidator.validatePath(unsafePath)).rejects.toThrow(`Path access denied: ${unsafePath}`);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          securityEvent: expect.objectContaining({ type: 'path_denied', path: unsafePath, severity: 'high' })
        }),
        expect.stringContaining('SECURITY_EVENT (HIGH): path_denied')
      );
    });

    it('should deny path traversal attempts like ../', async () => {
      const traversalPath = path.join(CWD, 'safe/../../unsafe/file.txt');
      // Simulate realpath resolving it outside safezone
      const resolvedUnsafePath = path.resolve(CWD, '../unsafe/file.txt');
      mockFsPromises.realpath.mockResolvedValue(resolvedUnsafePath);

      await expect(securityValidator.validatePath(traversalPath)).rejects.toThrow(
        `Path access denied: ${traversalPath}`
      );
    });

    it('should handle relative paths correctly based on CWD safezone', async () => {
      const relativeSafePath = './file_in_cwd.txt';
      const absoluteSafePath = path.resolve(CWD, relativeSafePath);
      mockFsPromises.__setFile(absoluteSafePath, 'content');
      mockFsPromises.realpath.mockResolvedValue(absoluteSafePath);
      await expect(securityValidator.validatePath(relativeSafePath)).resolves.toBe(absoluteSafePath);
    });

    it('should use resolved path if realpath fails with ENOENT', async () => {
      const nonExistentPath = path.join(CWD, 'safe/nonexistent.txt');
      const resolvedPath = path.resolve(nonExistentPath);
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockFsPromises.realpath.mockRejectedValue(enoentError); // realpath fails
      await expect(securityValidator.validatePath(nonExistentPath)).resolves.toBe(resolvedPath);
    });

    it('should throw if realpath fails with non-ENOENT error and path is unsafe', async () => {
      const problematicPath = '/unsafe_zone/somefile.txt';
      const resolvedPath = path.resolve(problematicPath);
      const otherError = new Error('EACCES') as NodeJS.ErrnoException;
      otherError.code = 'EACCES';
      mockFsPromises.realpath.mockRejectedValue(otherError);
      await expect(securityValidator.validatePath(problematicPath)).rejects.toThrow(
        `Path access denied: ${problematicPath}`
      );
    });
  });

  describe('validateCommand', () => {
    it('should allow commands in the whitelist', async () => {
      await expect(securityValidator.validateCommand('ls', ['-la'])).resolves.toBeUndefined();
      await expect(securityValidator.validateCommand('cat', ['file.txt'])).resolves.toBeUndefined();
    });

    it('should deny commands not in the whitelist', async () => {
      await expect(securityValidator.validateCommand('rm', ['-rf', '/'])).rejects.toThrow('Command not allowed: rm');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          securityEvent: expect.objectContaining({ type: 'command_blocked', command: 'rm', severity: 'high' })
        }),
        expect.stringContaining('SECURITY_EVENT (HIGH): command_blocked')
      );
    });

    it('should allow all commands if "all" is specified (with a warning)', async () => {
      mockConfig.security.allowedCommands = 'all';
      securityValidator = new SecurityValidator(mockConfig); // Re-initialize
      await expect(securityValidator.validateCommand('any_command', [])).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'any_command ' }), // Note the space at the end
        'SECURITY_RISK: All commands are currently allowed in configuration.'
      );
    });

    it('should block commands matching dangerous patterns', async () => {
      await expect(securityValidator.validateCommand('echo', ['`reboot`'])).rejects.toThrow(
        'Potentially dangerous command pattern blocked: `.*` in command "echo"'
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          securityEvent: expect.objectContaining({ type: 'pattern_detected', pattern: '`.*`', severity: 'high' })
        }),
        expect.stringContaining('SECURITY_EVENT (HIGH): pattern_detected')
      );
    });

    it('should block arguments matching unsafeArgumentPatterns from config', async () => {
      await expect(securityValidator.validateCommand('echo', ['hello', '--dangerousArg'])).rejects.toThrow(
        'Unsafe argument content detected (pattern: ^--dangerous): --dangerousArg'
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          securityEvent: expect.objectContaining({
            type: 'pattern_detected',
            pattern: '^--dangerous',
            severity: 'high'
          })
        }),
        expect.stringContaining('SECURITY_EVENT (HIGH): pattern_detected')
      );

      await expect(securityValidator.validateCommand('cat', ['some_file_to_delete.txt'])).rejects.toThrow(
        'Unsafe argument content detected (pattern: .*delete.*): some_file_to_delete.txt'
      );
    });

    it('should allow commands with safe arguments', async () => {
      await expect(securityValidator.validateCommand('echo', ['safe', 'argument'])).resolves.toBeUndefined();
    });

    // Shell-specific tests
    describe('Shell-Specific Validations', () => {
      it('should block dangerous PowerShell cmdlets', async () => {
        mockConfig.security.allowedCommands = ['powershell'];
        securityValidator = new SecurityValidator(mockConfig);
        await expect(
          securityValidator.validateCommand('powershell', ['Invoke-Expression', '"Get-Process"'])
        ).rejects.toThrow('Blocked PowerShell cmdlet/feature: (?:^|\\s|[-/;])Invoke-Expression(?:$|\\s|[-/;])');
      });

      it('should block dangerous Bash features', async () => {
        mockConfig.security.allowedCommands = ['bash'];
        securityValidator = new SecurityValidator(mockConfig);
        await expect(securityValidator.validateCommand('bash', ['-c', 'eval "echo hi"'])).rejects.toThrow(
          'Blocked shell feature: (?:^|\\s)eval(?:$|\\s)'
        );
      });

      it('should block dangerous CMD features', async () => {
        mockConfig.security.allowedCommands = ['cmd'];
        securityValidator = new SecurityValidator(mockConfig);
        await expect(securityValidator.validateCommand('cmd', ['/c', 'start', 'notepad.exe'])).rejects.toThrow(
          'Blocked CMD feature: (?:^|\\s)start(?:$|\\s)'
        );
      });

      it('should block WSL escape to Windows system', async () => {
        mockConfig.security.allowedCommands = ['wsl'];
        securityValidator = new SecurityValidator(mockConfig);
        await expect(securityValidator.validateCommand('wsl', ['ls', '/mnt/c/Windows/System32'])).rejects.toThrow(
          'WSL escape to Windows system directories or shells blocked'
        );
      });
    });

    describe('Argument Validations', () => {
      it('should block path traversal in arguments', async () => {
        await expect(securityValidator.validateCommand('cat', ['../sensitive.txt'])).rejects.toThrow(
          'Path traversal attempts in arguments are blocked'
        );
      });

      it('should block null bytes in arguments', async () => {
        await expect(securityValidator.validateCommand('echo', ['hello\0world'])).rejects.toThrow(
          'Null bytes in arguments are not allowed'
        );
      });

      it('should block excessively long arguments', async () => {
        const longArg = 'a'.repeat(5000);
        await expect(securityValidator.validateCommand('echo', [longArg])).rejects.toThrow(
          'Argument too long (max 4096 chars)'
        );
      });

      it('should block shell metacharacters like ; in arguments', async () => {
        await expect(securityValidator.validateCommand('echo', ['hello;ls'])).rejects.toThrow(
          "Potentially dangerous shell metacharacter ';' in argument: hello;ls"
        );
      });
    });
  });

  describe('isPathInSafeZone', () => {
    it('should return true for paths within a safe zone', () => {
      expect(securityValidator.isPathInSafeZone(path.join(CWD, 'safe/file.txt'))).toBe(true);
      expect(securityValidator.isPathInSafeZone('/tmp/safezone/test.sh')).toBe(true);
    });

    it('should return true for path that is exactly a safe zone', () => {
      expect(securityValidator.isPathInSafeZone(path.join(CWD, 'safe'))).toBe(true);
    });

    it('should return false for paths outside safe zones', () => {
      expect(securityValidator.isPathInSafeZone('/etc/shadow')).toBe(false);
    });

    it('should correctly handle paths with trailing slashes', () => {
      expect(securityValidator.isPathInSafeZone(path.join(CWD, 'safe/'))).toBe(true);
    });
  });

  describe('sanitizeInput', () => {
    it('should remove dangerous characters', () => {
      expect(securityValidator.sanitizeInput('<hello> "world"|*?.txt')).toBe('helloworld.txt');
    });

    it('should remove path traversal attempts', () => {
      expect(securityValidator.sanitizeInput('../../secret.txt')).toBe('secret.txt');
    });

    it('should trim whitespace', () => {
      expect(securityValidator.sanitizeInput('  input  ')).toBe('input');
    });

    it('should remove control characters', () => {
      expect(securityValidator.sanitizeInput('file\u0000name.txt')).toBe('filename.txt');
    });
  });

  describe('logSecurityEvent', () => {
    it('should call logger.warn with correct security event structure', () => {
      securityValidator.logSecurityEvent({
        type: 'command_blocked',
        command: 'test_cmd',
        severity: 'medium',
        details: 'A test block'
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          securityEvent: {
            type: 'command_blocked',
            command: 'test_cmd',
            severity: 'medium',
            details: 'A test block',
            timestamp: expect.any(String)
          }
        }),
        'SECURITY_EVENT (MEDIUM): command_blocked. A test block'
      );
    });
  });
});
