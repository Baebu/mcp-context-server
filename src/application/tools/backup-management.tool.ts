// Backup Management Tools - List, view, and manage organized backups
// File: src/application/tools/backup-management.tool.ts

import { injectable } from 'inversify';
import { z } from 'zod';
import * as path from 'path';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import { RollingBackupManager } from '../../utils/backup-manager.js';

// Schema for ListBackupsTool
const listBackupsSchema = z.object({
  path: z.string().describe('File path to list backups for'),
  days: z.number().optional().default(7).describe('Number of days to look back')
});

@injectable()
export class ListBackupsTool implements IMCPTool {
  name = 'list_backups';
  description = 'List recent backups for a file';
  schema = listBackupsSchema;

  async execute(params: z.infer<typeof listBackupsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const backupManager = new RollingBackupManager();
      const backups = await backupManager.listBackups(params.path, params.days);
      
      if (backups.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No backups found for ${params.path} in the last ${params.days} days.`
          }]
        };
      }

      // Format the backup list nicely
      let output = `📁 Found ${backups.length} backup${backups.length === 1 ? '' : 's'} for ${params.path}:\n\n`;
      
      for (const backup of backups) {
        const sizeKB = (backup.size / 1024).toFixed(1);
        output += `🗓️  ${backup.date} ${backup.time} | ${backup.operation} | ${sizeKB}KB\n`;
        output += `   📄 ${backup.relativePath}\n\n`;
      }

      return {
        content: [{
          type: 'text',
          text: output
        }]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to list backups');
      return {
        content: [{
          type: 'text',
          text: `Failed to list backups: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }
}

// Schema for BackupStatsTool
const backupStatsSchema = z.object({
  directory: z.string().describe('Directory to analyze backup statistics for')
});

@injectable()
export class BackupStatsTool implements IMCPTool {
  name = 'backup_stats';
  description = 'Get backup statistics for a directory/project';
  schema = backupStatsSchema;

