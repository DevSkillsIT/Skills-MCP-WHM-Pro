# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [2.2.1] - 2026-05-21

### Corrigido

- 🐛 **max_records vs pseudo-registros**: o limite de registros era aplicado ANTES do filtro de pseudo-registros de zona (`:RAW`, `$TTL`, etc.), entao um `max_records` baixo podia retornar vazio se os primeiros registros fossem metadados (ex: `max_records=3` numa zona cujas 3 primeiras linhas sao `:RAW`/`:RAW`/`$TTL` retornava 0 resultados). Agora os pseudo-registros sao filtrados na raiz (`parseZoneRecords`), de modo que o limite conta apenas registros DNS reais. Afeta records, search e nested_subdomains (tudo que usa parseZoneRecords).
- Teste unit adicionado garantindo que parseZoneRecords exclui pseudo-registros.

### Testes

- ✅ **763/763 testes** passando
- ✅ Validacao ao vivo: `records` com `max_records=3` agora retorna 3 registros reais (antes: vazio)

---

## [2.2.0] - 2026-05-21

### Adicionado

- 🆕 **Resolucao/validacao de zona em TODAS as operacoes DNS/DNSSEC** (antes so no create):
  - **Escrita**: create_mx, update, delete, reset_zone agora validam/resolvem a zona antes de executar
  - **Leitura**: records, search, mx_records, nested_subdomains, alias_check resolvem/validam a zona (FQDN passado como zona e auto-corrigido para a zona real)
  - **DNSSEC**: get_ds_records, enable_nsec3, disable_nsec3 validam que cada dominio informado e uma zona local; erro orientativo lista zonas disponiveis
- 🆕 **Cache TTL de zonas** (`getAvailableZones`, TTL 5min): operacoes em batch (ex: migracao de DNS) reutilizam uma unica chamada de listagem em vez de N chamadas WHM. `invalidateZoneCache()` exposto para forcar refresh.
- 🆕 **`validateZone()`**: valida que uma zona existe; se receber um FQDN de registro no lugar da zona, infere a zona pelo sufixo. Mensagem de erro lista zonas disponiveis.
- 🆕 10 testes unit adicionais (validateZone + cache de zonas).

### Modificado

- `search_dns_zone_records` (descricao): reforca o modelo de delegacao hierarquica do DNS — a zona e o sufixo de dominio mais especifico, independente da conta cPanel.
- `update`/`delete` validam a zona sem auto-troca (o parametro `line` esta atrelado a zona; expected_content protege concorrencia).

### Testes

- ✅ **762/762 testes** passando (10 novos)
- ✅ Validacao ao vivo: zona inexistente -> erro orientativo; FQDN como zona -> auto-correcao para a zona real

---

## [2.1.0] - 2026-05-21

### Adicionado

- 🆕 **Auto-resolucao de zona DNS** (`src/lib/dns-helpers/zone-resolver.js`): ao criar um registro, a zona correta e detectada automaticamente a partir do FQDN do `name`. Resolve a confusao comum entre tres conceitos distintos do WHM:
  - **username da conta cPanel** (ex: a conta que hospeda varios dominios)
  - **dominio principal da conta**
  - **zona DNS do registro** (cada dominio hospedado tem zona propria e independente)
- 🆕 **Validacao de coerencia zone↔name**: se a zona informada nao corresponde ao sufixo do registro, o MCP corrige para a zona correta e explica o motivo no retorno ("DNS opera por zona, nao por conta cPanel").
- 🆕 **Normalizacao de name**: aceita FQDN (`teste.dominio.com`), FQDN com ponto final (`teste.dominio.com.`) ou nome relativo (`teste`) quando a zona e informada.
- 🆕 15 testes unit para o zone-resolver (matching por sufixo mais longo, apex, relativo, incoerencia, zona inexistente).

### Modificado

- `whm_cpanel_manage_dns_zone_records` (action=create): parametro `zone` agora e **OPCIONAL** — inferido do `name`. Descricoes do schema reescritas para deixar explicito que DNS opera por zona, independente de conta/username.
- Descricao de `expected_content` corrigida: exige a LINHA COMPLETA no formato BIND (`nome. TTL IN TIPO valor`), nao apenas o valor.

### Testes

- ✅ **752/752 testes** passando (15 novos do zone-resolver)
- ✅ Validacao end-to-end ao vivo: criacao com auto-resolucao + confirmacao + remocao

