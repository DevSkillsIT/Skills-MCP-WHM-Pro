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
- **Paginacao obrigatoria** em `whm_cpanel_list_all_domains` (`limit/offset/filter`) com metadados `has_more/next_offset`
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

---

> 💼 **Need Help with WHM/cPanel or AI?**
>
> **Skills IT - Technology Solutions** specializes in IT infrastructure and has deep expertise in **WHM and cPanel**. Our team has expertise in **Artificial Intelligence** and **Model Context Protocol (MCP)**, offering complete solutions for automation and system integration.
>
> **Our Services:**
> - ✅ WHM/cPanel consulting and implementation
> - ✅ Custom MCP development for your infrastructure
> - ✅ AI integration with corporate systems
> - ✅ Hosting and DNS management automation
> - ✅ Specialized training and support
>
> 📞 **WhatsApp/Phone:** +55 63 3224-4925 - Brazil 🇧🇷
> 🌐 **Website:** [skillsit.com.br](https://skillsit.com.br)
> 📧 **Email:** contato@skillsit.com.br
>
> *"Transforming infrastructure into intelligence"*

---

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
      "name": "whm_cpanel_list_accounts",
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
| `whm_cpanel_list_accounts` | List all cPanel accounts | Read-only |
| `whm_cpanel_create_account` | Create new cPanel account | Write |
| `whm_cpanel_suspend_account` | Suspend cPanel account | Write |
| `whm_cpanel_unsuspend_account` | Unsuspend cPanel account | Write |
| `whm_cpanel_delete_account` | Permanently delete account | Destructive ⚠️ |
| `whm_cpanel_get_account_summary` | Get detailed account info | Read-only |
| `whm_cpanel_get_server_status` | Server status & uptime | Read-only |
| `whm_cpanel_get_services_status` | Service status (httpd, mysql, etc.) | Read-only |
| `whm_cpanel_restart_service` | Restart WHM service (SafetyGuard) | Write |
| `whm_cpanel_list_account_domains` | List domains of an account | Read-only |

### Domain Information (3)

| Tool | Description | Security Level |
|------|-------------|----------------|
| `domain.get_user_data` | User data for a domain | Read-only |
| `whm_cpanel_list_all_domains` | Paginated domain listing (`limit/offset/filter`) | Read-only |
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

 1. whm_cpanel_list_accounts      - List all cPanel accounts on the WHM server...
 2. whm_cpanel_create_account     - Create a new cPanel account with specified...
 3. whm_cpanel_suspend_account    - Suspend a cPanel account and prevent access...
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
- `whm_cpanel_list_accounts`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"whm_cpanel_list_accounts","arguments":{}},"id":1}'
```
- `whm_cpanel_create_account`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"whm_cpanel_create_account","arguments":{"username":"newcp","domain":"newcp.com.br","password":"S3nh@F0rte","email":"ops@exemplo.com","package":"default","reason":"Onboarding cliente"}},"id":2}'
```
- `whm_cpanel_get_server_status` / `whm_cpanel_get_services_status`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"whm_cpanel_get_services_status","arguments":{}},"id":3}'
```

#### Domain Info (RF01-RF03, RNF07)
- `domain.get_user_data`:
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.get_user_data","arguments":{"domain":"exemplo.com.br"}},"id":10}'
```
- `whm_cpanel_list_all_domains` (paginação):
```bash
curl -s -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"whm_cpanel_list_all_domains","arguments":{"limit":50,"offset":0,"filter":"addon"}},"id":11}'
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
   - Em seguida, `whm_cpanel_list_account_domains` para o usuário afetado e `whm_cpanel_list_all_domains` paginado para validar atualização

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
  "name": "whm_cpanel_delete_account",
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

## 🤖 Prompts MCP - Automação Inteligente para WHM/cPanel

O MCP WHM Pro inclui **15 prompts profissionais** que automatizam operações complexas e repetitivas, especialmente desenvolvidos para MSPs (Managed Service Providers). Os prompts orquestram múltiplas ferramentas em workflows multi-passo, com formato compacto para WhatsApp/Teams.

### Visão Geral dos Prompts

| Categoria | Prompts | Foco |
|-----------|---------|------|
| **Gestores** | 7 prompts | Auditoria, planejamento, compliance, segurança |
| **Analistas** | 8 prompts | Suporte, troubleshooting, configuração, migração |
| **Total** | 15 prompts | Cobertura completa WHM/cPanel operations |

### Categorias de Prompts

**Para Gestores (7):**
1. `whm_account_health_summary` - Resumo executivo de saúde das contas
2. `whm_resource_usage_trends` - Tendências de uso com alertas de capacidade
3. `whm_security_posture` - Postura de segurança com vulnerabilidades
4. `whm_ssl_certificate_inventory` - Inventário SSL com alertas de expiração
5. `whm_backup_coverage` - Cobertura de backups e contas em risco
6. `whm_dns_zone_health` - Saúde de zonas DNS com propagação
7. `whm_email_deliverability` - Análise SPF/DKIM/DMARC e blacklists

**Para Analistas (8):**
8. `whm_account_quick_lookup` - Busca rápida de conta
9. `whm_dns_troubleshooting` - Troubleshoot DNS completo
10. `whm_email_setup_guide` - Guia de configuração de email
11. `whm_ssl_installation_guide` - Guia de instalação SSL
12. `whm_website_down_investigation` - Investigação de site fora
13. `whm_disk_usage_alert` - Alerta de uso de disco
14. `whm_domain_migration_checklist` - Checklist de migração
15. `whm_backup_restore_guide` - Guia de restauração de backup

---

## 📊 PROMPTS PARA GESTORES (7)

### 1. `whm_account_health_summary` - Resumo Executivo de Saúde das Contas

**Descrição:** Gera resumo executivo completo com status de todas as contas cPanel, alertas críticos, uso de recursos, problemas identificados e ações recomendadas.

**Quando Usar:**
- Reuniões executivas semanais/mensais com diretoria
- Relatórios de status do servidor para clientes
- Identificação proativa de problemas antes que afetem clientes
- Planejamento de capacidade e upgrades de infraestrutura

**Argumentos:**
- `filter_suspended` (opcional, boolean): Filtrar apenas contas suspensas. Default: false

**O Que Este Prompt Faz:**
1. Consulta API WHM para listar todas as contas cPanel e seus status
2. Calcula estatísticas agregadas (total ativas, suspensas, com problemas)
3. Identifica alertas críticos (quota disco excedida, CPU excessiva, emails blacklist)
4. Analisa uso médio de recursos (disco, banda, CPU/RAM)
5. Detecta problemas (sites fora, SSL expirado, backups atrasados)
6. Compila ações recomendadas (suspensões necessárias, upgrades, limpeza)
7. Formata output executivo compacto para WhatsApp/Teams

**Exemplo de Uso:**
```
WHM, use o prompt account_health_summary para visão global do servidor
WHM, mostre apenas contas suspensas usando account_health_summary
```

**Output Esperado (formato compact):**
```
📊 *Resumo Executivo - Saúde das Contas*

