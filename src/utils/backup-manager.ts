// Rolling Backup Manager - Stores organized backups at project root
// File: src/utils/backup-manager.ts

import * as path from 'path';
import * as fs from 'fs/promises';
import { logger } from './logger.js';

export interface BackupConfig {
  maxBackupsPerDay: number;
  keepDays: number;
  archivePath?: string;
}

interface BackupMetadata {
  originalPath: string;
  operation: string;
  timestamp: string;
  size: number;
  lineCount: number;
  hash?: string;
}

export class RollingBackupManager {
  private config: BackupConfig;

  constructor(config: Partial<BackupConfig> = {}) {
    this.config = {
      maxBackupsPerDay: 15,
      keepDays: 14,
      ...config
    };
  }

  /**
   * Create a rolling backup organized by date at project root
   */
  async createRollingBackup(originalPath: string, content: string, operation: string = 'edit'): Promise<string> {
    const now = new Date();

    // Find project root (look for common project markers)
    const projectRoot = await this.findProjectRoot(originalPath);

    // Create date-based directory structure at project root
    // Ensure dateStr is always a string using nullish coalescing
    const dateStr =
      now.toISOString().split('T')[0] ??
      `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`; // YYYY-MM-DD
    // Ensure timeStr is always a string for .replace() using logical OR with an empty string
    const timeStr = (now.toTimeString().split(' ')[0] || '').replace(/:/g, '-') || 'unknown-time'; // HH-MM-SS

    // Removed the problematic `if (!dateStr)` check as dateStr is now guaranteed to be a string.

    const backupDir = path.join(projectRoot, '.backups', dateStr);
    await fs.mkdir(backupDir, { recursive: true });

    // Create backup filename with operation context
    const parsedPath = path.parse(originalPath);
    const relativePath = path.relative(projectRoot, originalPath);
    const safeRelativePath = relativePath.replace(/[\\\/]/g, '_'); // Replace path separators
    const backupFilename = `${safeRelativePath}_${timeStr}_${operation}${parsedPath.ext}`;
    const backupPath = path.join(backupDir, backupFilename);

    // Write backup file
    await fs.writeFile(backupPath, content);

    // Create metadata file
    const metadata: BackupMetadata = {
      originalPath: relativePath, // Store relative path from project root
      operation,
      timestamp: now.toISOString(),
      size: Buffer.byteLength(content, 'utf8'),
      lineCount: content.split('\n').length
    };

    const metadataFilename = `${safeRelativePath}_${timeStr}_${operation}.meta.json`;
    const metadataPath = path.join(backupDir, metadataFilename);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Perform maintenance asynchronously
    setImmediate(() => this.performMaintenance(projectRoot));

    logger.debug(`Backup created: ${path.relative(projectRoot, backupPath)}`);
    return backupPath;
  }

  /**
   * Find the project root by looking for common project markers
   */
  private async findProjectRoot(startPath: string): Promise<string> {
    let currentDir = path.dirname(startPath);
    const rootMarkers = [
      'package.json',
      '.git',
      'tsconfig.json',
      'README.md',
      'src',
      '.project',
      'Cargo.toml',
      'pyproject.toml',
      'go.mod'
    ];

    // Walk up the directory tree
    while (currentDir !== path.dirname(currentDir)) {
      // Not at filesystem root
      for (const marker of rootMarkers) {
        const markerPath = path.join(currentDir, marker);
        try {
          await fs.access(markerPath);
          logger.debug(`Project root found at: ${currentDir} (marker: ${marker})`);
          return currentDir;
        } catch {
          // Marker not found, continue
        }
      }
      currentDir = path.dirname(currentDir);
    }

    // Fallback: use the directory containing the file
    const fallbackRoot = path.dirname(startPath);
    logger.debug(`Project root fallback: ${fallbackRoot}`);
    return fallbackRoot;
  }

