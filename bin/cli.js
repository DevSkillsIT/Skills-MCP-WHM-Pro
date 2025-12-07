#!/usr/bin/env node

/**
 * Skills MCP WHM Pro - CLI
 * Command-line interface for schema export and IDE config generation
 *
 * Usage:
 *   npx skills-whm-mcp introspect
 *   npx skills-whm-mcp describe-tools
 *   npx skills-whm-mcp export-schema [all|mcp-tools|whm-api|examples]
 *   npx skills-whm-mcp generate-ide-config [vscode|windsurf|claude|jetbrains]
 */

const fs = require('fs');
const path = require('path');

// Helper to safely read JSON files
function safeReadJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (error) {
    console.error(`Error reading ${filepath}: ${error.message}`);
    return null;
  }
}

// Get command and arguments
const args = process.argv.slice(2);
const command = (args[0] || '').toLowerCase();
const arg1 = (args[1] || '').toLowerCase();

// Command: introspect
// Lists all available tools (tool names only)
function introspect() {
  const toolsPath = path.join(__dirname, '..', 'schemas', 'mcp-tools.json');
  const data = safeReadJSON(toolsPath);

  if (!data || !data.tools) {
    console.error('Failed to load tool schemas');
    process.exit(1);
  }

  console.log('Available MCP Tools (23 total):\n');
  data.tools.forEach((tool, index) => {
    console.log(`${(index + 1).toString().padStart(2, ' ')}. ${tool.name.padEnd(25)} - ${tool.description.substring(0, 60)}...`);
  });

  console.log(`\nCategories:`);
  const categories = [...new Set(data.tools.map(t => t.category))];
  categories.forEach(cat => {
    const count = data.tools.filter(t => t.category === cat).length;
    console.log(`  - ${cat}: ${count} tools`);
  });
}

// Command: describe-tools
// Returns complete JSON schema for all tools
function describeTools() {
  const toolsPath = path.join(__dirname, '..', 'schemas', 'mcp-tools.json');
  const data = safeReadJSON(toolsPath);

  if (!data) {
    console.error('Failed to load tool schemas');
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
}

// Command: export-schema [which]
// Exports schemas in JSON format
function exportSchema(which) {
  const schemasDir = path.join(__dirname, '..', 'schemas');

  const schemaMap = {
    'mcp-tools': 'mcp-tools.json',
    'whm-api': 'whm-api-reference.json',
    'examples': 'examples.json'
  };

  if (which === 'all') {
    // Export all schemas as a single JSON object
    const allSchemas = {};
    for (const [key, filename] of Object.entries(schemaMap)) {
      allSchemas[key] = safeReadJSON(path.join(schemasDir, filename));
    }
    console.log(JSON.stringify(allSchemas, null, 2));
    return;
  }

  if (!schemaMap[which]) {
    console.error(`Unknown schema: ${which}`);
    console.error('Available options: all, mcp-tools, whm-api, examples');
    process.exit(1);
  }

  const schema = safeReadJSON(path.join(schemasDir, schemaMap[which]));
  console.log(JSON.stringify(schema, null, 2));
}

// Command: generate-ide-config [ide]
// Generates IDE-specific configuration files
function generateIdeConfig(ide) {
  const templateMap = {
    'vscode': 'vscode-settings.json',
    'windsurf': 'windsurf-config.json',
    'claude': 'claude-desktop.json',
    'jetbrains': 'jetbrains-config.xml'
  };

  const templateFilename = templateMap[ide];

  if (!templateFilename) {
    console.error('Usage: skills-whm-mcp generate-ide-config <vscode|windsurf|claude|jetbrains>');
    process.exit(1);
  }

  const sourcePath = path.join(__dirname, '..', 'templates', templateFilename);
  const extension = templateFilename.endsWith('.xml') ? '.xml' : '.json';
  const targetPath = path.join(process.cwd(), `skills-whm-mcp-${ide}${extension}`);

  if (!fs.existsSync(sourcePath)) {
    console.error(`Template not found: ${sourcePath}`);
    console.error('Please ensure templates directory exists with IDE configurations');
    process.exit(1);
  }

  try {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`✅ Generated ${ide} configuration: ${targetPath}`);
    console.log(`\nNext steps:`);

    switch (ide) {
      case 'vscode':
        console.log('  1. Copy contents to .vscode/settings.json');
        console.log('  2. Install MCP extension');
        console.log('  3. Reload VS Code');
        break;
      case 'windsurf':
        console.log('  1. Copy to ~/.windsurf/config/mcp.json');
        console.log('  2. Restart Windsurf');
        break;
      case 'claude':
        console.log('  1. Copy to ~/Library/Application Support/Claude/claude_desktop_config.json (Mac)');
        console.log('     or %APPDATA%\\Claude\\claude_desktop_config.json (Windows)');
        console.log('  2. Restart Claude Desktop');
        break;
      case 'jetbrains':
        console.log('  1. Import XML in Settings > MCP Plugins');
        console.log('  2. Restart IDE');
        break;
    }
  } catch (error) {
    console.error(`Failed to generate config: ${error.message}`);
    process.exit(1);
  }
}

// Command router
switch (command) {
  case 'introspect':
    introspect();
    break;

  case 'describe-tools':
    describeTools();
    break;

  case 'export-schema':
    exportSchema(arg1 || 'all');
    break;

  case 'generate-ide-config':
    generateIdeConfig(arg1);
    break;

  case 'help':
  case '--help':
  case '-h':
  case '':
    console.log(`
Skills MCP WHM Pro - CLI

Usage:
  npx skills-whm-mcp <command> [options]

Commands:
  introspect                          List all available MCP tools
  describe-tools                      Show complete tool schemas (JSON)
  export-schema [which]               Export schemas (all|mcp-tools|whm-api|examples)
  generate-ide-config <ide>           Generate IDE configuration file
  help                                Show this help message

Examples:
  npx skills-whm-mcp introspect
  npx skills-whm-mcp describe-tools > tools.json
  npx skills-whm-mcp export-schema all > schemas.json
  npx skills-whm-mcp export-schema mcp-tools
  npx skills-whm-mcp generate-ide-config vscode
  npx skills-whm-mcp generate-ide-config claude

IDE Support:
  - vscode      VS Code MCP extension
  - windsurf    Windsurf MCP integration
  - claude      Claude Desktop app
  - jetbrains   JetBrains IDEs (IntelliJ, WebStorm, etc)

Documentation:
  https://github.com/skills-it/skills-mcp-whm-pro
`);
    break;

  default:
    console.error(`Unknown command: ${command}`);
    console.error('Run "npx skills-whm-mcp help" for usage information');
    process.exit(1);
}
