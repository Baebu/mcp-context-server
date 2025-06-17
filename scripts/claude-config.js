/* eslint-disable no-console */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function getClaudeDesktopConfigPath() {
  const platform = process.platform;
  const home = os.homedir();

  switch (platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    case 'win32':
      return path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
    default:
      return path.join(home, '.config', 'claude', 'claude_desktop_config.json');
  }
}

async function checkBuild() {
  const distPath = path.join(projectRoot, 'dist', 'index.js');

  try {
    await fs.access(distPath);
    return true;
  } catch {
    return false;
  }
}

async function generateConfig() {
  console.log('🔧 Claude Desktop Configuration Helper\n');

  const isBuilt = await checkBuild();
  if (!isBuilt) {
    console.log('❌ Project not built yet. Run: npm run build\n');
    return;
  }

  const serverExecutablePath = path.resolve(projectRoot, 'dist', 'index.js');
  const serverConfigFilePath = path.resolve(projectRoot, 'config', 'server.yaml'); // Default server config
  const claudeConfigPath = getClaudeDesktopConfigPath();

  console.log('📍 Configuration Details:');
  console.log(`   Platform: ${process.platform}`);
  console.log(`   Claude Desktop Config File: ${claudeConfigPath}`);
  console.log(`   MCP Server Executable Path: ${serverExecutablePath}`);
  console.log(`   MCP Server Configuration File Path: ${serverConfigFilePath}\n`);

  const serverConfigEntry = {
    'context-savvy-mcp': {
      command: 'node',
      args: [serverExecutablePath],
      env: {
        MCP_LOG_LEVEL: 'info',
        MCP_SERVER_CONFIG_PATH: serverConfigFilePath // New environment variable
      }
    }
  };

  let existingClaudeConfig = { mcpServers: {} };
  try {
    const configContent = await fs.readFile(claudeConfigPath, 'utf8');
    existingClaudeConfig = JSON.parse(configContent);
    console.log('✅ Found existing Claude Desktop configuration');
  } catch {
    console.log('📝 No existing Claude Desktop configuration found - will create new one');
  }

  if (!existingClaudeConfig.mcpServers) {
    existingClaudeConfig.mcpServers = {};
  }
  existingClaudeConfig.mcpServers = {
    ...existingClaudeConfig.mcpServers,
    ...serverConfigEntry
  };

  console.log('\n📋 Recommended `claude_desktop_config.json` content:');
  console.log(JSON.stringify(existingClaudeConfig, null, 2));

  console.log('\n🔧 Setup Instructions:');
  console.log('1. Copy the configuration above.');
  console.log(`2. Create or edit your Claude Desktop configuration file: ${claudeConfigPath}`);
  console.log('3. Paste the configuration into the file.');
  console.log(
    "4. IMPORTANT: Ensure the `MCP_SERVER_CONFIG_PATH` points to your *actual* `server.yaml` or equivalent if it's not in the default location relative to the project root."
  );
  console.log('5. Save the file.');
  console.log('6. Restart Claude Desktop completely.\n');

  console.log('🧪 Testing:');
  console.log('   Ask Claude: "Can you list the files in the current directory?"');
  console.log('   This should work if the integration is successful.\n');

  if (process.argv.includes('--write') || process.argv.includes('-w')) {
    await writeClaudeConfig(claudeConfigPath, existingClaudeConfig);
  } else {
    console.log('💡 To automatically write this configuration, run:');
    console.log('   npm run claude-config -- --write\n');
  }
}

async function writeClaudeConfig(configPath, config) {
  try {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(`✅ Configuration written to: ${configPath}`);
    console.log('🔄 Please restart Claude Desktop now.\n');
  } catch (error) {
    console.log(`❌ Failed to write configuration: ${error.message}`);
    console.log('📝 Please copy and paste the configuration manually.\n');
  }
}

function showHelp() {
  console.log('Claude Desktop Configuration Helper\n');
  console.log('Usage:');
  console.log('  npm run claude-config        Show configuration');
  console.log('  npm run claude-config -- -w  Write configuration automatically\n');
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
    return;
  }
  await generateConfig();
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
