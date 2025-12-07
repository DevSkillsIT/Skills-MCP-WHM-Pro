# Skills MCP WHM Pro

<div align="center">

**Enterprise-grade MCP Server for WHM/cPanel Management**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](package.json)
[![MCP Protocol](https://img.shields.io/badge/MCP-Protocol-orange)](https://modelcontextprotocol.io)
[![Tools](https://img.shields.io/badge/Tools-23-success)](schemas/mcp-tools.json)

*The most complete MCP server for WHM and cPanel automation available today*

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Tools](#-available-tools) • [CLI](#-cli-commands) • [Contributing](#-contributing)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Why Skills MCP WHM Pro?](#-why-skills-mcp-whm-pro)
- [Features](#-features)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Available Tools](#-available-tools)
- [CLI Commands](#-cli-commands)
- [IDE Integration](#-ide-integration)
- [Examples](#-examples)
- [Security](#-security)
- [Contributing](#-contributing)
- [License](#-license)
- [Credits](#-credits)

---

## 🎯 Overview

**Skills MCP WHM Pro** is a production-ready Model Context Protocol (MCP) server that provides AI assistants (like Claude, ChatGPT, and others) with comprehensive access to WHM and cPanel operations. Built for Managed Service Providers (MSPs) and hosting companies who need reliable, secure, and intelligent automation of web hosting infrastructure.

### What is MCP?

Model Context Protocol (MCP) is an open standard that enables AI assistants to securely interact with external systems through a unified interface. This MCP server acts as a bridge between AI models and your WHM/cPanel servers.

### Key Capabilities

- 🏢 **WHM Account Management** - Create, suspend, terminate, and manage cPanel accounts
- 🌐 **Advanced DNS Management** - Full DNS zone control with optimistic locking
- 📊 **Server Monitoring** - Real-time server status, load averages, and service health
- 📁 **File Operations** - Secure file management within cPanel accounts
- 📝 **Log Analysis** - Access and analyze server logs
- 🔒 **Enterprise Security** - Safety guards, input validation, and audit logging

---

## 🚀 Why Skills MCP WHM Pro?

### Comparison with Alternatives

| Feature | Skills MCP WHM Pro | whmrockstar | Others |
|---------|-------------------|-------------|--------|
| **Total Tools** | ✅ 23 tools | ⚠️ 11 tools | ❌ Limited |
| **DNS Optimistic Locking** | ✅ Yes | ❌ No | ❌ No |
| **Safety Guard System** | ✅ Yes | ❌ No | ❌ No |
| **Configurable Timeouts** | ✅ Yes | ⚠️ Fixed | ❌ No |
| **Retry Logic** | ✅ Exponential backoff | ❌ No | ❌ No |
| **Path Validation** | ✅ Yes | ⚠️ Basic | ❌ No |
| **CLI Tools** | ✅ 4 commands | ❌ None | ❌ None |
| **IDE Templates** | ✅ 4 IDEs | ❌ None | ❌ None |
| **Schema Export** | ✅ JSON schemas | ❌ No | ❌ No |
| **Prometheus Metrics** | ✅ Yes | ❌ No | ❌ No |
| **Active Development** | ✅ Yes | ⚠️ Inactive | ❌ Abandoned |

### What Makes Us Different

1. **+109% More Tools** - 23 tools vs 11 in whmrockstar
2. **Production-Ready** - Battle-tested in real MSP environments
3. **Security-First** - Multiple layers of protection against data loss
4. **Developer-Friendly** - Complete schemas, CLI tools, and IDE integration
5. **Modern Stack** - Latest Node.js, Express, and MCP protocol standards

---

## ✨ Features

### 🛡️ Enterprise Security

- **Safety Guard System** - Prevents accidental data loss with confirmation tokens
- **DNS Optimistic Locking** - Prevents race conditions in DNS updates
- **Path Validation** - Directory traversal protection
- **Input Sanitization** - LDAP injection and XSS prevention
- **Credential Sanitization** - Never logs API tokens or passwords
- **Audit Logging** - Complete audit trail of all operations

### ⚡ Performance & Reliability

- **Configurable Timeouts** - Via environment variables (WHM_TIMEOUT)
- **Exponential Backoff** - Intelligent retry logic with configurable attempts
- **Connection Pooling** - Efficient resource management
- **Prometheus Metrics** - Production monitoring and alerting
- **Health Checks** - Built-in health endpoints for monitoring

### 🔧 Developer Experience

- **CLI Tools** - 4 powerful commands for introspection and configuration
- **JSON Schemas** - Complete tool schemas for validation
- **IDE Templates** - Pre-configured setups for VS Code, Windsurf, Claude Desktop, JetBrains
- **Example Library** - 20+ real-world usage examples
- **API Documentation** - Complete WHM API reference included

### 🌐 DNS Management Excellence

- Full zone management (create, read, update, delete)
- Support for all record types: A, AAAA, CNAME, MX, TXT, NS, PTR
- Optimistic locking prevents concurrent modification conflicts
- Automatic serial number management
- TTL configuration per record

### 📊 Monitoring & Observability

- Real-time server status and load averages
- Service health checks (httpd, mysql, named, etc.)
- Log file access with filtering
- Prometheus metrics export
- Structured JSON logging

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Assistant                            │
│              (Claude, ChatGPT, etc.)                         │
└────────────────────┬────────────────────────────────────────┘
                     │ MCP Protocol (JSON-RPC)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Skills MCP WHM Pro Server                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Safety Guard │  │ Tool Handler │  │ Auth Manager │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Retry Logic  │  │ Validators   │  │ Metrics      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────────────┬────────────────────────────────────────┘
                     │ WHM JSON API (HTTPS)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   WHM Server (Port 2087)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ cPanel Accts │  │ DNS Zones    │  │ Services     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Protocol**: MCP (Model Context Protocol)
- **API**: WHM JSON API v11.110
- **Validation**: Zod schemas
- **Logging**: Winston
- **Metrics**: Prom-client (Prometheus)
- **HTTP Client**: Axios

---

## 📦 Installation

### Prerequisites

- Node.js 18.0.0 or higher
- WHM server with root or reseller API access
- WHM API Token (preferred) or root password

### Quick Start

```bash
# Clone the repository
git clone https://github.com/DevSkillsIT/skills-mcp-whm-pro.git
cd skills-mcp-whm-pro

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your WHM credentials
nano .env

# Start the server
npm start
```

### Using PM2 (Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start src/server.js --name mcp-whm-pro

# Save PM2 configuration
pm2 save

# Setup startup script
pm2 startup
```

### NPM Package (Coming Soon)

```bash
npm install -g @DevSkillsIT/mcp-whm-pro
skills-whm-mcp start
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file with the following variables:

```bash
# WHM Server Configuration
WHM_HOST=https://your-whm-server.com:2087
WHM_API_TOKEN=your-whm-api-token-here

# MCP Server Configuration
MCP_PORT=3100

# Optional: Safety Token (for destructive operations)
MCP_SAFETY_TOKEN=your-random-safety-token

# Optional: Timeout Configuration (milliseconds)
WHM_TIMEOUT=30000

# Optional: Retry Configuration
RETRY_MAX_ATTEMPTS=3
RETRY_INITIAL_DELAY=1000

# Optional: Environment
NODE_ENV=production
```

### Obtaining WHM API Token

1. Log in to WHM as root
2. Navigate to: **Development** → **Manage API Tokens**
3. Click **Generate Token**
4. Give it a descriptive name (e.g., "MCP Server")
5. Copy the token (shown only once!)
6. Paste into `.env` file

### Security Best Practices

- ✅ **Always use HTTPS** (port 2087, not 2086)
- ✅ **Use API tokens** instead of passwords
- ✅ **Restrict IP access** in WHM if possible
- ✅ **Set MCP_SAFETY_TOKEN** for destructive operations
- ✅ **Never commit `.env`** to version control
- ✅ **Rotate tokens regularly** (every 90 days)

---

## 🎮 Usage

### Starting the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start

# With PM2
pm2 start src/server.js --name mcp-whm-pro
```

### Health Check

```bash
curl http://localhost:3100/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "skills-mcp-whm-pro",
  "version": "1.0.0",
  "timestamp": "2025-12-07T14:00:00.000Z"
}
```

### Calling MCP Endpoint

```bash
# List available tools
curl -X POST http://localhost:3100/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

### Example: List cPanel Accounts

```bash
curl -X POST http://localhost:3100/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "whm.list_accounts",
      "arguments": {}
    },
    "id": 1
  }'
```

---

## 🛠️ Available Tools

### WHM Account Management (6 tools)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `whm.list_accounts` | List all cPanel accounts | Read-only |
| `whm.create_account` | Create new cPanel account | Write |
| `whm.suspend_account` | Suspend cPanel account | Write |
| `whm.unsuspend_account` | Unsuspend cPanel account | Write |
| `whm.terminate_account` | Permanently delete account | Destructive ⚠️ |
| `whm.get_account_summary` | Get detailed account info | Read-only |

### DNS Management (6 tools)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `dns.list_zones` | List all DNS zones | Read-only |
| `dns.get_zone` | Get complete zone records | Read-only |
| `dns.add_record` | Add DNS record to zone | Write |
| `dns.edit_record` | Edit existing DNS record | Write |
| `dns.delete_record` | Delete DNS record | Destructive ⚠️ |
| `dns.reset_zone` | Reset zone to defaults | Destructive ⚠️ |

### Monitoring (3 tools)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `whm.server_status` | Get server status & uptime | Read-only |
| `whm.service_status` | Check specific service status | Read-only |
| `system.get_load` | Get load averages & usage | Read-only |

### System Management (2 tools)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `whm.restart_service` | Restart system service | Write |
| `system.restart_service` | Restart service (allowlist) | Write |

### File Management (4 tools)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `file.list` | List files in cPanel account | Read-only |
| `file.read` | Read file content | Read-only |
| `file.write` | Write file (auto-backup) | Write |
| `file.delete` | Delete file | Destructive ⚠️ |

### Log Management (1 tool)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `log.read_last_lines` | Read last N lines from log | Read-only |

### Other (1 tool)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `whm.list_domains` | List all domains on server | Read-only |

**Total: 23 Tools** (vs 11 in whmrockstar)

---

## 💻 CLI Commands

The CLI provides powerful introspection and configuration tools:

### Available Commands

```bash
# List all available MCP tools (summary)
npx skills-whm-mcp introspect

# Show complete tool schemas (JSON output)
npx skills-whm-mcp describe-tools

# Export schemas to file
npx skills-whm-mcp export-schema all > schemas.json
npx skills-whm-mcp export-schema mcp-tools > mcp-tools.json
npx skills-whm-mcp export-schema whm-api > whm-api.json
npx skills-whm-mcp export-schema examples > examples.json

# Generate IDE configuration files
npx skills-whm-mcp generate-ide-config vscode
npx skills-whm-mcp generate-ide-config windsurf
npx skills-whm-mcp generate-ide-config claude
npx skills-whm-mcp generate-ide-config jetbrains

# Show help
npx skills-whm-mcp help
```

### Example Output: introspect

```
Available MCP Tools (23 total):

 1. whm.list_accounts      - List all cPanel accounts on the WHM server...
 2. whm.create_account     - Create a new cPanel account with specified...
 3. whm.suspend_account    - Suspend a cPanel account and prevent access...
...

Categories:
  - WHM Account Management: 6 tools
  - DNS Management: 6 tools
  - WHM Monitoring: 2 tools
  - System Management: 2 tools
  - File Management: 4 tools
  - Log Management: 1 tool
```

---

## 🔌 IDE Integration

Pre-configured templates for popular IDEs:

### VS Code

```bash
npx skills-whm-mcp generate-ide-config vscode
# Copy to .vscode/settings.json
```

### Windsurf

```bash
npx skills-whm-mcp generate-ide-config windsurf
# Copy to ~/.windsurf/config/mcp.json
```

### Claude Desktop

```bash
npx skills-whm-mcp generate-ide-config claude
# macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
# Windows: %APPDATA%\Claude\claude_desktop_config.json
```

### JetBrains IDEs

```bash
npx skills-whm-mcp generate-ide-config jetbrains
# Import XML in Settings > MCP Plugins
```

---

## 📚 Examples

### Natural Language Prompts

Skills MCP WHM Pro is designed to work with natural language:

#### Account Management
```
"Create a new cPanel account for domain newclient.com with username newclient"
"Suspend account badpayer due to non-payment"
"Show me all cPanel accounts on the server"
"What's the disk usage for account example?"
```

#### DNS Management
```
"Add an A record for www.example.com pointing to 192.0.2.1"
"Add MX record for example.com pointing to mail.example.com with priority 10"
"Show all DNS records for example.com"
"Add SPF record for example.com"
```

#### Monitoring
```
"What is the current server status?"
"Is Apache running?"
"Show me the server load and memory usage"
"Check the last 100 lines of Apache error log"
```

#### Troubleshooting
```
"Client's website example.com is not loading - investigate"
"Check email configuration for clientdomain.com"
"Show error logs for httpd service"
```

### Workflow Examples

See [`schemas/examples.json`](schemas/examples.json) for 20+ complete workflow examples including:
- Morning server health check
- New client onboarding
- Email delivery troubleshooting
- Website downtime investigation

---

## 🔐 Security

### Security Levels

All tools are classified by security impact:

- **Read-only** 🟢 - Safe operations that only retrieve information
- **Write** 🟡 - Operations that modify configuration or data
- **Destructive** 🔴 - Dangerous operations that delete data (require `confirmationToken`)

### Safety Guard System

Destructive operations require a `confirmationToken` parameter matching the `MCP_SAFETY_TOKEN` environment variable:

```javascript
// Example: Terminate account (destructive)
{
  "name": "whm.terminate_account",
  "arguments": {
    "username": "badaccount",
    "confirmationToken": "your-safety-token",
    "reason": "Policy violation - ToS breach"
  }
}
```

### Input Validation

- All inputs validated with Zod schemas
- Username sanitization (alphanumeric only, max 16 chars)
- Domain validation (valid FQDN format)
- Path validation (prevent directory traversal)
- Email validation (RFC 5322 compliant)

### DNS Optimistic Locking

Prevents race conditions in DNS updates:

```javascript
// Must provide expected_content for safety
{
  "name": "dns.edit_record",
  "arguments": {
    "zone": "example.com",
    "line": 15,
    "expected_content": "www.example.com. 14400 IN A 192.0.2.1",
    "new_content": "www.example.com. 14400 IN A 192.0.2.2",
    "confirmationToken": "your-safety-token",
    "reason": "IP migration to new server"
  }
}
```

If the record changed since reading, the edit fails with clear error message.

### Audit Logging

All operations logged with:
- Timestamp
- Operation type
- Parameters (sanitized - no secrets)
- Result (success/failure)
- User identifier (from AI assistant)

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone and install
git clone https://github.com/DevSkillsIT/skills-mcp-whm-pro.git
cd skills-mcp-whm-pro
npm install

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Watch mode
npm run test:watch
```

### Code Style

- ES6+ JavaScript
- 2-space indentation
- Descriptive variable names
- JSDoc comments for functions
- Zod schemas for validation

### Testing Requirements

- Unit tests for all tool handlers
- Integration tests for WHM API calls
- Minimum 70% code coverage
- All tests must pass before PR merge

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Credits

### Developed By

**Skills IT - Soluções em Tecnologia**
- Website: [https://www.skillsit.com.br](https://www.skillsit.com.br)
- Email: contato@skillsit.com.br
- GitHub: [@DevSkillsIT](https://github.com/skills-it)

### Inspiration

This project was inspired by [@genxis/whmrockstar](https://www.npmjs.com/package/@genxis/whmrockstar) but represents a complete rewrite with:
- 109% more tools (23 vs 11)
- Enterprise security features
- Production-ready reliability
- Modern development tools

### MCP Protocol

Built on the [Model Context Protocol](https://modelcontextprotocol.io) open standard by Anthropic.

---

## 📞 Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/DevSkillsIT/skills-mcp-whm-pro/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/DevSkillsIT/skills-mcp-whm-pro/discussions)
- 📧 **Email**: contato@skillsit.com.br

---

<div align="center">

**Made with ❤️ by Skills IT**

*Empowering MSPs with intelligent automation*

[⬆ Back to Top](#skills-mcp-whm-pro)

</div>