✅ **Status de Contas:**
- Total de contas ativas: 127
- Contas suspensas: 3
- Contas com problemas: 8

⚠️ **Alertas Críticos:**
- Contas excedendo quota: 5
- Uso excessivo de CPU: 2
- Emails em blacklist: 1

📈 **Uso de Recursos:**
- Uso médio de disco: 12.5 GB
- Uso médio de banda: 48 GB/mês
- TOP 10 consumidores identificados

🚨 **Problemas Identificados:**
- Sites fora do ar: 2
- SSL expirados/expirando: 7
- Backups atrasados: 4

🎯 **Ações Recomendadas:**
- Suspender 1 conta (violação TOS)
- Recomendar upgrade para 3 clientes
- Limpar 8 GB de arquivos temp
```

---

### 2. `whm_resource_usage_trends` - Tendências de Uso de Recursos

**Descrição:** Analisa tendências de uso de disco, banda e CPU/RAM com projeções de esgotamento e alertas de capacidade para planejamento de infraestrutura.

**Quando Usar:**
- Planejamento trimestral de capacidade de servidores
- Identificação de contas com crescimento acelerado
- Projeção de investimentos em hardware/storage
- Relatórios executivos de utilização de infraestrutura

**Argumentos:**
- `period_days` (opcional, number): Período em dias para análise. Default: 7

**O Que Este Prompt Faz:**
1. Consulta API WHM para dados históricos de uso de recursos
2. Calcula uso atual total (disco, banda, CPU/RAM) e percentuais
3. Analisa crescimento no período especificado (+X GB disco, +Y GB banda)
4. Identifica tendências (crescimento, estabilidade, diminuição)
5. Projeta esgotamento de capacidade (previsão em dias)
6. Compila TOP 5 contas consumidoras e processos problemáticos
7. Gera recomendações de planejamento (expansão storage, migração contas)

**Exemplo de Uso:**
```
WHM, analise tendências de uso dos últimos 30 dias
WHM, mostre crescimento de recursos da última semana
```

**Output Esperado (formato compact):**
```
📈 *Tendências de Uso (7 dias)*

💾 **Disco:**
- Uso atual: 850 GB / 1000 GB (85%)
- Crescimento: +120 GB
- Previsão esgotamento: 42 dias

🌐 **Banda:**
- Transferência total: 2.4 TB
- Média diária: 350 GB/dia
- TOP 5 consumidores identificados

⚙️ **CPU/RAM:**
- Uso médio CPU: 45%
- Picos: 82% (horário comercial)
- Processos problemáticos: 3

📊 **Tendências:**
- Crescimento disco: +15% vs. período anterior
- Banda: Tendência estável
- Contas com crescimento acelerado: 4

⚠️ **Alertas de Capacidade:**
- Servidor atingirá 80% disco em: 28 dias
- 6 contas para upgrade de quota
- Necessidade: +200 GB storage adicional

🎯 **Planejamento:**
- Capacidade adicional: 500 GB recomendado
- Candidatos para migração: 2 contas
- Investimento: R$ 2.500
```

---

### 3. `whm_security_posture` - Postura de Segurança

**Descrição:** Avaliação completa de segurança do servidor incluindo SSL/TLS, firewall, updates/patches, vulnerabilidades identificadas e compliance (2FA, políticas senha, backups criptografados).

**Quando Usar:**
- Auditorias de segurança mensais/trimestrais
- Compliance checks (ISO 27001, SOC2, PCI-DSS)
- Identificação de vulnerabilidades antes de ataques
- Demonstração de postura de segurança para clientes

**Argumentos:**
- `check_type` (opcional, string): Tipo de verificação - "ssl", "firewall", "updates", "all". Default: "all"

**O Que Este Prompt Faz:**
1. Consulta API WHM para dados de SSL (certificados expirados, expirando, domínios sem SSL)
2. Verifica status firewall (CSF/ConfigServer) incluindo regras, IPs bloqueados, tentativas invasão
3. Analisa updates disponíveis (cPanel/WHM, packages desatualizados)
4. Identifica vulnerabilidades por criticidade (Críticas, Altas, Médias)
5. Avalia compliance (2FA, políticas senha, backups criptografados, logs auditoria)
6. Compila ações corretivas priorizadas por urgência
7. Gera security scorecard executivo compacto

**Exemplo de Uso:**
```
WHM, avalie postura de segurança completa do servidor
WHM, verifique apenas SSL e certificados
WHM, analise firewall e tentativas de invasão
```

**Output Esperado (formato compact):**
```
🔒 *Postura de Segurança - ALL*

🔐 **SSL/TLS:**
- Certificados expirados: 2
- Expirando (<30 dias): 5
- Domínios sem SSL: 12
- Ciphers seguros: ✅ Sim

🛡️ **Firewall (CSF):**
- Status: ✅ Ativo
- Regras configuradas: 47
- IPs bloqueados: 183
- Tentativas invasão (24h): 24

🔄 **Updates:**
- cPanel/WHM atualizado: ❌ Não
- Versão atual: 110.0.18
- Updates disponíveis: 1 major
- Packages desatualizados: 8

🚨 **Vulnerabilidades:**
- Críticas: 2 ⚠️ CORRIGIR URGENTE
- Altas: 4 (Atenção necessária)
- Médias: 7

📋 **Compliance:**
- Two-Factor Auth: ❌ Não habilitado
- Políticas senha fortes: ✅ Sim
- Backups criptografados: ✅ Sim
- Logs auditoria ativos: ✅ Sim

🎯 **Ações Corretivas:**
1. Instalar SSL: 12 domínios
2. Atualizar cPanel: versão 110.0.20
3. Habilitar 2FA para root/resellers
```

---

### 4. `whm_ssl_certificate_inventory` - Inventário de Certificados SSL

**Descrição:** Inventário completo de certificados SSL com alertas de expiração, status de auto-renovação (AutoSSL) e análise por tipo (Let's Encrypt, Wildcard, EV).

**Quando Usar:**
- Prevenção de expiração de certificados
- Auditoria de SSL antes de renovações automáticas falharem
- Planejamento de migração para Let's Encrypt (economia)
- Demonstração de compliance SSL/TLS para clientes

**Argumentos:**
- `expiring_days` (opcional, number): Alertar certificados expirando em X dias. Default: 30

**O Que Este Prompt Faz:**
1. Consulta API WHM para listar todos os certificados SSL instalados
2. Calcula dias para expiração de cada certificado
3. Identifica certificados expirados (impacto crítico)
4. Lista certificados expirando no período especificado (alertas)
5. Verifica status AutoSSL (habilitado, domínios com/sem auto-renovação)
6. Agrupa por tipo (Let's Encrypt, comerciais, Wildcard, EV)
7. Compila ações necessárias priorizadas por urgência

**Exemplo de Uso:**
```
WHM, mostre todos os certificados SSL expirando em 15 dias
WHM, inventário completo de SSL incluindo expirados
WHM, quais domínios não têm AutoSSL habilitado?
```

**Output Esperado (formato compact):**
```
🔐 *Inventário de Certificados SSL*
**Alerta:** Expirando em 30 dias

