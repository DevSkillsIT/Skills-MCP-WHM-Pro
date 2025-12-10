# Skills MCP WHM Pro

<div align="center">

**Enterprise-grade MCP Server for WHM/cPanel Management**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](package.json)
[![MCP Protocol](https://img.shields.io/badge/MCP-Protocol-orange)](https://modelcontextprotocol.io)
[![Tools](https://img.shields.io/badge/Tools-47-success)](schemas/mcp-tools.json)

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
- 🌐 **Domain Lifecycle & DNSSEC** - 22 new `domain.*`/`dns.*` tools (addon conversion, NSEC3 enable/disable + polling, DS/ALIAS checks, MX idempotência)
- 📊 **Server Monitoring** - Real-time server status, load averages, and service health
- 📁 **File Operations** - Secure file management within cPanel accounts
- 📝 **Log Analysis** - Access and analyze server logs
- 🔒 **Enterprise Security** - SafetyGuard header, ACL enforcement, domain/path validation, audit logging

---

## 🚀 Why Skills MCP WHM Pro?

### Comparison with Alternatives

| Feature | Skills MCP WHM Pro | whmrockstar | Others |
|---------|-------------------|-------------|--------|
| **Total Tools** | ✅ 47 tools | ⚠️ 11 tools | ❌ Limited |
| **DNS Optimistic Locking** | ✅ Yes | ❌ No | ❌ No |
| **Safety Guard System** | ✅ Yes | ❌ No | ❌ No |
| **Configurable Timeouts** | ✅ Yes | ⚠️ Fixed | ❌ No |
| **Retry Logic** | ✅ Exponential backoff | ❌ No | ❌ No |
| **Path/Domain Validation** | ✅ Domain & docroot hardening | ⚠️ Basic | ❌ No |
| **CLI Tools** | ✅ 4 commands | ❌ None | ❌ None |
| **IDE Templates** | ✅ 4 IDEs | ❌ None | ❌ None |
| **Schema Export** | ✅ JSON schemas | ❌ No | ❌ No |
| **Prometheus Metrics** | ✅ Yes | ❌ No | ❌ No |
| **Active Development** | ✅ Yes | ⚠️ Inactive | ❌ Abandoned |

### What Makes Us Different

1. **+327% More Tools** - 47 tools vs 11 in whmrockstar
2. **Production-Ready** - Battle-tested in real MSP environments
3. **Security-First** - Multiple layers of protection against data loss
4. **Developer-Friendly** - Complete schemas, CLI tools, and IDE integration
5. **Modern Stack** - Latest Node.js, Express, and MCP protocol standards

---

## ✨ Features

### 🔌 HTTP Streamable Protocol - MCP 2024-11-05
- **Remote Access Support** - Access MCP server remotely via HTTP endpoint
- **Better Security** - API key authentication via headers (more secure than env vars)
- **Easier Debugging** - Test with curl, Postman, or any HTTP client
- **Multi-IDE Compatible** - Works with Claude Desktop, VS Code, Cursor, Windsurf, Zed, and more

### 🌐 Domain & DNS Extensions (SPEC-NOVAS-FEATURES-WHM-001)

- **22 novas tools `domain.*`/`dns.*`** cobrindo usuário, owner, resolução, MX, DS/DNSSEC, NSEC3 enable/disable com polling, update_userdomains e verificação de autoridade
- **Paginacao obrigatoria** em `domain.get_all_info` (`limit/offset/filter`) com metadados `has_more/next_offset`
- **Addon conversions end-to-end**: listar, detalhes, iniciar conversão (SafetyGuard) e status via `conversion_id`
- **DNSSEC & NSEC3**: operações assíncronas com `operation_id`, timeout dinâmico `60s + 30s * dom` (máx 600s) e `domain.get_nsec3_status` para polling
- **MX e ALIAS com idempotência e clareza**: `dns.add_mx` evita duplicatas, `dns.check_alias_available` retorna erro claro se o endpoint não existir no WHM, `domain.get_ds_records` responde com fallback quando DNSSEC não está habilitado
- **/etc/userdomains com lock**: `domain.update_userdomains` usa `lock-manager` e transaction-log para evitar race conditions

### 🛡️ Enterprise Security

- **Safety Guard System** - Prevents accidental data loss with confirmation tokens
- **SafetyGuard Header** - `X-MCP-Safety-Token` suportado (body tem precedência) para operações destrutivas
- **ACL Enforcement** - `X-MCP-ACL-Token`/`X-ACL-Token`/`Authorization` propagados para validação root/reseller/user
- **Domain Validation (RS01)** - Rejeita FQDNs inválidos, traversal e metacaracteres em TODAS as tools com `domain`
- **Path Validation (RS03)** - Directory traversal protection para `document_root`
- **DNS Optimistic Locking** - Prevents race conditions in DNS updates
- **Credential Sanitization** - Never logs API tokens or passwords
- **Audit Logging** - Complete audit trail of all operations

### ⚡ Performance & Reliability

- **Configurable Timeouts** - `WHM_TIMEOUT` + timeouts por tipo; NSEC3 usa cálculo dinâmico (máx 600s)
- **Clear Fallbacks** - DS/ALIAS usam `withTimeout` para evitar travamento e retornam motivo quando DNSSEC/endpoint não existem
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

- Full zone management (create, read, update, delete) com optimistic locking
- Support for all record types: A, AAAA, CNAME, MX, TXT, NS, PTR, DS, ALIAS availability
- **Domain MX idempotent** (`dns.add_mx`) evita duplicatas; `dns.list_mx` e `domain.check_authority` incluídos
- **DNSSEC & NSEC3**: fetch DS (com fallback se não habilitado), enable/disable NSEC3 com polling `domain.get_nsec3_status`
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

### Request headers to remember

- `x-api-key`: required for every call
- `X-MCP-ACL-Token` / `X-ACL-Token` (ou `Authorization`): propagado para validação ACL (root/reseller/user)
- `X-MCP-Safety-Token`: alternativa ao `confirmationToken` no body para operações destrutivas (body tem precedência)

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

### Quick Start for IDEs

#### Claude Desktop (Recommended - HTTP Streamable)

1. Add to your Claude Desktop config (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "skills-whm-pro": {
      "type": "streamable-http",
      "url": "http://mcp.servidor.one:3200/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

2. Restart Claude Desktop
3. Start using WHM/cPanel tools!


#### VS Code / Continue.dev

1. Install Continue extension
2. Use template from `templates/vscode-settings.json` or `templates/continue-config.json`
3. Configure endpoint: `http://mcp.servidor.one:3200/mcp`
4. Add `x-api-key` header

#### Other IDEs

Configuration templates available in `/templates`:
- **Cursor**: `cursor-config.json` (HTTP)
- **Windsurf**: `windsurf-config.json` (HTTP)
- **Zed**: `zed-config.json` (HTTP)
- **JetBrains**: `jetbrains-config.xml`

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
curl http://mcp.servidor.one:3200/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "skills-mcp-whm-pro",
  "version": "1.5.0",
  "timestamp": "2025-12-10T14:00:00.000Z"
}
```

### Calling MCP Endpoint (HTTP Streamable)

```bash
# List available tools
curl -X POST http://mcp.servidor.one:3200/mcp \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: sk_whm_mcp_prod_a8f3c2e1b4d7f9e2' \
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

## 🛠️ Available Tools (47)

### WHM Account Management (10)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `whm.list_accounts` | List all cPanel accounts | Read-only |
| `whm.create_account` | Create new cPanel account | Write |
| `whm.suspend_account` | Suspend cPanel account | Write |
| `whm.unsuspend_account` | Unsuspend cPanel account | Write |
| `whm.terminate_account` | Permanently delete account | Destructive ⚠️ |
| `whm.get_account_summary` | Get detailed account info | Read-only |
| `whm.server_status` | Server status & uptime | Read-only |
| `whm.service_status` | Service status (httpd, mysql, etc.) | Read-only |
| `whm.restart_service` | Restart WHM service (SafetyGuard) | Write |
| `whm.list_domains` | List domains of an account | Read-only |

### Domain Information (3)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `domain.get_user_data` | User data for a domain | Read-only |
| `domain.get_all_info` | Paginated domain listing (`limit/offset/filter`) | Read-only |
| `domain.get_owner` | Owner (cPanel account) of a domain | Read-only |

### Domain Management & Safety (5)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `domain.create_alias` | Create parked/alias domain (idempotent) | Write |
| `domain.create_subdomain` | Create subdomain with docroot validation | Write |
| `domain.delete` | Delete domain (SafetyGuard required) | Destructive ⚠️ |
| `domain.resolve` | Resolve domain to IP | Read-only |
| `domain.check_authority` | Check if server is authoritative | Read-only |

### Addon Conversion Suite (6)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `domain.addon.list` | List addon domains for user | Read-only |
| `domain.addon.details` | Details of an addon domain | Read-only |
| `domain.addon.conversion_status` | Status of conversion by `conversion_id` | Read-only |
| `domain.addon.start_conversion` | Start conversion (SafetyGuard) | Write ⚠️ |
| `domain.addon.conversion_details` | Full conversion details | Read-only |
| `domain.addon.list_conversions` | List all conversions | Read-only |

### DNSSEC, DS & Maintenance (5)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `domain.get_ds_records` | Fetch DS records (DNSSEC) with timeout/fallback | Read-only |
| `domain.enable_nsec3` | Enable NSEC3 (returns `operation_id`) | Write ⚠️ |
| `domain.disable_nsec3` | Disable NSEC3 (returns `operation_id`) | Write ⚠️ |
| `domain.get_nsec3_status` | Poll async NSEC3 operations | Read-only |
| `domain.update_userdomains` | Update `/etc/userdomains` with lock | Write ⚠️ |

### DNS Extensions (MX & ALIAS) (3)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `dns.list_mx` | List MX records | Read-only |
| `dns.add_mx` | Add MX (idempotent, validates priority) | Write |
| `dns.check_alias_available` | Check ALIAS availability (clear error if unsupported) | Read-only |

### DNS Zone Management (8)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `dns.list_zones` | List all DNS zones | Read-only |
| `dns.get_zone` | Get complete zone records | Read-only |
| `dns.check_nested_domains` | Check if zone has many nested subdomains | Read-only |
| `dns.search_record` | Search specific DNS records in zone (token-optimized) | Read-only |
| `dns.add_record` | Add DNS record to zone | Write |
| `dns.edit_record` | Edit existing DNS record (optimistic lock) | Write |
| `dns.delete_record` | Delete DNS record | Destructive ⚠️ |
| `dns.reset_zone` | Reset zone to defaults | Destructive ⚠️ |

### System & Observability

| Tool | Description | Security Level |
|------|-------------|----------------|
| `system.get_load` | Load averages & usage | Read-only |
| `system.restart_service` | Restart allowlisted system service | Write |
| `log.read_last_lines` | Tail log files (allowlist) | Read-only |
| `file.list` | List files in cPanel account | Read-only |
| `file.read` | Read file content | Read-only |
| `file.write` | Write file (auto-backup) | Write |
| `file.delete` | Delete file (SafetyGuard) | Destructive ⚠️ |

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
Available MCP Tools (47 total):

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
"Give me a summary of the account cpuser and list its domains"
"Restart the mysql service safely and confirm status"
```

#### DNS Management
```
"Add an A record for www.example.com pointing to 192.0.2.1"
"Add MX record for example.com pointing to mail.example.com with priority 10"
"Show all DNS records for example.com"
"Add SPF record for example.com"
"List all domains with pagination limit 50"
"Check if ALIAS www is available on example.com"
"Fetch DS records for example.com and otherdomain.com"
"Enable NSEC3 for example.com and poll status"
"List addon domains for user cpuser and fetch details for one of them"
"Start addon conversion and monitor status until completed"
"List MX records for exemplo.com.br and add a backup MX with priority 20"
"Edit the A record for api.exemplo.com.br to 198.51.100.10 using optimistic lock"
"Reset the DNS zone for lab.exemplo.com.br after taking a backup"
"Delete the CNAME for old.exemplo.com.br with SafetyGuard token"
"Check if skillsit.com.br has nested subdomains structure"
"Search for www record in example.com zone with exact match"
```

#### Monitoring
```
"What is the current server status?"
"Is Apache running?"
"Show me the server load and memory usage"
"Check the last 100 lines of Apache error log"
"Restart httpd and show me the last 50 lines of the error log"
"List PM2 status of the MCP service"
```

#### Troubleshooting
```
"Client's website example.com is not loading - investigate"
"Check email configuration for clientdomain.com"
"Show error logs for httpd service"
"Update /etc/userdomains and then list domains for account alice"
"Resolve cdn.example.com and verify if the server is authoritative"
"Run a safety-guarded delete of temp.example.com then confirm it is gone"
"Enable NSEC3 for example.com and keep polling until completion"
"Start addon conversion for blog.example.com to new user bloguser and monitor status"
"List addon domains for cpuser and get details of blog.cpuser.com"
"Create a subdomain api.example.com under cpuser with document root /home/cpuser/api"
"Check alias availability for www.example.com in zone example.com before creating it"
"Check if client zone has too many nested subdomains causing DNS issues"
"Search for a specific mail record in zone without loading all records"

### Curl Examples by Tool (quick copy/paste)

> Ajuste `MCP_HOST`, `MCP_API_KEY`, `MCP_SAFETY_TOKEN`, `MCP_ACL_TOKEN`, domínios e usuários antes de usar.

#### WHM Account & Server
- `whm.list_accounts`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"whm.list_accounts","arguments":{}},"id":1}'
```
- `whm.create_account`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"whm.create_account","arguments":{"username":"newcp","domain":"newcp.com.br","password":"S3nh@F0rte","email":"ops@exemplo.com","package":"default","reason":"Onboarding cliente"}},"id":2}'
```
- `whm.server_status` / `whm.service_status`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"whm.service_status","arguments":{}},"id":3}'
```

#### Domain Info (RF01-RF03, RNF07)
- `domain.get_user_data`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.get_user_data","arguments":{"domain":"exemplo.com.br"}},"id":10}'
```
- `domain.get_all_info` (paginação):
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.get_all_info","arguments":{"limit":50,"offset":0,"filter":"addon"}},"id":11}'
```
- `domain.get_owner`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.get_owner","arguments":{"domain":"exemplo.com.br"}},"id":12}'
```

#### Domain Management & Safety (RF10-RF13, RF21)
- `domain.create_alias` (idempotente):
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.create_alias","arguments":{"domain":"aliaslab.com.br","username":"cpuser"}},"id":20}'
```
- `domain.create_subdomain` com docroot validado:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.create_subdomain","arguments":{"subdomain":"api","domain":"exemplo.com.br","username":"cpuser","document_root":"/home/cpuser/api"}},"id":21}'
```
- `domain.delete` (SafetyGuard via header):
```bash
curl -s -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" -H "X-MCP-Safety-Token: $MCP_SAFETY_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.delete","arguments":{"domain":"temp.exemplo.com.br","username":"cpuser","type":"subdomain","reason":"Remocao de teste automatizada"}},"id":22}'
```
- `domain.resolve`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.resolve","arguments":{"domain":"exemplo.com.br"}},"id":23}'
``}
```
- `domain.update_userdomains` (lock + SafetyGuard):
```bash
curl -s -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" -H "X-MCP-Safety-Token: $MCP_SAFETY_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.update_userdomains","arguments":{"reason":"Sincronizacao pos-manutencao"}},"id":24}'
```

#### Addon Conversion Suite (RF04-RF09)
- `domain.addon.list`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.addon.list","arguments":{"username":"cpuser"}},"id":30}'
```
- `domain.addon.details`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.addon.details","arguments":{"domain":"addon.exemplo.com.br","username":"cpuser"}},"id":31}'
```
- `domain.addon.start_conversion` (SafetyGuard):
```bash
curl -s -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" -H "X-MCP-Safety-Token: $MCP_SAFETY_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.addon.start_conversion","arguments":{"domain":"addon.exemplo.com.br","username":"cpuser","new_username":"novocp","reason":"Conversao de teste automatizada"}},"id":32}'
```
- `domain.addon.conversion_status` / `domain.addon.conversion_details` / `domain.addon.list_conversions`: use o `conversion_id` retornado.

#### DNS Authority & MX (RF14-RF16)
- `domain.check_authority`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.check_authority","arguments":{"domain":"exemplo.com.br"}},"id":40}'
```
- `dns.list_mx` e `dns.add_mx` (idempotente):
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"dns.add_mx","arguments":{"domain":"exemplo.com.br","exchange":"mail.exemplo.com.br","priority":10}},"id":41}'
```
Repetir para ver `idempotent=true` na segunda chamada.

#### DNSSEC, DS & ALIAS (RF17-RF18)
- `domain.get_ds_records`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.get_ds_records","arguments":{"domains":["exemplo.com.br"]}},"id":50}'
```
- `dns.check_alias_available`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"dns.check_alias_available","arguments":{"zone":"exemplo.com.br","name":"cdn"}},"id":51}'
```

#### NSEC3 Assíncrono (RF19-RF20-RF22)
- `domain.enable_nsec3` (SafetyGuard):
```bash
curl -s -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" -H "X-MCP-Safety-Token: $MCP_SAFETY_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.enable_nsec3","arguments":{"domains":["exemplo.com.br"],"reason":"Habilitar NSEC3 para teste"}},"id":60}'
```
Use o `operation_id` retornado em:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.get_nsec3_status","arguments":{"operation_id":"<OP_ID>"}},"id":61}'
```
`domain.disable_nsec3` segue o mesmo fluxo.