---

## [2.0.0] - 2026-05-19

### ⚠️ BREAKING CHANGES

- **Removidas as tools `whm_cpanel_list_server_prompts` e `whm_cpanel_get_analysis_prompt`**: retornavam apenas templates literais com placeholders X/Y/Z. Substituídas pela nova tool `whm_cpanel_generate_report` que retorna dados reais coletados ao vivo do servidor.
- **Tool count: 16 → 15** (12 core + 3 utility)
- **MCP Prompts nativos**: `prompts/list` e `prompts/get` mantidos funcionais e agora delegam internamente para `reports.js`, retornando dados reais ao invés de templates.

### Adicionado

- 🆕 **Tool `whm_cpanel_generate_report`** — gerador de 15 relatórios com DADOS REAIS:
  - **Gestor (7)**: `whm_account_health_summary`, `whm_resource_usage_trends` (com projeção linear de ETA até 90%), `whm_security_posture`, `whm_ssl_certificate_inventory` (via `whmapi1 fetch_ssl_vhosts`), `whm_backup_coverage` (via `jetbackup5api listBackupJobs`), `whm_dns_zone_health`, `whm_email_deliverability`
  - **Analista (8)**: `whm_account_quick_lookup`, `whm_dns_troubleshooting`, `whm_email_setup_guide`, `whm_ssl_installation_guide`, `whm_website_down_investigation`, `whm_disk_usage_alert` (via SSH `du -sh`), `whm_domain_migration_checklist`, `whm_backup_restore_guide`
- 🆕 **Módulo `src/lib/reports.js`** (~900 linhas) com dispatcher, 15 geradores e helpers (`extractZoneRecords`, `getServiceStatusWithFallback`)
- 🆕 **Wrapper de erros `enrichWHMError`** com 8 padrões mapeados (Account/Zone/User/Domain not-found, Resource busy, Parse Error, etc.) que sugere ação alternativa
- 🆕 **Projeção linear de ETA** em `resource_usage_trends`: taxa média por conta + agregada do servidor + "contas em risco"
- 🆕 **Coluna `Disco Usado/Limite`** em listings com valores humanizados (KB/MB/GB/TB)
- 🆕 **Warning de clamping** quando paginate reduz `limit` > 50

### Corrigido

- 🐛 `formatLogLines` retornava JSON cru envolto em truncate (não extraía `d.lines`)
- 🐛 `formatSystemLoad` mostrava apenas load avg (CPU/Memória/Disco N/A) — agora mapeia payload SSH completo
- 🐛 `formatServerStatus` `Uptime: N/A` — agora coleta via SSH `uptime -p`
- 🐛 `formatAccountDetail` mostrava `Senha N/A` desnecessariamente e formato corrompido de `startdate` (`17 Aug 30 16:52` → `2017-08-30 16:52:00`)
- 🐛 `formatAccountDomains` classificava todos os domínios como `subdomain` — agora usa metadata real (`main_domain`/`sub_domains`/`addon_domains`/`parked_domains`)
- 🐛 `formatDomainsList` classificava tudo como `main` — agora normaliza `domain_type` do `get_domain_info`
- 🐛 `searchType=addons` retornava vazio — agora usa `get_domain_info` filtrado por user+tipo (8 addons detectados em conta-exemplo)
- 🐛 `resolve_ip` retornava template `Dominio: N/A` — novo `formatResolveIp` específico
- 🐛 `list_conversions` e `nested_subdomains` retornavam "Operação realizada com sucesso" sem dados — formatters específicos criados
- 🐛 `whm://server/config` retornava conteúdo de status (load dinâmico) — agora retorna apenas dados estáticos via novo `formatServerConfig`
- 🐛 `searchType=owner` retornava template `data` com campos vazios — novo `formatDomainOwner`
- 🐛 `searchType=authority` retornava formato ambíguo — novo `formatDomainAuthority` com Sim/Não + nameservers
- 🐛 Pseudo-registros `:RAW` / `$TTL` apareciam como registros DNS no listing — filtrados com nota de rodapé
- 🐛 Ordenação inconsistente entre chamadas idênticas — sort determinístico em `formatAccountsList`/`formatDomainsList`
- 🐛 Tamanho de arquivos em bytes raw e modificado em Unix epoch — agora humanizados (KB/MB/GB e ISO UTC)
- 🐛 `alias_check` e `get_ds_records` erros crus — agora retornam mensagens orientativas com endpoint alternativo
- 🐛 `package.json` afirmava "23 tools" — corrigido para "15 tools"