✅ **Certificados Válidos:**
- Total domínios com SSL: 94
- Let's Encrypt: 78
- Comerciais: 16

⚠️ **Alertas de Expiração:**
- Expirando em 30 dias: 8 domínios
- Lista crítica:
  1. example.com - 12 dias
  2. shop.cliente.com - 18 dias
  3. api.exemplo.com.br - 24 dias

🚨 **Certificados Expirados:**
- Total expirado: 3
- Impacto: Avisos de segurança
- ⚠️ AÇÃO URGENTE NECESSÁRIA

🔄 **Auto-Renovação:**
- AutoSSL habilitado: ✅ Sim
- Domínios com auto-renovação: 78
- Domínios SEM auto-renovação: 16

📊 **Por Tipo:**
- Let's Encrypt (gratuito): 78
- Wildcard: 4
- EV (Extended Validation): 2

🎯 **Ações Necessárias:**
- Renovar manualmente: 3 (expirados)
- Habilitar AutoSSL: 16 domínios
- Investigar falhas renovação: 2
```

---

### 5. `whm_backup_coverage` - Cobertura de Backups

**Descrição:** Análise de cobertura de backups com identificação de contas sem backup, frequência configurada, espaço utilizado e problemas (falhas, backups desatualizados).

**Quando Usar:**
- Auditoria mensal de proteção de dados
- Identificação de contas em risco (sem backup)
- Planejamento de storage para backups
- Compliance com políticas de retenção de dados (LGPD, GDPR)

**Argumentos:**
- `account_name` (opcional, string): Nome da conta para análise específica. Se omitido, retorna análise global.

**O Que Este Prompt Faz:**
1. Consulta API WHM para configurações de backup de todas as contas
2. Calcula percentual de contas com backup configurado vs. total
3. Identifica contas SEM backup (risco de perda de dados)
4. Analisa frequência configurada (diário, semanal, mensal)
5. Calcula espaço total usado por backups e previsão de crescimento
6. Detecta problemas (backups falhados 24h, desatualizados >7 dias, espaço insuficiente)
7. Compila recomendações (habilitar backup, aumentar frequência, migrar para remoto)

**Exemplo de Uso:**
```
WHM, analise cobertura global de backups
WHM, verifique backup da conta "cliente123"
WHM, quais contas não têm backup configurado?
```

**Output Esperado (formato compact):**
```
💾 *Cobertura de Backups (GLOBAL)*

✅ **Contas com Backup:**
- Total de contas: 127
- Com backup configurado: 104 (82%)
- Último backup: 2025-12-11 03:00

📅 **Frequência:**
- Diário: 92 contas
- Semanal: 8 contas
- Mensal: 4 contas

⚠️ **Contas SEM Backup:**
- Total sem backup: 23
- ⚠️ RISCO DE PERDA DE DADOS
- Lista crítica:
  1. testaccount
  2. demo_site
  3. old_project

💾 **Espaço de Backup:**
- Storage usado: 450 GB
- Localização: /backup (local)
- Retenção: 7 dias

🚨 **Problemas Identificados:**
- Backups falhados (24h): 3
- Desatualizados (>7 dias): 5
- Espaço insuficiente: ❌ Não

📊 **Estatísticas:**
- Tamanho médio/conta: 4.3 GB
- Tempo médio backup: 12 min
- Taxa compressão: 65%

🎯 **Recomendações:**
- Habilitar backup: 23 contas
- Aumentar frequência: 4 contas
- Migrar para storage remoto: Sim
```

---

### 6. `whm_dns_zone_health` - Saúde de Zonas DNS

**Descrição:** Verificação de saúde de zonas DNS incluindo propagação, registros críticos (A, MX, TXT/SPF/DKIM), problemas identificados (MX inválidos, DNSSEC) e ações corretivas.

**Quando Usar:**
- Troubleshooting de problemas de email (MX incorretos)
- Verificação pré-migração de domínios
- Auditoria de configuração DNS após mudanças
- Identificação de registros mal configurados (SPF, DKIM)

**Argumentos:**
- `domain` (opcional, string): Domínio específico para análise. Se omitido, retorna análise global de todas as zonas.

**O Que Este Prompt Faz:**
1. Consulta API WHM para listar todas as zonas DNS ou zona específica
2. Verifica propagação DNS (nameservers corretos, tempo desde última alteração)
3. Valida registros críticos (A, MX, TXT para SPF/DKIM, CNAME)
4. Identifica problemas (MX inválidos, SPF mal configurado, DNSSEC não configurado, TTL muito alto)
5. Verifica propagação em todos os nameservers (quantos/total respondendo)
6. Detecta erros de sintaxe, IPs incorretos, registros duplicados/conflitantes
7. Compila ações corretivas priorizadas para resolução

**Exemplo de Uso:**
```
WHM, verifique saúde DNS de "example.com"
WHM, analise propagação de todas as zonas DNS
WHM, quais domínios têm SPF mal configurado?
```

**Output Esperado (formato compact):**
```
🌐 *Saúde de Zonas DNS: example.com*

✅ **Status de Propagação:**
- Zonas DNS ativas: 1
- Propagação completa: ✅ Sim
- Nameservers corretos: ✅ Sim

📋 **Registros Críticos:**
- Registros A: 8
- Registros MX: 2 (Email)
- Registros TXT (SPF/DKIM): 3
- Registros CNAME: 5

⚠️ **Problemas Identificados:**
- MX inválidos: 0
- SPF mal configurado: 0
- DNSSEC não configurado: ⚠️ Sim
- TTL muito alto (>24h): 2 registros

🔍 **Verificação de Propagação:**
- Propagado em todos NS: ✅ Sim
- Última alteração: 2 horas atrás
- Nameservers respondendo: 2/2

🚨 **Alertas:**
- Zonas com erros sintaxe: 0
- IPs incorretos: 0
- Registros duplicados: 0

