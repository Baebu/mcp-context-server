# context-savy-server - Project Instructions for Claude Desktop

## Project Overview

**Project Name:** context-savy-server
**Project Type:** MCP Context Server
**Root Directory:** `A:\context-savy-server`
**Description:** A context-efficient MCP server for maximizing productivity in Claude chats
**Version:** 1.0.0
**Author:** Your Name <your.email@example.com>

## Project Structure

The project is organized as follows:

### Key Directories

• **src/** - Source code and main application logic (57 files)
• **scripts/** - Build and utility scripts (17 files)
• **backup/** - Project files and resources (9 files)
• **tests/** - Test files and testing utilities (9 files)
• **config/** - Configuration files and settings (4 files)
• **examples/** - Project files and resources (2 files)
• **ui/** - Project files and resources (1 files)
• **logs/** - Project files and resources (0 files)

### Important Files

• **package.json** (Configuration) - Node.js project configuration and dependencies
• **README.md** (Documentation) - Project documentation and setup instructions
• **tsconfig.json** (Configuration) - TypeScript compiler configuration
• **.gitignore** (File) - Git ignore patterns for version control
• **package-lock.json** (Configuration) - Locked dependency versions for consistent installs
• **.env.example** (File) - Project configuration file
• **CONTRIBUTING.md** (Documentation) - Project configuration file
• **LICENSE** (File) - Project configuration file
• **Makefile** (File) - Build automation and common tasks

## Technologies Used

• Dependency Injection
• ESLint
• Jest Testing
• Model Context Protocol
• Prettier
• SQLite Database
• TypeScript

## Dependencies

**Production Dependencies:** @modelcontextprotocol/sdk, better-sqlite3, convict, inversify, p-queue, pino, pino-pretty, reflect-metadata, stream-json, ts-node (and 5 more)

**Development Dependencies:** @jest/globals, @types/better-sqlite3, @types/convict, @types/jest, @types/lru-cache, @types/node, @types/ws, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, cross-env (and 12 more)

## Available Commands

• `npm run build` - tsc -p tsconfig.build.json
• `npm run build:simple` - tsc -p tsconfig.build.json
• `npm run build:watch` - tsc -p tsconfig.build.json --watch
• `npm run config` - tsx scripts/config-ui.ts
• `npm run dev` - tsx watch src/index.ts
• `npm run start` - node dist/index.js
• `npm run test` - cross-env NODE_OPTIONS=--experimental-vm-modules jest --config jest.config.json
• `npm run generate-preferences` - node scripts/generate-preferences.js
• `npm run generate-tool-docs` - tsx scripts/generate-tool-docs.ts
• `npm run config:validate` - tsx scripts/validate-config.ts
• `npm run dev:analyze` - npm run config:validate && npm run generate-tool-docs
• `npm run setup:interactive` - tsx scripts/setup-wizard.ts
• `npm run setup:auto` - node scripts/setup.js --auto
• `npm run preferences:generate` - tsx scripts/unified-preferences.ts generate
• `npm run preferences:validate` - tsx scripts/unified-preferences.ts validate
• `npm run test-syntax` - tsx scripts/test-syntax.ts
• `npm run lint:fix` - eslint src --ext .ts --fix
• `npm run format` - prettier --write "src/**/\*.{ts,js,json}" "config/**/_.{yaml,json}" "_.{json,md}"
• `npm run format:check` - prettier --check "src/**/\*.{ts,js,json}" "config/**/_.{yaml,json}" "_.{json,md}"
• `npm run type-check` - tsc -p tsconfig.build.json --noEmit
• `npm run security-audit` - npm audit --audit-level moderate
• `npm run clean` - rimraf dist coverage
• `npm run prepare` - husky install || true
• `npm run setup` - node scripts/setup.js
• `npm run health-check` - node scripts/health-check.js
• `npm run claude-config` - node scripts/claude-config.js
• `npm run prepack` - npm run build
• `npm run postinstall` - npm run setup

## MCP Context Server Tools Available

You have access to powerful MCP Context Server tools for working with this project:

### Context Management Tools

• **`store_context`** - Store project insights, patterns, and important information

- Use key pattern: `context-savy-server:topic:description`
- Example: Store coding patterns, architecture decisions, or configuration notes

• **`get_context`** - Retrieve stored project information

- Access previously stored insights about this project
- Quickly recall project-specific patterns and decisions

• **`query_context`** - Search across all stored project context

- Find related information using flexible search patterns
- Discover connections between different aspects of the project

### Smart Path Management

• **`create_smart_path`** - Create reusable bundles of related project files

- Bundle related files: `context-savy-server-core-files`, `context-savy-server-config-files`
- Create context collections for different project areas

• **`execute_smart_path`** - Quickly access bundled file collections

- Efficiently retrieve multiple related files at once
- Perfect for reviewing configuration, core logic, or test files

• **`list_smart_paths`** - List all available smart paths

- View all created smart path bundles
- Manage and organize your file collections

### File Operations

• **`read_file`** - Read any project file with automatic truncation

- Safe reading of large files with size limits
- Supports all file types in your project structure
- Advanced search capabilities within files

• **`write_file`** - Create or modify project files

- Automatic directory creation for new files
- Respects project structure and permissions

• **`edit_file`** - Edit specific lines in a file with operations like replace, insert, delete

- Precise line-based editing with backup creation
- Preview changes before applying
- Support for multiple line operations

• **`batch_edit_file`** - Perform multiple edit operations on a file in a single transaction

- Efficient bulk editing operations
- Atomic changes with rollback capability

• **`list_directory`** - Explore project directories with metadata