  /**
   * Perform maintenance: cleanup old backups and manage daily limits
   */
  private async performMaintenance(projectRoot: string): Promise<void> {
    const backupsDir = path.join(projectRoot, '.backups');

    try {
      const dateDirs = await fs.readdir(backupsDir);
      const today = new Date();

      for (const dateDir of dateDirs) {
        const datePath = path.join(backupsDir, dateDir);

        try {
          const dirStats = await fs.stat(datePath);
          if (!dirStats.isDirectory()) continue;

          // Parse date from directory name
          const dirDate = new Date(dateDir);
          if (isNaN(dirDate.getTime())) continue; // Skip invalid dates

          const daysDiff = Math.floor((today.getTime() - dirDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysDiff > this.config.keepDays) {
            // Archive or delete old backups
            if (this.config.archivePath) {
              await this.archiveBackups(datePath, this.config.archivePath);
            }
            await fs.rm(datePath, { recursive: true });
            logger.info(`Cleaned up old backups: ${dateDir}`);
            continue;
          }

          // Limit backups per day
          await this.limitDailyBackups(datePath);
        } catch (error) {
          logger.warn(`Error processing backup directory ${dateDir}: ${error}`);
        }
      }
    } catch (error) {
      // Backups directory might not exist yet
      logger.debug(`Backup maintenance skipped: ${error}`);
    }
  }

  /**
   * Limit the number of backups per day, keeping the most recent ones
   */
  private async limitDailyBackups(datePath: string): Promise<void> {
    try {
      const files = await fs.readdir(datePath);
      const backupFiles = files.filter(f => !f.endsWith('.meta.json'));

      if (backupFiles.length <= this.config.maxBackupsPerDay) return;

      // Get file stats for sorting by modification time
      const fileStats = await Promise.all(
        backupFiles.map(async filename => {
          const filepath = path.join(datePath, filename);
          const stats = await fs.stat(filepath);
          return { filename, filepath, mtime: stats.mtime };
        })
      );

      // Sort by modification time (newest first)
      fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Delete old backups beyond the limit
      const toDelete = fileStats.slice(this.config.maxBackupsPerDay);

      for (const file of toDelete) {
        await fs.unlink(file.filepath);

        // Also delete corresponding metadata file
        const metadataPath = file.filepath.replace(/(\.[^.]+)$/, '.meta.json');
        try {
          await fs.unlink(metadataPath);
        } catch {
          // Ignore if metadata file doesn't exist
        }
      }

      if (toDelete.length > 0) {
        logger.debug(`Cleaned up ${toDelete.length} old backups from ${path.basename(datePath)}`);
      }
    } catch (error) {
      logger.warn(`Error limiting daily backups: ${error}`);
    }
  }

  /**
   * Archive old backups to a separate location
   */
  private async archiveBackups(datePath: string, archivePath: string): Promise<void> {
    const dateDir = path.basename(datePath);
    const archiveDir = path.join(archivePath, dateDir);

    await fs.mkdir(archiveDir, { recursive: true });

    const files = await fs.readdir(datePath);
    for (const file of files) {
      const sourcePath = path.join(datePath, file);
      const destPath = path.join(archiveDir, file);
      await fs.copyFile(sourcePath, destPath);
    }

    logger.info(`Archived backups: ${dateDir}`);
  }

  /**
   * List available backups for a file
   */
  async listBackups(
    originalPath: string,
    days: number = 7
  ): Promise<
    Array<{
      date: string;
      time: string;
      operation: string;
      path: string;
      size: number;
      relativePath: string;
    }>
  > {
    const projectRoot = await this.findProjectRoot(originalPath);
    const backupsDir = path.join(projectRoot, '.backups');
    const targetRelativePath = path.relative(projectRoot, originalPath);
    const safeTargetPath = targetRelativePath.replace(/[\\\/]/g, '_');
    const backups: any[] = [];

    try {
      const dateDirs = await fs.readdir(backupsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      for (const dateDir of dateDirs) {
        const dirDate = new Date(dateDir);
        if (isNaN(dirDate.getTime()) || dirDate < cutoffDate) continue;

        const datePath = path.join(backupsDir, dateDir);
        const files = await fs.readdir(datePath);

        for (const file of files) {
          if (file.endsWith('.meta.json')) continue;
          if (!file.startsWith(safeTargetPath)) continue;

          const filePath = path.join(datePath, file);
          const stats = await fs.stat(filePath);

          // Parse filename: filename_HH-MM-SS_operation.ext
          const parts = file.replace(safeTargetPath + '_', '').split('_');
          const timeStr = parts[0]?.replace(/-/g, ':') || '';
          const operation = parts[1]?.replace(/\.[^.]*$/, '') || 'unknown';

          backups.push({
            date: dateDir,
            time: timeStr,
            operation,
            path: filePath,
            size: stats.size,
            relativePath: path.relative(projectRoot, filePath)
          });
        }
      }

      return backups.sort(
        (a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * Get backup statistics for a project
   */
  async getBackupStats(projectRoot: string): Promise<{
    totalBackups: number;
    totalSize: number;
    oldestBackup: string;
    newestBackup: string;
    dailyBreakdown: Record<string, number>;
  }> {
    const backupsDir = path.join(projectRoot, '.backups');
    const stats = {
      totalBackups: 0,
      totalSize: 0,
      oldestBackup: '',
      newestBackup: '',
      dailyBreakdown: {} as Record<string, number>
    };

    try {
      const dateDirs = await fs.readdir(backupsDir);
      let oldestDate = new Date();
      let newestDate = new Date('1970-01-01');

      for (const dateDir of dateDirs) {
        const datePath = path.join(backupsDir, dateDir);
        const dirStats = await fs.stat(datePath);

        if (!dirStats.isDirectory()) continue;

        const files = await fs.readdir(datePath);
        const backupFiles = files.filter(f => !f.endsWith('.meta.json'));

        stats.dailyBreakdown[dateDir] = backupFiles.length;
        stats.totalBackups += backupFiles.length;

        // Calculate total size
        for (const file of backupFiles) {
          const filePath = path.join(datePath, file);
          const fileStats = await fs.stat(filePath);
          stats.totalSize += fileStats.size;
        }

        // Track date range
        const dirDate = new Date(dateDir);
        if (!isNaN(dirDate.getTime())) {
          if (dirDate < oldestDate) {
            oldestDate = dirDate;
            stats.oldestBackup = dateDir;
          }
          if (dirDate > newestDate) {
            newestDate = dirDate;
            stats.newestBackup = dateDir;
          }
        }
      }
    } catch {
      // Backups directory might not exist
    }

    return stats;
  }
}