🎯 **Ações Corretivas:**
- Configurar DNSSEC: 1 domínio
- Reduzir TTL para migração: 2 registros
- Validar configuração SPF: 0
```

---

### 7. `whm_email_deliverability` - Análise de Entregabilidade de Email

**Descrição:** Análise completa de entregabilidade de email com verificação SPF/DKIM/DMARC, status em blacklists, estatísticas de entrega e melhorias recomendadas.

**Quando Usar:**
- Troubleshooting de emails não recebidos/rejeitados
- Auditoria de configuração de email para novos domínios
- Identificação de domínios/IPs em blacklist
- Demonstração de compliance email para clientes

**Argumentos:**
- `domain` (opcional, string): Domínio para análise. Se omitido, retorna análise global.

**O Que Este Prompt Faz:**
1. Consulta DNS para verificar registros SPF (sintaxe, IPs incluídos)
2. Valida configuração DKIM (habilitado, chave publicada, assinatura)
3. Analisa DMARC (política none/quarantine/reject, RUA configurado)
4. Verifica presença em blacklists (IP servidor, domínio, listas críticas Spamhaus/Barracuda)
5. Coleta estatísticas de entrega (taxa rejeição, quarentena, bounce rate)
6. Identifica problemas (rDNS incorreto, TLS/SSL SMTP, autenticação SMTP, rate limiting)
7. Compila melhorias recomendadas priorizadas para entregabilidade

**Exemplo de Uso:**
```
WHM, analise entregabilidade de email para "example.com"
WHM, verifique se domínios estão em blacklist
WHM, valide configuração SPF/DKIM/DMARC global
```

**Output Esperado (formato compact):**
```
📧 *Entregabilidade de Email: example.com*

🔐 **SPF:**
- Configurado: ✅ Sim
- Sintaxe válida: ✅ Sim
- Inclui todos IPs: ✅ Sim
- Registro: v=spf1 mx a ~all

🔑 **DKIM:**
- Habilitado: ✅ Sim
- Chave publicada DNS: ✅ Sim
- Seletor: default._domainkey
- Assinatura: ✅ OK

🛡️ **DMARC:**
- Configurado: ⚠️ Não
- Política: none
- RUA (relatórios): ❌ Não configurado
- Registro: [AUSENTE]

🚨 **Blacklists:**
- IP servidor: ❌ 0 listas
- Domínio: ❌ 0 listas
- Listas críticas: ✅ OK

📊 **Estatísticas:**
- Taxa rejeição: 2.3%
- Quarentena: 8 emails
- Bounce rate: 1.5%

⚠️ **Problemas:**
- rDNS: ✅ Correto
- TLS/SSL SMTP: ✅ Habilitado
- Autenticação SMTP: ✅ OK
- Rate limiting: ✅ Ativo

🎯 **Melhorias:**
1. Configurar DMARC p=reject
2. Habilitar RUA para relatórios
3. Validar SPF inclui novos IPs
4. Monitorar blacklists (mensal)
```

---

## 🔧 PROMPTS PARA ANALISTAS (8)

### 8. `whm_account_quick_lookup` - Busca Rápida de Conta

**Descrição:** Busca rápida de conta por usuário, domínio ou IP retornando info card compacto com dados essenciais (recursos, domínios, email, status).

**Quando Usar:**
- Atendimento de chamado: cliente reporta problema
- Verificação rápida de informações de conta
- Identificação de conta por domínio ou IP
- Validação antes de executar operações (suspender, terminar)

**Argumentos:**
- `search_term` (obrigatório, string): Usuário, domínio ou IP para buscar

**O Que Este Prompt Faz:**
1. Consulta API WHM para encontrar conta correspondente ao termo de busca
2. Retorna informações de identificação (usuário, domínio principal, email contato)
3. Compila uso de recursos (disco, banda mês atual, inodes)
4. Lista domínios configurados (principal, addon, subdomínios, parked)
5. Conta recursos de email (contas, forwarders, listas)
6. Verifica status (ativa/suspensa, último login, IP dedicado, SSL)
7. Fornece ações rápidas disponíveis (resetar senha, suspender, acessar cPanel)

**Exemplo de Uso:**
```
WHM, busque informações da conta "cliente123"
WHM, quick lookup para domínio "example.com"
WHM, encontre conta do IP "203.0.113.45"
```

**Output Esperado (formato compact):**
```
🔍 *Busca Rápida de Conta*
**Termo:** cliente123

👤 **Conta cPanel:**
- Usuário: cliente123
- Domínio principal: cliente123.com
- Email: admin@cliente123.com

📊 **Uso de Recursos:**
- Disco: 4.2 GB / 10 GB (42%)
- Banda (mês): 18 GB
- Inodes: 28,450 / 250,000

🌐 **Domínios:**
- Principal: cliente123.com
- Addon domains: 2
- Subdomínios: 5
- Parked domains: 1

📧 **Email:**
- Contas de email: 8
- Forwarders: 3
- Listas: 0

⚠️ **Status:**
- Conta: ✅ Ativa
- Último login: 2025-12-10 14:23
- IP dedicado: ❌ Não
- SSL: ✅ Instalado

🎯 **Ações Rápidas:**
- Resetar senha
- Suspender/Reativar conta
- Acessar cPanel como usuário
```

---

### 9. `whm_dns_troubleshooting` - Troubleshoot DNS

**Descrição:** Diagnóstico completo de DNS para um domínio incluindo verificação de nameservers, resolução de IP, registros MX, TXT (SPF/DKIM) e solução passo-a-passo para problemas encontrados.

**Quando Usar:**
- Domínio não resolve (não abre no navegador)
- Emails não recebem/enviam (MX incorreto)
- Após migração de servidor ou mudança de DNS
- Troubleshooting técnico de propagação DNS

**Argumentos:**
- `domain` (obrigatório, string): Domínio para diagnosticar

**O Que Este Prompt Faz:**
1. Executa `dig DOMAIN NS` para verificar nameservers configurados e propagação
2. Executa `dig DOMAIN A` para verificar resolução de IP (IP correto?)
3. Executa `dig DOMAIN MX` para verificar registros MX de email
4. Executa `dig DOMAIN TXT` para verificar SPF/DKIM
5. Identifica problemas encontrados por criticidade (CRÍTICO, AVISO, INFO)
6. Compila solução passo-a-passo executável para resolver cada problema
7. Fornece comandos de validação (dig +trace) para conferência pós-correção

**Exemplo de Uso:**
```
WHM, diagnostique DNS de "example.com"
WHM, troubleshoot DNS: emails não chegam em "cliente.com.br"
WHM, verifique propagação DNS após migração de "shop.example.com"
```

**Output Esperado (formato compact):**
```
🔧 *Troubleshooting DNS*
**Domínio:** example.com

🔍 **1. Nameservers:**
```
dig example.com NS +short
```
- Configurados: ns1.example.com, ns2.example.com
- Propagação: ✅ Completa
- Respondendo: 2/2

🌐 **2. Resolução de IP:**
```
dig example.com A +short
```
- IP resolvido: 203.0.113.45
- IP correto (servidor WHM): ✅ Sim
- TTL: 14400s (4h)

📧 **3. Registros MX:**
```
dig example.com MX +short
```
- MX principal: mail.example.com (prioridade 0)
- Aponta para IP correto: ✅ Sim

📋 **4. Registros TXT (SPF/DKIM):**
```
dig example.com TXT +short
```
- SPF: ✅ Presente
- DKIM: ✅ Configurado

🚨 **Problemas Encontrados:**
1. [CRÍTICO] Registro A aponta para IP incorreto
2. [AVISO] Nameserver ns2 não responde
3. [INFO] TTL muito alto para migração