### Segurança

- 🔒 **Anonimização de exemplos didáticos**: substituídos `skillsit.com.br`/`smartskills.com.br`/`grupowink.com`/`skillsitcom` por placeholders neutros (`dominio.com.br`, `outrodominio.com.br`, `nameserver.com.br`, `usuariocpanel`) em descriptions de tools e JSDoc visíveis via `tools/list`
- 🔒 `.gitignore` agora ignora `.local-docs/`, `AUDIT-*.md`, `POSTMORTEM-*.md` (documentos operacionais com dados de infra real)
- 🔒 Auditoria pré-commit confirmou: zero tokens/passwords/API keys hardcoded; `.env` e `*.pem`/`*.ppk`/`*.key` ignorados; IP real e hostname interno fora de qualquer arquivo committado

### Testes

- ✅ **737/737 testes** passando (unit + contract + integration)
- ✅ Contract tests atualizados para refletir tool count 16 → 15

---

## [1.5.1] - 2026-02-09

### Modificado
- **Renomeacao de tools**: Todas as tools WHM renomeadas do formato `whm.xxx` para `whm_cpanel_xxx` seguindo o padrao MCP de nomes com underscore
  - `whm.list_accounts` -> `whm_cpanel_list_accounts`
  - `whm.create_account` -> `whm_cpanel_create_account`
  - `whm.get_account_summary` -> `whm_cpanel_get_account_summary`
  - `whm.suspend_account` -> `whm_cpanel_suspend_account`
  - `whm.unsuspend_account` -> `whm_cpanel_unsuspend_account`
  - `whm.delete_account` -> `whm_cpanel_delete_account`
  - `whm.change_package` -> `whm_cpanel_change_package`
  - `whm.modify_account` -> `whm_cpanel_modify_account`
  - `whm.server_status` -> `whm_cpanel_get_server_status`
  - `whm.service_status` -> `whm_cpanel_get_services_status`
- **CHANGELOG atualizado**: Todas as referencias a nomes antigos de tools substituidas pelo novo formato

---

## [1.5.0] - 2025-12-10

### Adicionado
- 🔌 **HTTP Streamable Protocol** - Suporte completo ao MCP 2024-11-05
- 🛠️ 3 novas tools de domínio: `domain_addon_conversion_status`, `domain_check_authority`, `domain_update_userdomains`
- 📊 **DNS Cache System** - Redução de 25k+ tokens para ~2k em zonas grandes
- 🔍 **Nested Domain Detector** - Detecção automática de subdomínios aninhados
- 📈 **Response Optimizer** - Paginação, compressão e estimativa de tokens
- 🧪 **651 testes** passando (100%) com 58.89% de cobertura

### Modificado
- ✅ Templates atualizados para HTTP Streamable (Claude Desktop, VS Code, Cursor, Windsurf, Zed)
- ✅ Endpoint padrão: `http://mcp.example.com:3200/mcp`
- ✅ Autenticação via header `x-api-key` (mais seguro que env vars)
- ✅ Porta padrão: 3200 (consistente em todos os templates)
- ✅ Total de 48 tools (incremento de 3 tools)

### Corrigido
- 🐛 Timeout em consultas DNS de zonas grandes (dominio.com.br como exemplo)
- 🐛 Memory leaks em suite de testes (setup.js global)
- 🐛 Inconsistência de portas entre templates (3100 vs 3200)

### Documentação
- 📝 README atualizado com 48 tools e HTTP protocol
- 📝 TESTING atualizado com curl examples HTTP
- 📝 Documentação técnica em `/docs` (MELHORIAS-DNS, IMPLEMENTATION, etc)

### Técnico
- 🏗️ Arquitetura DNS modular: `dns-constants/`, `dns-helpers/`
- 🧰 Bibliotecas de suporte: cache, validators, parsers, optimizers
- 🔐 Safety guard com confirmação em operações destrutivas
- 📊 Métricas: 48 tools, 1357 linhas no handler, 4 helpers DNS

---

## [1.4.0] - 2025-12-07

