# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [1.0.0] - 2025-12-07

### Adicionado

#### Gerenciamento de Contas WHM
- **whm.list_accounts** - Listar todas as contas cPanel com filtros por domínio ou usuário
- **whm.create_account** - Criar nova conta cPanel com validação de parâmetros
- **whm.get_account_summary** - Obter informações detalhadas de uma conta
- **whm.suspend_account** - Suspender conta com auditoria de razão
- **whm.unsuspend_account** - Reativar conta suspensa
- **whm.delete_account** - Deletar conta (requer confirmationToken)
- **whm.change_package** - Alterar pacote de hospedagem de uma conta
- **whm.modify_account** - Modificar configurações de conta (quota, etc.)

#### Gerenciamento de DNS
- **dns.list_zones** - Listar todas as zonas DNS do servidor
- **dns.get_zone** - Obter registros DNS completos de uma zona
- **dns.add_record** - Adicionar registro DNS (A, AAAA, CNAME, MX, TXT, SRV, CAA)
- **dns.delete_record** - Deletar registro DNS com validação
- **dns.update_record** - Atualizar registro DNS existente
- **dns.validate_zone** - Validar sintaxe de zona DNS
- **dns.optimistic_lock** - Sistema de bloqueio otimista para prevenir race conditions

#### Monitoramento e Sistema
- **whm.server_status** - Status geral do servidor (uptime, load, memória, disco)
- **whm.service_status** - Status de serviços específicos (httpd, mysql, exim)
- **system.get_load** - Métricas detalhadas de carga e recursos
- **log.read_last_lines** - Ler últimas linhas de logs do sistema

#### Gerenciamento de Arquivos
- **file.list** - Listar arquivos e diretórios de uma conta
- **file.read** - Ler conteúdo de arquivo (com limite de segurança)
- **file.write** - Escrever conteúdo em arquivo
- **file.delete** - Deletar arquivo (requer confirmationToken)

#### Utilitários
- **util.run_command** - Executar comandos shell pré-aprovados (whitelisted)
- **util.restart_service** - Reiniciar serviços do sistema (requer confirmationToken)

### Segurança

#### Safety Guard System
- Confirmação obrigatória para operações destrutivas
- Whitelist de comandos shell permitidos
- Sanitização automática de credenciais em logs
- Validação de path para prevenir directory traversal
- Rate limiting em operações de massa

#### Autenticação e Autorização
- API Key authentication via WHMCS
- Bearer Token support
- Sanitização de logs (auto-redact de senhas e tokens)
- Validação de permissões por operação

### Monitoramento

#### Métricas Prometheus
- **http_requests_total** - Total de requisições HTTP por status e método
- **http_request_duration_seconds** - Duração de requisições HTTP (histograma)
- **mcp_tool_calls_total** - Total de chamadas de tools MCP por nome
- **mcp_tool_errors_total** - Total de erros em tools MCP
- Endpoint de scraping: `GET /metrics`

#### Logging Estruturado
- Winston logger com níveis configuráveis
- Logs rotacionados automaticamente
- Formato JSON para integração com ELK/Grafana
- Sanitização automática de credenciais

### CLI Ferramentas

#### Comandos Disponíveis
- `skills-whm-mcp introspect` - Introspecção de tools MCP (formato JSON)
- `skills-whm-mcp describe-tools` - Descrição detalhada de todos os tools
- Suporte a output JSON e XML

### Configuração

#### Variáveis de Ambiente
- `WHM_API_URL` - URL da API WHM (obrigatório)
- `WHM_API_TOKEN` - Token de autenticação WHM (obrigatório)
- `MCP_PORT` - Porta do servidor MCP (padrão: 3100)
- `LOG_LEVEL` - Nível de logging (debug|info|warn|error)
- `ENABLE_METRICS` - Habilitar métricas Prometheus (true|false)

### Documentação

#### Arquivos de Documentação
- **README.md** - Guia completo de instalação e uso (682 linhas)
- **CONTRIBUTING.md** - Guia para contribuidores
- **CODE_OF_CONDUCT.md** - Código de conduta
- **TESTING.md** - Procedimentos de teste e validação
- **schemas/mcp-tools.json** - Schema completo de todos os tools
- **schemas/examples.json** - 32+ exemplos de uso real
- **schemas/whm-api-reference.json** - Referência de APIs WHM utilizadas

#### Templates de Integração
- **Visual Studio Code** - Configuração MCP para VS Code
- **Windsurf** - Configuração MCP para Windsurf IDE
- **Claude Desktop** - Configuração MCP para Claude Desktop App
- **JetBrains IDEs** - Configuração XML para IntelliJ, PyCharm, etc.
- **Cursor** - Configuração MCP para Cursor AI IDE
- **Zed** - Configuração MCP para Zed Editor
- **Continue.dev** - Configuração MCP para Continue extension

### Testes

#### Cobertura de Testes
- Testes unitários para serviços WHM
- Testes de integração para tools MCP
- Cobertura mínima de 25% (branches, functions, lines, statements)
- CI/CD com Jest e relatórios de cobertura

### Dependências

#### Produção
- **@modelcontextprotocol/sdk** ^0.5.0 - SDK oficial MCP
- **express** ^4.18.0 - Framework HTTP
- **ssh2** ^1.14.0 - Cliente SSH para operações remotas
- **axios** ^1.6.0 - Cliente HTTP para WHM API
- **dotenv** ^16.3.0 - Gerenciamento de variáveis de ambiente
- **winston** ^3.11.0 - Logging estruturado
- **prom-client** ^15.1.0 - Métricas Prometheus
- **zod** ^3.22.0 - Validação de schemas

#### Desenvolvimento
- **jest** ^29.7.0 - Framework de testes
- **supertest** ^6.3.0 - Testes HTTP
- **nodemon** ^3.0.0 - Auto-reload para desenvolvimento

### Infraestrutura

#### Deployment
- Gerenciamento via PM2
- Logs centralizados em `/opt/mcp-servers/_shared/logs/`
- Suporte a múltiplas instâncias
- Health checks via `GET /health`

---

## Links

- [Documentação Completa](https://github.com/DevSkillsIT/skills-mcp-whm-pro#readme)
- [Issues e Bug Reports](https://github.com/DevSkillsIT/skills-mcp-whm-pro/issues)
- [Guia de Contribuição](https://github.com/DevSkillsIT/skills-mcp-whm-pro/blob/main/CONTRIBUTING.md)

---

**Skills IT - Soluções em Tecnologia**
contato@skills-it.com.br
https://skills-it.com.br