#### DNS Zone / File / Log / System
- `dns.list_zones`, `dns.get_zone`, `dns.add_record`, `dns.edit_record` (optimistic lock), `dns.delete_record`, `dns.reset_zone`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"dns.get_zone","arguments":{"zone":"exemplo.com.br"}},"id":70}'
```
- `dns.check_nested_domains`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"dns.check_nested_domains","arguments":{"zone":"skillsit.com.br"}},"id":71}'
```
- `dns.search_record` (exact match):
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"dns.search_record","arguments":{"zone":"exemplo.com.br","name":"www","type":["A","AAAA"],"matchMode":"exact"}},"id":72}'
```
- `file.list/read/write/delete`, `log.read_last_lines`, `system.get_load`, `system.restart_service`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"system.get_load","arguments":{}},"id":80}'
```

### Composed Flows (multi-step)

1) **Conversão de addon com verificação e auditoria**
   - Listar addons do usuário → obter domínio → `domain.addon.details`
   - Iniciar conversão: `domain.addon.start_conversion` (SafetyGuard)
   - Polling: `domain.addon.conversion_status` até `completed`
   - Conferir detalhes finais: `domain.addon.conversion_details`

2) **DNSSEC/NSEC3 seguro e observável**
   - Checar autoridade local: `domain.check_authority`
   - Buscar DS (fallback claro se DNSSEC não existir): `domain.get_ds_records`
   - Habilitar NSEC3 (SafetyGuard): `domain.enable_nsec3`
   - Polling: `domain.get_nsec3_status` até `completed`

3) **Manutenção /etc/userdomains sem race condition**
   - Rodar `domain.update_userdomains` com SafetyGuard
   - Em seguida, `whm.list_domains` para o usuário afetado e `domain.get_all_info` paginado para validar atualização

4) **MX idempotente + resolução**
   - `dns.add_mx` duas vezes → segunda retorna `idempotent=true`
   - `domain.resolve` para confirmar apontamento principal

5) **Criação segura de subdomínio**
   - `domain.create_subdomain` com `document_root` validado (RS03)
   - `file.list` no docroot e `domain.resolve` para validar propagação

6) **Auditabilidade e segurança**
   - Usar cabeçalhos: `X-MCP-ACL-Token` (ex.: `root:admin`) + `X-MCP-Safety-Token`
   - Confirmar em logs que tokens aparecem como `[REDACTED]`
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
- 327% more tools (47 vs 11)
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
- 🇧🇷 **Made In Brazil**

---

<div align="center">

**Made with ❤️ by Skills IT - Soluções em TI - BRAZIL**

*We are an MSP empowering other MSPs with intelligent automation.*

[⬆ Back to Top](#skills-mcp-whm-pro)

</div>