### Adicionado
- **Suite de Domínios (SPEC-NOVAS-FEATURES-WHM-001)**: 22 novas tools `whm_cpanel_*` cobrindo usuário/owner, alias, subdomínio, resolução, autoridade local, MX, DS, ALIAS, conversões de addon e manutenção `/etc/userdomains`.
- **Paginacao obrigatória** em `whm_cpanel_list_all_domains` (`limit/offset/filter`) com metadados `has_more/next_offset`.
- **DNSSEC/NSEC3 assíncrono**: `whm_cpanel_enable_dnssec_nsec3` e `whm_cpanel_disable_dnssec_nsec3` retornam `operation_id`; `whm_cpanel_get_nsec3_operation_status` faz polling com timeout dinâmico `60s + 30s * dom` (máx 600s).
- **Segurança reforçada**: validação de domínio (RS01), validação de `document_root` (RS03), SafetyGuard via header `X-MCP-Safety-Token` (body tem precedência) e ACL propagado (`X-MCP-ACL-Token`/`Authorization`) para root/reseller/user.
- **Idempotência**: `whm_cpanel_create_dns_mx_record` evita duplicatas; `whm_cpanel_create_domain_alias`/`whm_cpanel_create_subdomain` e operações MX retornam flag `idempotent` quando já existem.
- **Lock + transaction log**: `whm_cpanel_update_userdomains_cache` usa `lock-manager` e `transaction-log` para rollback seguro; NSEC3 registra operações assíncronas.
- **Testes**: suites automatizadas para Fase 2/3 (MX idempotente, DS/ALIAS fallback, NSEC3 timeouts) e propagação de ACL token.

### Alterado
- **Timeouts alinhados ao RNF01**: limite absoluto 600s; `withTimeout` aplicado aos endpoints WHM sensíveis (DS/ALIAS) para evitar travamentos.
- **Contagem total de tools** atualizada para **45** (10 whm_cpanel_*, 19 domain_*, 9 dns_*, 4 file/log/system).
- **Documentação**: README/TESTING revisados com novos exemplos de NSEC3, DS/ALIAS, paginacao e cabeçalhos de segurança; changelog anterior corrigido.
- **SafetyGuard**: suporte explícito a header, com redacão de tokens nos logs.

### Corrigido
- **DNSSEC/ALIAS**: chamadas agora retornam erro claro quando o endpoint não existe ou DNSSEC não está habilitado (em vez de timeout silencioso).
- **ACL**: validação agora usa o token da requisição (`X-MCP-ACL-Token`/`Authorization`), impedindo uso involuntário do fallback root.
- **MX duplicado**: `whm_cpanel_create_dns_mx_record` verifica registros existentes antes de criar.

---

## [1.0.0] - 2025-12-07

### Adicionado

#### Gerenciamento de Contas WHM
- **whm_cpanel_list_accounts** - Listar todas as contas cPanel com filtros por domínio ou usuário
- **whm_cpanel_create_account** - Criar nova conta cPanel com validação de parâmetros
- **whm_cpanel_get_account_summary** - Obter informações detalhadas de uma conta
- **whm_cpanel_suspend_account** - Suspender conta com auditoria de razão
- **whm_cpanel_unsuspend_account** - Reativar conta suspensa
- **whm_cpanel_delete_account** - Deletar conta (requer confirmationToken)
- **whm_cpanel_change_package** - Alterar pacote de hospedagem de uma conta
- **whm_cpanel_modify_account** - Modificar configurações de conta (quota, etc.)

#### Gerenciamento de DNS
- **dns.list_zones** - Listar todas as zonas DNS do servidor
- **dns.get_zone** - Obter registros DNS completos de uma zona
- **dns.add_record** - Adicionar registro DNS (A, AAAA, CNAME, MX, TXT, SRV, CAA)
- **dns.delete_record** - Deletar registro DNS com validação
- **dns.update_record** - Atualizar registro DNS existente
- **dns.validate_zone** - Validar sintaxe de zona DNS
- **dns.optimistic_lock** - Sistema de bloqueio otimista para prevenir race conditions

#### Monitoramento e Sistema
- **whm_cpanel_get_server_status** - Status geral do servidor (uptime, load, memória, disco)
- **whm_cpanel_get_services_status** - Status de serviços específicos (httpd, mysql, exim)
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
contato@skillsit.com.br  
https://www.skillsit.com.br