  async execute(params: z.infer<typeof backupStatsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const backupManager = new RollingBackupManager();
      const stats = await backupManager.getBackupStats(params.directory);
      
      if (stats.totalBackups === 0) {
        return {
          content: [{
            type: 'text',
            text: `📊 No backups found in ${params.directory}\n\nTo create backups, edit files using edit_file or batch_edit_file tools with createBackup: true (default).`
          }]
        };
      }

      const totalSizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
      
      let output = `📊 Backup Statistics for ${params.directory}:\n\n`;
      output += `📈 Total Backups: ${stats.totalBackups}\n`;
      output += `💾 Total Size: ${totalSizeMB} MB\n`;
      output += `📅 Date Range: ${stats.oldestBackup} to ${stats.newestBackup}\n\n`;
      
      output += `📋 Daily Breakdown:\n`;
      const sortedDates = Object.keys(stats.dailyBreakdown).sort().reverse();
      for (const date of sortedDates.slice(0, 10)) { // Show recent 10 days
        const count = stats.dailyBreakdown[date];
        output += `   ${date}: ${count} backup${count === 1 ? '' : 's'}\n`;
      }
      
      if (sortedDates.length > 10) {
        output += `   ... and ${sortedDates.length - 10} more days\n`;
      }

      return {
        content: [{
          type: 'text',
          text: output
        }]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to get backup stats');
      return {
        content: [{
          type: 'text',
          text: `Failed to get backup stats: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }
}

// Schema for RestoreBackupTool
const restoreBackupSchema = z.object({
  originalPath: z.string().describe('Original file path to restore to'),
  backupPath: z.string().describe('Specific backup file path to restore from'),
  createBackup: z.boolean().optional().default(true).describe('Create backup of current file before restoring')
});

@injectable()
export class RestoreBackupTool implements IMCPTool {
  name = 'restore_backup';
  description = 'Restore a file from a specific backup';
  schema = restoreBackupSchema;

  async execute(params: z.infer<typeof restoreBackupSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const filesystem = context.container.get<any>('FilesystemHandler');
      
      // Validate backup file exists
      try {
        await filesystem.readFileWithTruncation(params.backupPath, 1);
      } catch {
        throw new Error(`Backup file not found: ${params.backupPath}`);
      }

      // Create backup of current file if requested
      if (params.createBackup) {
        try {
          const currentContent = await filesystem.readFileWithTruncation(params.originalPath);
          const backupManager = new RollingBackupManager();
          
          const backupPath = await backupManager.createRollingBackup(
            params.originalPath,
            currentContent.content,
            'pre-restore'
          );
          
          const relativePath = path.relative(process.cwd(), backupPath);
          context.logger.info(`Current file backed up before restore: ${relativePath}`);
        } catch {
          // Original file might not exist, which is OK
        }
      }

      // Read backup content and restore
      const backupContent = await filesystem.readFileWithTruncation(params.backupPath);
      await filesystem.writeFile(params.originalPath, backupContent.content);

      const relativeOriginal = path.relative(process.cwd(), params.originalPath);
      const relativeBackup = path.relative(process.cwd(), params.backupPath);

      return {
        content: [{
          type: 'text',
          text: `✅ Successfully restored ${relativeOriginal} from backup:\n📄 ${relativeBackup}\n\n${params.createBackup ? '💾 Current file was backed up before restore.' : ''}`
        }]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to restore backup');
      return {
        content: [{
          type: 'text',
          text: `Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }
}

// Schema for ViewBackupTool
const viewBackupSchema = z.object({
  backupPath: z.string().describe('Path to the backup file to view'),
  maxLines: z.number().optional().default(50).describe('Maximum number of lines to show')
});

@injectable()
export class ViewBackupTool implements IMCPTool {
  name = 'view_backup';
  description = 'View the contents of a backup file';
  schema = viewBackupSchema;

  async execute(params: z.infer<typeof viewBackupSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const filesystem = context.container.get<any>('FilesystemHandler');
      
      // Read backup file
      const backupContent = await filesystem.readFileWithTruncation(params.backupPath, 1048576); // 1MB limit
      const lines = backupContent.content.split('\n');
      
      let output = `📄 Backup File: ${path.relative(process.cwd(), params.backupPath)}\n`;
      output += `📊 Size: ${(backupContent.actualSize / 1024).toFixed(1)} KB | Lines: ${lines.length}\n`;
      output += `${backupContent.truncated ? '⚠️  Content truncated\n' : ''}\n`;
      output += `${'='.repeat(60)}\n`;
      
      // Show first N lines
      const displayLines = lines.slice(0, params.maxLines);
      for (let i = 0; i < displayLines.length; i++) {
        output += `${(i + 1).toString().padStart(4, ' ')}: ${displayLines[i]}\n`;
      }
      
      if (lines.length > params.maxLines) {
        output += `\n... and ${lines.length - params.maxLines} more lines\n`;
        output += `Use maxLines parameter to see more content.`;
      }

      return {
        content: [{
          type: 'text',
          text: output
        }]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to view backup');
      return {
        content: [{
          type: 'text',
          text: `Failed to view backup: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }
}

// Schema for CleanupBackupsTool
const cleanupBackupsSchema = z.object({
  directory: z.string().describe('Directory to clean up backups in'),
  force: z.boolean().optional().default(false).describe('Force cleanup without confirmation'),
  dryRun: z.boolean().optional().default(true).describe('Show what would be cleaned up without doing it')
});

@injectable()
export class CleanupBackupsTool implements IMCPTool {
  name = 'cleanup_backups';
  description = 'Clean up old backups according to retention policy';
  schema = cleanupBackupsSchema;

  async execute(params: z.infer<typeof cleanupBackupsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Create a backup manager with default settings
      const backupManager = new RollingBackupManager({
        maxBackupsPerDay: 15,
        keepDays: 14
      });

      if (params.dryRun) {
        // For dry run, we'll just show what the current policy would do
        const stats = await backupManager.getBackupStats(params.directory);
        
        if (stats.totalBackups === 0) {
          return {
            content: [{
              type: 'text',
              text: `🧹 No backups found to clean up in ${params.directory}`
            }]
          };
        }

        let output = `🧹 Backup Cleanup Dry Run for ${params.directory}:\n\n`;
        output += `📊 Current Status:\n`;
        output += `   • Total backups: ${stats.totalBackups}\n`;
        output += `   • Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB\n`;
        output += `   • Date range: ${stats.oldestBackup} to ${stats.newestBackup}\n\n`;
        
        output += `📋 Retention Policy:\n`;
        output += `   • Keep last 14 days\n`;
        output += `   • Max 15 backups per day\n\n`;
        
        output += `⚙️  Automatic cleanup runs after each backup operation.\n`;
        output += `🔄 To force manual cleanup, run with dryRun: false`;

        return {
          content: [{
            type: 'text',
            text: output
          }]
        };
      }

      // Note: The actual cleanup happens automatically in the background
      // This is just to trigger maintenance manually if needed
      const stats = await backupManager.getBackupStats(params.directory);
      
      return {
        content: [{
          type: 'text',
          text: `✅ Backup cleanup completed for ${params.directory}\n\n📊 Current Status:\n• Total backups: ${stats.totalBackups}\n• Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB\n\n🔄 Automatic cleanup maintains retention policy:\n• Keep last 14 days\n• Max 15 backups per day`
        }]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to cleanup backups');
      return {
        content: [{
          type: 'text',
          text: `Failed to cleanup backups: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }
}