🎯 **Solução Passo-a-Passo:**
1. Corrigir registro A no DNS Manager
2. Verificar nameserver ns2.example.com
3. Aguardar propagação (até 4 horas)
4. Validar com: `dig example.com +trace`
```

---

### 10. `whm_email_setup_guide` - Guia de Configuração de Email

**Descrição:** Guia passo-a-passo completo para configurar conta de email no cPanel e em clientes (Outlook, Thunderbird, celular) com troubleshooting comum.

**Quando Usar:**
- Onboarding de novo cliente: configurar emails
- Suporte a usuário final: como configurar no celular
- Documentação para repasse ao cliente
- Troubleshooting de problemas de configuração de email

**Argumentos:**
- `email_address` (obrigatório, string): Endereço de email para configurar

**O Que Este Prompt Faz:**
1. Extrai usuário e domínio do email fornecido
2. Gera passo-a-passo para criar conta email no cPanel (quota, senha)
3. Fornece configurações IMAP completas (servidor, porta, segurança)
4. Fornece configurações SMTP completas (servidor, portas 465/587, autenticação)
5. Inclui instruções para Outlook/Thunderbird e celular (Android/iOS)
6. Adiciona checklist de testes (enviar/receber, pastas sincronizadas)
7. Compila troubleshooting comum (erros autenticação, firewall, SPF/DKIM)

**Exemplo de Uso:**
```
WHM, como configurar email "joao@example.com"?
WHM, guia de setup para "suporte@cliente.com.br"
WHM, instruções email no celular para "vendas@shop.example.com"
```

**Output Esperado (formato compact):**
```
📧 *Guia de Configuração de Email*
**Email:** joao@example.com

**PASSO 1: Criar no cPanel**

1. Login cPanel da conta
2. Email > Email Accounts
3. Clicar "Create"
4. Preencher:
   - Email: joao
   - Password: [senha forte]
   - Quota: 250 MB
5. Clicar "Create"

**PASSO 2: Configurações Cliente**

📱 **IMAP (Recomendado):**
- Servidor entrada: mail.example.com
- Porta: 993
- Segurança: SSL/TLS
- Usuário: joao@example.com
- Senha: [a senha criada]

📤 **SMTP (Envio):**
- Servidor saída: mail.example.com
- Porta: 465 (SSL) ou 587 (TLS)
- Segurança: SSL/TLS
- Autenticação: ✅ Sim
- Usuário: joao@example.com
- Senha: [mesma senha]

**PASSO 3: Configuração Manual**

🖥️ **Outlook/Thunderbird:**
- Tipo: IMAP
- Servidor: mail.example.com
- Portas: 993 / 465

📱 **Celular (Android/iOS):**
- Adicionar conta > Outra
- Tipo: IMAP
- Mesmas configurações

**PASSO 4: Testes**

✅ Enviar email teste
✅ Receber email teste
✅ Verificar pastas

🎯 **Troubleshooting:**
- Erro autenticação → Senha
- Não conecta → Firewall (993, 465, 587)
- Emails não chegam → SPF/DKIM
```

---

### 11. `whm_ssl_installation_guide` - Guia de Instalação SSL

**Descrição:** Guia completo de instalação de certificado SSL com dois métodos (AutoSSL gratuito e SSL comercial manual) incluindo pré-requisitos, passos e troubleshooting.

**Quando Usar:**
- Instalação de SSL em novo domínio
- Migração de HTTP para HTTPS
- Resolução de avisos de segurança no navegador
- Documentação de processo SSL para equipe

**Argumentos:**
- `domain` (obrigatório, string): Domínio para instalar SSL

**O Que Este Prompt Faz:**
1. Gera guia completo para instalação via AutoSSL (Let's Encrypt gratuito)
2. Verifica pré-requisitos (domínio resolve IP servidor, porta 80 aberta, AutoSSL habilitado)
3. Fornece passos para instalação automática via WHM
4. Inclui método alternativo manual (SSL comercial): gerar CSR, comprar, instalar
5. Adiciona verificação final (testar HTTPS, SSLLabs, force HTTPS .htaccess)
6. Compila troubleshooting comum (domain validation failed, cache, mixed content)
7. Formata em tutorial técnico executável com comandos

**Exemplo de Uso:**
```
WHM, como instalar SSL em "example.com"?
WHM, guia de SSL comercial para "shop.cliente.com.br"
WHM, configurar AutoSSL para "api.example.com"
```

**Output Esperado (formato compact):**
```
🔐 *Guia de Instalação SSL*
**Domínio:** example.com

**MÉTODO 1: AutoSSL (Gratuito) [RECOMENDADO]**

📋 **Passo-a-Passo:**

1. **Pré-requisitos:**
   - Domínio resolve IP servidor: ✅
   - Porta 80 aberta: ✅
   - AutoSSL habilitado: ✅

2. **Instalação:**
   - WHM > SSL/TLS > Manage AutoSSL
   - Localizar: example.com
   - Clicar "Run AutoSSL"
   - Aguardar (1-2 min)

3. **Verificação:**
   - Acessar: https://example.com
   - Cadeado verde: ✅
   - Válido até: 2026-03-10

**MÉTODO 2: SSL Comercial (Manual)**

📋 **Passo-a-Passo:**

1. **Gerar CSR:**
   - WHM > SSL/TLS > Generate CSR
   - Preencher:
     - Domain: example.com
     - Organization: Nome Empresa
     - Country: BR
   - Copiar CSR

2. **Comprar:**
   - Enviar CSR para CA
   - Aguardar emissão
   - Baixar certificado + bundle

3. **Instalar:**
   - WHM > SSL/TLS > Install SSL
   - Domain: example.com
   - Certificate: [colar]
   - Private Key: [colar]
   - CA Bundle: [colar]
   - "Install"

**VERIFICAÇÃO FINAL:**

✅ Testar: https://example.com
✅ SSLLabs: https://www.ssllabs.com/ssltest/analyze.html?d=example.com
✅ Force HTTPS (.htaccess):
```
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

🎯 **Troubleshooting:**
- Domain validation failed → DNS
- Não aparece → Limpar cache
- Mixed content → URLs http:// → https://
```

---

### 12. `whm_website_down_investigation` - Investigação Site Fora do Ar

**Descrição:** Investigação completa de site fora do ar com diagnóstico de conectividade, DNS, servidor web, arquivos, recursos da conta, banco de dados, logs de erro e solução passo-a-passo.

**Quando Usar:**
- Cliente reporta site fora do ar (urgência alta)
- Erro 500, 503 ou página em branco
- Após migração ou mudanças no servidor
- Troubleshooting técnico de downtime

**Argumentos:**
- `domain` (obrigatório, string): Domínio do site fora do ar

