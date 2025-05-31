/* eslint-disable no-console */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function getConfigPath() {
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

  // Check if project is built
  const isBuilt = await checkBuild();
  if (!isBuilt) {
    console.log('❌ Project not built yet. Run: npm run build\n');
    return;
  }

  const absolutePath = path.resolve(projectRoot, 'dist', 'index.js');
  const configPath = getConfigPath();

  console.log('📍 Configuration Details:');
  console.log(`   Platform: ${process.platform}`);
  console.log(`   Config file: ${configPath}`);
  console.log(`   Server path: ${absolutePath}\n`);

  // Generate the configuration
  const serverConfig = {
    'context-server': {
      command: 'node',
      args: [absolutePath],
      env: {
        MCP_LOG_LEVEL: 'info'
      }
    }
  };

  // Check if config file exists and read it
  let existingConfig = { mcpServers: {} };

  try {
    const configContent = await fs.readFile(configPath, 'utf8');
    existingConfig = JSON.parse(configContent);
    console.log('✅ Found existing Claude Desktop configuration');
  } catch {
    console.log('📝 No existing configuration found - will create new one');
  }

  // Merge configurations
  if (!existingConfig.mcpServers) {
    existingConfig.mcpServers = {};
  }

  existingConfig.mcpServers = {
    ...existingConfig.mcpServers,
    ...serverConfig
  };

  console.log('\n📋 Complete Configuration:');
  console.log(JSON.stringify(existingConfig, null, 2));

  console.log('\n🔧 Setup Instructions:');
  console.log('1. Copy the configuration above');
  console.log(`2. Create/edit: ${configPath}`);
  console.log('3. Paste the configuration into the file');
  console.log('4. Save the file');
  console.log('5. Restart Claude Desktop completely\n');

  console.log('🧪 Testing:');
  console.log('   Ask Claude: "Can you list the files in the current directory?"');
  console.log('   This should work if the integration is successful\n');

  // Offer to write config automatically (with confirmation)
  if (process.argv.includes('--write') || process.argv.includes('-w')) {
    await writeConfig(configPath, existingConfig);
  } else {
    console.log('💡 To automatically write this configuration, run:');
    console.log('   npm run claude-config -- --write\n');
  }
}

async function writeConfig(configPath, config) {
  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(configPath), { recursive: true });

    // Write configuration
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    console.log(`✅ Configuration written to: ${configPath}`);
    console.log('🔄 Please restart Claude Desktop now\n');
  } catch (error) {
    console.log(`❌ Failed to write configuration: ${error.message}`);
    console.log('📝 Please copy and paste the configuration manually\n');
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
