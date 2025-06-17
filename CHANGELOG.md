# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [2.0.1] - 2025-06-17

### Added

- **Enhanced Task Management System**

  - New `create_task` tool for standardized task creation with priorities, due dates, and tags
  - New `list_tasks` tool with advanced filtering, semantic search, and sorting capabilities
  - New `update_task` tool for updating task properties and tracking progress
  - New `complete_task` tool with optional follow-up task creation
  - New `task_templates` tool for managing reusable task workflows
  - Support for recurring tasks with daily, weekly, and monthly patterns
  - Task hierarchies with parent/child relationships
  - Full workspace and session integration for better organization
  - Automatic semantic tagging for improved discovery

- **Autonomous System Behaviors**
  - New `AutonomousMonitorService` for background monitoring of system state
  - Automatic token usage tracking with thresholds (70%, 90%, 95%)
  - Automatic checkpointing at 70% token usage
  - Automatic handoff preparation at 90% token usage
  - Automatic panic mode at 95% token usage
  - Background compression for contexts > 10KB
  - Scheduled archiving (daily) and deduplication (every 6 hours)
  - Token tracking middleware for transparent usage monitoring
  - Control tools: `enable_autonomous_monitoring`, `disable_autonomous_monitoring`, `get_autonomous_status`, `trigger_maintenance`

### Fixed

- **Task Discovery Issues**

  - `find_active_tasks` now properly discovers tasks using semantic search
  - Improved task discovery with multiple search patterns
  - Better deduplication logic to avoid duplicate results
  - Tasks now properly tagged for semantic discovery

- **Manual Tool Issues**
  - Converted manual emergency tools to automatic triggers
  - Fixed token budget optimization to run continuously
  - Made compression automatic on storage operations
  - Automated context deduplication and archiving

### Changed

- Task storage now uses standardized schema with consistent structure
- Tasks automatically tagged with status, priority, workspace, and creation date
- Improved task lifecycle management with proper state transitions
- Enhanced integration with existing context management system
- Emergency protocols now trigger automatically based on system state
- Token tracking integrated transparently into all tool executions

## [2.0.0] - 2025-06-14

### Added

- Complete rewrite with TypeScript and clean architecture
- Enhanced security with command whitelisting and path validation
- SQLite-based context storage with advanced querying
- Smart path bundling for efficient file operations
- Comprehensive monitoring and metrics
- Flexible YAML-based configuration
- Full test coverage with Jest
- GitHub Actions CI/CD pipeline
- Issue templates and pull request templates
- Security policy and vulnerability reporting process

### Changed

- Migrated from JavaScript to TypeScript
- Implemented clean architecture patterns
- Enhanced performance with streaming operations
- Improved error handling and logging

### Security

- Added command whitelisting for secure execution
- Implemented path validation and sanitization
- Added comprehensive security measures