**O Que Este Prompt Faz:**
1. Executa `ping DOMAIN` para verificar conectividade (servidor responde? pacotes perdidos?)
2. Executa `dig DOMAIN A` para verificar resolução DNS (IP correto? propagação OK?)
3. Executa `curl -I DOMAIN` para verificar status servidor web (HTTP code, Apache/Nginx respondendo)
4. Verifica arquivos (DocumentRoot existe? arquivos presentes? permissões 755/644? .htaccess válido?)
5. Analisa recursos da conta (quota disco, conta suspensa, limite processos)
6. Verifica banco de dados (MySQL rodando, conexão OK, erro "establishing database connection")
7. Compila problemas identificados por criticidade e fornece solução passo-a-passo executável

**Exemplo de Uso:**
```
WHM, site "example.com" está fora do ar, investigue
WHM, diagnóstico completo para "shop.cliente.com.br" (erro 500)
WHM, troubleshoot downtime "api.example.com"
```

**Output Esperado (formato compact):**
```
🚨 *Investigação - Site Fora*
**Domínio:** example.com

**DIAGNÓSTICO:**

🔍 **1. Conectividade:**
```
ping example.com
```
- Responde: ✅ Sim
- Pacotes perdidos: 0%
- Latência: 45 ms

🌐 **2. Resolução DNS:**
```
dig example.com A +short
```
- IP: 203.0.113.45
- IP correto: ✅ Sim
- Propagação: ✅ OK

🖥️ **3. Servidor Web:**
```
curl -I http://example.com
```
- HTTP Status: 500 Internal Server Error
- Apache: ❌ Erro interno
- Tempo resposta: 2500 ms

📂 **4. Arquivos:**
- DocumentRoot: /home/cliente123/public_html
- Arquivos: ✅ Presentes
- Permissões: ✅ 755/644
- .htaccess: ⚠️ Erro de sintaxe

💾 **5. Recursos:**
- Quota disco: 42% usado
- Suspensa: ❌ Não
- Processos: ✅ OK

🗄️ **6. Banco de Dados:**
- MySQL: ✅ Rodando
- Conexão: ❌ FALHA
- Erro: "Error establishing database connection"

📋 **7. Logs:**
```
tail -n 50 error_log
```
- Erros recentes: RewriteRule inválida

🚨 **PROBLEMAS:**

1. [CRÍTICO] HTTP 500 - Internal Server Error
   - Causa: .htaccess sintaxe
   - Linha: RewriteRule inválida

2. [AVISO] CPU alto
   - Processo: php-fpm
   - Ação: Scripts pesados

**SOLUÇÃO:**

✅ **Imediata:**
1. Renomear .htaccess → .htaccess.bak
2. Testar: http://example.com
3. Se funcionar, corrigir .htaccess

✅ **Investigação:**
1. Analisar error_log completo
2. Últimas mudanças arquivos
3. PHP error reporting

✅ **Preventiva:**
1. Monitoramento (UptimeRobot)
2. Backup automático
3. Documentar mudanças
```

---

### 13. `whm_disk_usage_alert` - Alerta de Uso de Disco

**Descrição:** Alerta de uso de disco para conta específica com breakdown por tipo (arquivos web, emails, bancos dados, logs), tendência de crescimento, TOP 10 diretórios e ações de limpeza recomendadas.

**Quando Usar:**
- Conta próxima de atingir quota de disco
- Cliente solicita aumento de espaço (validar uso)
- Limpeza proativa antes de problemas (site parar)
- Identificação de consumo anormal (ataque? spam?)

**Argumentos:**
- `account_name` (obrigatório, string): Nome da conta para análise

**O Que Este Prompt Faz:**
1. Consulta API WHM para uso detalhado de disco da conta
2. Calcula breakdown por tipo (arquivos web X%, emails Y%, databases Z%, logs W%, backups locais)
3. Analisa tendência de crescimento (crescimento diário, previsão esgotamento)
4. Identifica TOP 10 diretórios maiores consumidores
5. Analisa uso de email (maior caixa, emails antigos >1 ano)
6. Verifica bancos de dados (maior database, tabelas fragmentadas)
7. Compila ações de limpeza priorizadas (imediata, curto prazo, longo prazo)

**Exemplo de Uso:**
```
WHM, alerta de disco para conta "cliente123"
WHM, analise uso de espaço da conta "exemplo"
WHM, TOP 10 diretórios maiores de "shop_user"
```

**Output Esperado (formato compact):**
```
⚠️ *Alerta de Uso de Disco*
**Conta:** cliente123

💾 **Uso Total:**
- Quota: 20 GB
- Usado: 17.8 GB (89%)
- Disponível: 2.2 GB

📊 **Breakdown:**
- Arquivos web: 8.5 GB (48%)
- Emails: 6.2 GB (35%)
- Databases: 2.4 GB (13%)
- Logs: 0.5 GB (3%)
- Backups locais: 0.2 GB (1%)

📈 **Tendência:**
- Crescimento diário: +180 MB/dia
- Esgotamento: 12 dias
- vs. mês anterior: +22%

🔝 **TOP 10 Diretórios:**
1. /public_html/uploads - 4.2 GB
2. /mail/example.com - 3.8 GB
3. /public_html/wp-content - 2.6 GB
4. /public_html/cache - 1.2 GB
5. /logs - 0.5 GB

📧 **Emails:**
- Caixas: 12 contas
- Maior: vendas@example.com (2.4 GB)
- Emails >1 ano: 1.8 GB

🗄️ **Databases:**
- Total: 5
- Maior: wpcms_prod (1.8 GB)
- Fragmentadas: 2

🎯 **Ações de Limpeza:**

1. **Imediata (liberar 3.5 GB):**
   - Limpar logs: 0.5 GB
   - Remover backups locais: 0.2 GB
   - Esvaziar lixeira emails: 1.2 GB
   - Limpar cache WordPress: 1.6 GB

2. **Curto Prazo (otimizar 2.8 GB):**
   - Comprimir imagens: /uploads/ → 1.5 GB
   - Arquivar emails antigos (>6 meses)
   - Otimizar MySQL: OPTIMIZE TABLE

3. **Longo Prazo:**
   - Política limpeza automática
   - Upgrade plano (uso legítimo)
   - Migrar backups para remoto

🔧 **Comandos Úteis:**
```bash
# Maiores arquivos
du -h /home/cliente123/ | sort -rh | head -20

# Limpar cache (WordPress)
wp cache flush --path=/home/cliente123/public_html

# Otimizar MySQL
mysqlcheck -o wpcms_prod
```
```

---

### 14. `whm_domain_migration_checklist` - Checklist de Migração de Domínio

**Descrição:** Checklist completo passo-a-passo para migração de domínio entre servidores incluindo pré-migração (auditoria, preparação), durante (transferência arquivos, databases, emails, DNS) e pós-migração (testes, monitoramento, limpeza).

**Quando Usar:**
- Migração de cliente para novo servidor
- Consolidação de múltiplos servidores
- Upgrade de infraestrutura (migração para VPS/Cloud)
- Documentação de processo de migração

**Argumentos:**
- `domain_from` (obrigatório, string): Domínio origem
- `domain_to` (obrigatório, string): Domínio destino (novo servidor)