- Get detailed information about any project directory
- Understand file organization and structure

• **`search_files`** - Search for text or patterns across multiple files in a directory tree

- Powerful regex and text search capabilities
- Context-aware results with line numbers
- Configurable search depth and patterns

• **`find_files`** - Find files by name or pattern in a directory tree

- Locate files using name patterns and regex
- Fast file discovery across large projects

### File Parsing & Analysis

• **`parse_file`** - Parse structured files (JSON, YAML, CSV) and return content or summary

- Extract and analyze structured data
- Generate summaries of complex files
- Safe parsing with error handling

• **`analyze_project`** - Analyze any project structure and generate Claude Desktop instructions

- Generate comprehensive project documentation
- Detect technologies and dependencies
- Create workspace-ready instructions

### Workspace Management

• **`create_workspace`** - Create organized project workspaces

- Already available for this project at: `A:\context-savy-server`
- Manage multiple projects with isolated contexts

• **`sync_workspace`** - Keep workspace synchronized with file changes

- Track changes across your project files
- Maintain up-to-date project understanding

• **`track_file`** - Track a file in the current workspace

- Monitor specific files for changes
- Integration with workspace management

• **`get_workspace_stats`** - Get detailed statistics about a workspace

- Monitor workspace health and usage
- Track file counts and storage usage

• **`delete_workspace`** - Delete a workspace and all associated data

- Clean workspace removal with safety checks
- Confirmation required for data protection

• **`export_workspace_template`** - Export a workspace as a reusable template

- Share workspace configurations
- Create project templates for reuse

• **`switch_workspace`** - Switch to a different workspace

- Seamlessly move between projects
- Maintain context across workspaces

• **`list_workspaces`** - List all available workspaces

- Overview of all managed projects
- Quick workspace navigation

### Security & Command Execution

• **`execute_command`** - Run project commands safely

- Execute npm scripts, build commands, and tests
- Security-validated command execution in safe zones

• **`security_diagnostics`** - Test and verify security configuration

- Ensure safe operation within your project directory
- Validate security settings and permissions
- Test path and command safety

### System Monitoring & Health

• **`get_metrics`** - Get server performance metrics and statistics

- Monitor system performance and usage
- Track request counts and response times
- Memory and CPU usage monitoring

• **`database_health`** - Monitor database health, manage backups, and perform integrity checks

- Create and manage database backups
- Perform integrity checks and health monitoring
- Restore from backups when needed
- Clean up old backup files

### Project-Specific Tool Usage Examples

For this MCP Context Server project, you can:

1. **Store Project Insights:**

   ```
   store_context("context-savy-server:architecture:overview", "Key architectural decisions and patterns")
   ```

2. **Create Smart File Bundles:**

   ```
   create_smart_path("context-savy-server-config", "Bundle all configuration files")
   ```

3. **Search Across Project Files:**

   ```
   search_files("A:\context-savy-server/src", "TODO|FIXME", {"searchType": "regex"})
   ```

4. **Execute Project Commands:**

   ```
   execute_command("build")
   ```

5. **Analyze Project Structure:**

   ```
   list_directory("A:\context-savy-server/src")
   ```

6. **Edit Files Precisely:**

   ```
   edit_file("A:\context-savy-server/package.json", {"operation": "replace", "line": 5, "content": "updated content"})
   ```

7. **Parse Configuration Files:**

   ```
   parse_file("A:\context-savy-server/package.json", {"format": "json", "summaryOnly": true})
   ```

8. **Monitor System Health:**
   ```
   get_metrics({"category": "server"})
   database_health({"action": "get-stats"})
   ```

### Context Storage Recommendations

Store important project information using these key patterns:
• **`context-savy-server:setup:*`** - Setup and configuration notes
• **`context-savy-server:patterns:*`** - Code patterns and conventions
• **`context-savy-server:issues:*`** - Known issues and solutions
• **`context-savy-server:docs:*`** - Documentation and guides
• **`context-savy-server:metrics:*`** - Performance and health metrics
• **`context-savy-server:backups:*`** - Backup and recovery information

## Working Guidelines for Claude

When working on this MCP Context Server project:

### Project Context

• **Root Directory:** All relative paths are from `A:\context-savy-server`
• **Project Type:** This is a MCP Context Server project with 8 main directories
• **File Count:** Approximately 99 files in the project

### Development Workflow

• Use `npm run dev` for development with hot reload
• Run `npm run build` to compile TypeScript
• Use `npm run config` to launch configuration UI
• Follow clean architecture patterns and MCP protocol standards
• Use dependency injection for new services and tools

### File Organization

• **src** - Source code and main application logic
• **scripts** - Build and utility scripts
• **backup** - Project files and resources
• **tests** - Test files and testing utilities
• **config** - Configuration files and settings
• **examples** - Project files and resources
• **ui** - Project files and resources
• **logs** - Project files and resources

### Security & Best Practices

• Always use relative paths from the project root: `A:\context-savy-server`
• Respect the existing project structure and naming conventions
• Follow the established patterns found in the codebase

• Maintain TypeScript type safety and use proper type definitions
• Follow ESLint rules and code quality standards

### Key Information for Claude

• **Always use the full path when referencing files:** `A:\context-savy-server/filename`
• **Project root is:** `A:\context-savy-server`
• **Main working directories:** src, scripts, backup
• **Configuration files are located in:** A:\context-savy-server
• **This project uses:** Dependency Injection, ESLint, Jest Testing, Model Context Protocol, Prettier

---

_Auto-generated project instructions with MCP Context Server integration_
_Root: A:\context-savy-server_
_Generated: 2025-06-02T14:20:48.334Z_