**O Que Este Prompt Faz:**
1. Gera checklist de pré-migração (backup, inventário domínios/emails/databases, configurações especiais)
2. Prepara infraestrutura destino (criar conta cPanel, alocar recursos, configurar PHP/MySQL)
3. Fornece comandos de transferência de arquivos (rsync com progress)
4. Inclui migração de databases (mysqldump, import, atualizar credenciais)
5. Guia migração de emails (criar contas, IMAP sync, testar envio/recebimento)
6. Configura DNS (reduzir TTL 24h antes, atualizar A/MX, SPF/DKIM)
7. Compila testes de validação, monitoramento 48h, rollback plan e limpeza pós-migração

**Exemplo de Uso:**
```
WHM, checklist para migrar "oldserver.com" → "newserver.com"
WHM, guia de migração completo para "cliente.com.br"
WHM, passos de transferência de "shop.example.com" para novo servidor
```

**Output Esperado (formato compact):**
```
📦 *Checklist de Migração*
**Origem:** oldserver.com
**Destino:** newserver.com

**PRÉ-MIGRAÇÃO:**

✅ **1. Auditoria:**
- [ ] Backup completo origem
- [ ] Listar domínios/subdomínios
- [ ] Inventário emails
- [ ] Mapear databases
- [ ] Documentar .htaccess/cron

✅ **2. Destino:**
- [ ] Criar conta cPanel
- [ ] Alocar recursos (disco, RAM)
- [ ] Configurar PHP/MySQL (mesmas versões)
- [ ] Preparar SSL

✅ **3. Comunicação:**
- [ ] Notificar cliente janela
- [ ] Agendar baixo tráfego
- [ ] Rollback plan

**DURANTE A MIGRAÇÃO:**

🔄 **4. Arquivos:**
```bash
rsync -avz --progress usuario@oldserver.com:/home/usuario/ /home/novo_usuario/
```
- [ ] public_html migrado
- [ ] Permissões 755/644
- [ ] Ownership correto

🗄️ **5. Databases:**
```bash
# Exportar
mysqldump -u user -p dbname > dbname.sql

# Importar
mysql -u user -p new_dbname < dbname.sql
```
- [ ] Todos databases exportados/importados
- [ ] Atualizar config.php/wp-config.php

📧 **6. Emails:**
- [ ] Criar todas contas destino
- [ ] Migrar emails (IMAP sync)
- [ ] Testar envio/recebimento

🌐 **7. DNS:**
- [ ] Reduzir TTL 300s - 24h ANTES
- [ ] Atualizar A para IP newserver.com
- [ ] Atualizar MX se necessário
- [ ] Configurar SPF/DKIM novo servidor

**PÓS-MIGRAÇÃO:**

✅ **8. Testes:**
- [ ] Site carrega: https://oldserver.com
- [ ] Formulários funcionam
- [ ] Login admin OK
- [ ] Checkout (se ecommerce)
- [ ] Emails enviam/recebem
- [ ] SSL ativo

📊 **9. Monitoramento (48h):**
- [ ] Verificar logs erro
- [ ] Performance (tempo carregamento)
- [ ] Propagação DNS global
- [ ] Tickets suporte

🔙 **10. Rollback (se necessário):**
- [ ] Reverter DNS para origem
- [ ] Aguardar propagação
- [ ] Investigar problemas

**LIMPEZA (7 dias):**

- [ ] Aumentar TTL 86400s (24h)
- [ ] Remover arquivos temporários
- [ ] Documentar configurações
- [ ] Arquivar backups origem
- [ ] Desativar origem (30 dias)

🎯 **ATENÇÕES ESPECIAIS:**

⚠️ **WordPress:**
- [ ] Atualizar wp-config.php
- [ ] Search-replace URLs (se mudou domínio)
- [ ] Limpar cache
- [ ] Regenerar permalinks

⚠️ **E-commerce:**
- [ ] Testar gateway pagamento
- [ ] Validar integração envio
- [ ] Verificar carrinho/checkout

⚠️ **APIs:**
- [ ] Atualizar webhooks (PayPal, Stripe)
- [ ] Atualizar IPs autorizados
- [ ] Testar integrações críticas
```

---

### 15. `whm_backup_restore_guide` - Guia de Restauração de Backup

**Descrição:** Guia completo de restauração de backup com 3 métodos (via WHM completo, parcial via cPanel, manual via SSH) incluindo validação pós-restore e troubleshooting.

**Quando Usar:**
- Restauração após problema crítico (site hackeado, dados perdidos)
- Rollback após atualização com problemas
- Recuperação de arquivo/database específico
- Documentação de processo de disaster recovery

**Argumentos:**
- `account_name` (obrigatório, string): Nome da conta a restaurar
- `backup_date` (opcional, string): Data do backup formato YYYY-MM-DD. Default: "mais recente"

**O Que Este Prompt Faz:**
1. Gera guia método 1 (via WHM): localizar backup, restaurar conta completa, aguardar processamento, validação
2. Fornece método 2 (via cPanel): restauração parcial de arquivos/pastas específicos ou databases
3. Inclui método 3 (via SSH): localizar arquivo backup, extrair com tar, importar databases manualmente
4. Compila troubleshooting comum (backup not found, disk quota exceeded, database already exists, permission denied)
5. Adiciona checklist de validação pós-restore (site carrega, imagens/CSS, formulários, admin, databases, emails, cron, SSL)
6. Fornece comandos de verificação de integridade (contar arquivos, tamanho total, testar MySQL)
7. Inclui seção de documentação (registrar data/hora, componentes restaurados, problemas, comunicar cliente)

**Exemplo de Uso:**
```
WHM, como restaurar backup da conta "cliente123"?
WHM, restaurar backup de 2025-12-05 para "exemplo"
WHM, guia de restore parcial (apenas database) para "shop_user"
```

**Output Esperado (formato compact):**
```
💾 *Guia de Restauração*
**Conta:** cliente123
**Backup:** mais recente

**MÉTODO 1: Via WHM (Completa)**

📋 **Passo-a-Passo:**

1. **Localizar:**
   - WHM > Backup > Backup Restoration
   - Selecionar data: mais recente
   - Buscar: cliente123
   - Disponível: ✅

2. **Restaurar:**
   - Clicar "Restore" ao lado de cliente123
   - Opções:
     - [ ] Home Directory
     - [ ] MySQL Databases
     - [ ] Email Forwarders
     - [ ] DNS Zones
   - Marcar todas
   - "Restore"

3. **Aguardar:**
   - Tempo: 5-30 min
   - Logs: /usr/local/cpanel/logs/cpbackup/

4. **Validação:**
   - Acessar site
   - Login cPanel
   - Verificar emails
   - Validar databases

**MÉTODO 2: Parcial (cPanel)**

📂 **Via cPanel:**

1. **Backup Manager:**
   - Login cPanel
   - File Manager > Backup Wizard

2. **Restaurar Arquivos:**
   - Restore → Home Directory
   - Escolher: mais recente
   - Selecionar arquivos/pastas
   - "Restore"

3. **Restaurar Database:**
   - Backup Wizard
   - Restore → MySQL Database
   - Selecionar database
   - Upload .sql.gz

**MÉTODO 3: Manual (SSH)**

🖥️ **Linha de Comando:**

1. **Localizar:**
```bash
ls -lh /backup/*/accounts/cliente123*

# Ou customizado:
find /backup* -name "cliente123*" -mtime -30
```

2. **Extrair:**
```bash
cd /home
tar -xzvf /backup/path/cliente123.tar.gz

# Ou script cPanel:
/scripts/restorepkg cliente123
```

3. **Database:**
```bash
# Extrair SQL
tar -xzvf /backup/cliente123.tar.gz cliente123/mysql/database.sql

# Importar:
mysql -u cliente123_user -p cliente123_dbname < database.sql
```

**TROUBLESHOOTING:**

🚨 **Problemas:**

❌ **"Backup not found"**
- Verificar retenção (WHM > Backup Configuration)
- Procurar localizações alternativas
- Contatar suporte

❌ **"Disk quota exceeded"**
- Aumentar quota temporariamente
- Limpar arquivos antigos
- Restaurar parcialmente

❌ **"Database already exists"**
- Renomear database existente (backup)
- Ou dropar: `DROP DATABASE dbname;`
- Recriar e importar

❌ **"Permission denied"**
- Fix ownership: `chown -R cliente123:cliente123 /home/cliente123`
- Fix permissões: `find /home/cliente123/public_html -type d -exec chmod 755 {} \;`

**VALIDAÇÃO PÓS-RESTORE:**

✅ **Checklist:**
- [ ] Site carrega
- [ ] Imagens/CSS carregam
- [ ] Formulários funcionam
- [ ] Login admin OK
- [ ] Databases acessíveis
- [ ] Emails enviando/recebendo
- [ ] Cron jobs ativos
- [ ] SSL funcionando

📊 **Integridade:**
```bash
# Contar arquivos:
find /home/cliente123/public_html -type f | wc -l

# Tamanho total:
du -sh /home/cliente123/

# Testar MySQL:
mysql -u cliente123_user -p -e "SHOW DATABASES;"
```

🎯 **DOCUMENTAÇÃO:**
- Registrar data/hora restauração
- Anotar componentes restaurados
- Documentar problemas
- Comunicar cliente
```

---

## 🤝 Como Usar os Prompts

### Configuração

Os prompts são acessíveis via protocolo MCP nas configurações do seu AI assistant:

**Claude Code:**
```json
{
  "mcpServers": {
    "whm-pro": {
      "type": "streamable-http",
      "url": "http://mcp.servidor.one:3200/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

**Claude Desktop:**
```json
{
  "mcpServers": {
    "whm-pro": {
      "type": "streamable-http",
      "url": "http://mcp.servidor.one:3200/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

**Gemini CLI:**
```json
{
  "mcpServers": {
    "whm-pro": {
      "httpUrl": "http://mcp.servidor.one:3200/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      },
      "timeout": 30000
    }
  }
}
```

### Execução via curl (Para Testes)

```bash
# Listar prompts disponíveis
curl -X POST http://mcp.servidor.one:3200/mcp \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_API_KEY' \
  -d '{
    "jsonrpc": "2.0",
    "method": "prompts/list",
    "id": 1
  }'

# Executar prompt específico (exemplo: account_health_summary)
curl -X POST http://mcp.servidor.one:3200/mcp \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_API_KEY' \
  -d '{
    "jsonrpc": "2.0",
    "method": "prompts/get",
    "params": {
      "name": "whm_account_health_summary",
      "arguments": {
        "filter_suspended": false
      }
    },
    "id": 1
  }'
```

### Casos de Uso Práticos

**1. Gestor: Reunião Executiva Segunda-feira**
```
Claude, use os prompts do WHM para gerar:
1. Resumo de saúde de todas as contas
2. Tendências de uso dos últimos 7 dias
3. Postura de segurança completa
4. Inventário SSL com alertas de expiração
```
**Tempo:** ~15 minutos
**Output:** Dashboard executivo completo
**Benefício:** Visão 360º da infraestrutura em uma reunião

**2. Analista: Plantão Noturno (WhatsApp/Teams)**
```
Claude, status rápido da infraestrutura via WhatsApp
```
**Tempo:** ~2 segundos
**Output:** Formato compacto para mobile
**Benefício:** Monitoramento remoto instantâneo

**3. Analista: Incidente Crítico (Site Fora)**
```
Claude, site "example.com" está fora, investigue e resolva
```
**Tempo:** ~5 minutos
**Output:** Diagnóstico + solução passo-a-passo
**Benefício:** Redução de 70% no MTTR (Mean Time To Resolution)

**4. Gestor: Planejamento Trimestral**
```
Claude, analise tendências de 30 dias e projete capacidade
```
**Tempo:** ~10 minutos
**Output:** Projeções + recomendações de investimento
**Benefício:** Planejamento baseado em dados reais

**5. Analista: Onboarding de Cliente**
```
Claude, checklist completo para novo cliente "newclient.com"
- Configurar emails
- Instalar SSL
- Migração de servidor antigo
```
**Tempo:** ~30 minutos (vs. 2 horas manual)
**Output:** Checklist executável + validação
**Benefício:** Redução de 60% em erros de onboarding

---

## 📈 Estatísticas de Uso

| Métrica | Valor |
|---------|-------|
| **Total de Prompts** | 15 |
| **Prompts Gestor** | 7 |
| **Prompts Analista** | 8 |
| **Tempo Médio Execução** | 3-5 segundos |
| **Redução de MTTR** | 70% (incidentes) |
| **Economia de Tempo** | 60% (onboarding) |
| **Formato Output** | Dual (compact/detailed) |
| **Compatibilidade** | Claude, Gemini, ChatGPT |

### Benefícios Mensuráveis

- **Gestores:** Relatórios executivos automatizados (15 min → 3 min)
- **Analistas:** Troubleshooting guiado (30 min → 5 min)
- **Onboarding:** Checklist padronizado (-60% erros)
- **Incidentes:** Diagnóstico automatizado (-70% MTTR)
- **Planejamento:** Projeções baseadas em dados reais

---

## 📚 Referências Técnicas

| Componente | Tecnologia | Versão | Repositório |
|-----------|------------|--------|-------------|
| **MCP Server** | Node.js Express | 20+ | `/opt/mcp-servers/whm-cpanel` |
| **Transport** | Streamable HTTP | 2024-11-05 | Porta 3200 |
| **Backend API** | WHM JSON API | v11.110 | https://your-whm-server.com:2087 |
| **Implementação** | JavaScript ES6+ | - | `/opt/mcp-servers/whm-cpanel/src/prompts.js` |
| **Autenticação** | x-api-key | - | Header `x-api-key: <token>` |

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
