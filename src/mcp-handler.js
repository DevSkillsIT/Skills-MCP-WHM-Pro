/**
 * MCP Handler - Processa requisicoes JSON-RPC 2.0
 * Implementa AC02: Lista de Tools MCP
 * SPEC-WHM-ENHANCE-001 / F06: Consolidacao 44 para 16 tools (search_x/manage_x pattern)
 * Correções aplicadas:
 * - GAP-IMP-02: Suporte a header X-MCP-Safety-Token
 */

const WHMService = require('./lib/whm-service');
const DNSService = require('./lib/dns-service');
const SSHManager = require('./lib/ssh-manager');
const FileManager = require('./lib/file-manager');
const logger = require('./lib/logger');
const { formatToolResponse } = require('./lib/formatters/response-formatter');
const { WHM_RESOURCES, listResources, readResource } = require('./lib/resources');
const SafetyGuard = require('./lib/safety-guard');
const { measureToolExecution, recordError } = require('./lib/metrics');
const { withOperationTimeout, withTimeout, TimeoutError } = require('./lib/timeout');
const dnsSchema = require('./schemas/dns-tools.json');
const { WHM_PROMPTS, handleWHMPrompt } = require('./prompts');

/**
 * GAP-IMP-02: Extrai token de segurança do body ou header
 * Prioridade: body.confirmationToken > header X-MCP-Safety-Token
 *
 * @param {object} args - Argumentos da tool call
 * @param {object} headers - Headers HTTP da requisição (se disponíveis)
 * @returns {string|undefined} Token de confirmação
 */
function extractSafetyToken(args, headers = {}) {
  // Prioridade: body > header
  if (args?.confirmationToken) {
    return args.confirmationToken;
  }

  // Fallback: header HTTP
  const headerToken = headers?.['x-mcp-safety-token'] || headers?.['X-MCP-Safety-Token'];
  return headerToken;
}

/**
 * Extrai token de ACL (usado pelo validateUserAccess no whm-service)
 * Prioridade: body.aclToken > header X-MCP-ACL-Token/X-ACL-Token > Authorization
 * Token esperado no formato "tipo:identificador" (ex: "root:admin", "reseller:res1", "user:bob")
 */
function extractAclToken(args, headers = {}) {
  if (args?.aclToken) {
    return args.aclToken;
  }

  const headerToken =
    headers?.['x-mcp-acl-token'] ||
    headers?.['X-MCP-ACL-Token'] ||
    headers?.['x-acl-token'] ||
    headers?.['X-ACL-Token'] ||
    headers?.authorization ||
    headers?.Authorization;

  return headerToken;
}

// SPEC-WHM-ENHANCE-001 / F05 - Server Instructions (<2000 chars)
const WHM_INSTRUCTIONS = `MCP WHM/cPanel - Hospedagem, dominios, DNS e servidor. Respostas em Markdown.

CONTAS: search_hosting_accounts (searchType: list/summary/domains) | manage_hosting_accounts (action: create/suspend/unsuspend/delete)
SERVIDOR: search_server_status (type: status/services) | manage_server_service (action: restart_service)
DOMINIOS: search_hosted_domains (searchType: all/data/owner/addons/addon_details/authority) | manage_hosted_domains (action: create_alias/create_subdomain/delete/resolve_ip/get_conversion_status/create_conversion/get_conversion_details/list_conversions/update_cache)
DNS: search_dns_zone_records (searchType: zones/records/search/mx_records/nested_subdomains/alias_check) | manage_dns_zone_records (action: create/update/delete/reset_zone/create_mx) | manage_dnssec_settings (action: get_ds_records/enable_nsec3/disable_nsec3/get_status)
SISTEMA: manage_system_services (action: restart_service/get_load/read_logs) | search_account_files (searchType: list/read) | manage_account_files (action: write/delete)
UTILITARIOS: list_server_resources, read_server_resource (dados estaticos), list_server_prompts, get_analysis_prompt (15 relatorios)

Prefixo: whm_cpanel_. search_ para leitura, manage_ para mutacao. Operacoes destrutivas requerem confirmationToken.

Exemplos:
- whm_cpanel_search_hosting_accounts {searchType:"list"}
- whm_cpanel_manage_dns_zone_records {action:"create", zone:"exemplo.com", type:"A", name:"www", address:"1.2.3.4"}`;

// Mapa de categorias para routing de tools consolidadas
const TOOL_CATEGORIES = {
  'whm_cpanel_search_hosting_accounts': 'whm',
  'whm_cpanel_manage_hosting_accounts': 'whm',
  'whm_cpanel_search_server_status': 'whm',
  'whm_cpanel_manage_server_service': 'whm',
  'whm_cpanel_search_hosted_domains': 'domain',
  'whm_cpanel_manage_hosted_domains': 'domain',
  'whm_cpanel_manage_dnssec_settings': 'domain',
  'whm_cpanel_search_dns_zone_records': 'dns',
  'whm_cpanel_manage_dns_zone_records': 'dns',
  'whm_cpanel_manage_system_services': 'ssh',
  'whm_cpanel_search_account_files': 'file',
  'whm_cpanel_manage_account_files': 'file',
  'whm_cpanel_list_server_resources': 'utility',
  'whm_cpanel_read_server_resource': 'utility',
  'whm_cpanel_list_server_prompts': 'utility',
  'whm_cpanel_get_analysis_prompt': 'utility',
};

/**
 * Constroi definicoes de tools consolidadas para MCP
 * SPEC-WHM-ENHANCE-001 / F06: 16 tools consolidadas com annotations inline
 */
function buildToolDefinitions() {
  return [
    // ==========================================
    // CONTAS - search_accounts / manage_accounts
    // ==========================================
    {
      name: 'whm_cpanel_search_hosting_accounts',
      description: 'Contas de hospedagem, clientes e planos no WHM/cPanel — inventario de contas ativas e suspensas com recursos alocados. Use searchType=list para listar todas as contas, summary para detalhes de uma conta (disco, banda, IP) ou domains para dominios de uma conta cPanel. Retorna tabela Markdown paginada do servidor WHM. Somente leitura.',
      inputSchema: {
        type: 'object',
        properties: {
          searchType: {
            type: 'string',
            enum: ['list', 'summary', 'domains'],
            description: 'list = tabela de todas as contas (username, dominio, disco, status). summary = detalhes completos de 1 conta (requer username). domains = todos os dominios de 1 conta (requer username)'
          },
          username: { type: 'string', description: 'Username cPanel da conta. Obrigatorio para summary e domains. Ex: skillsitcom' },
          limit: { type: 'integer', default: 25, description: 'Registros por pagina (default: 25, max: 50). Usado com searchType=list' },
          offset: { type: 'integer', default: 0, description: 'Pular N registros para paginacao. Usado com searchType=list' }
        },
        required: ['searchType'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    {
      name: 'whm_cpanel_manage_hosting_accounts',
      description: 'Contas de hospedagem e clientes no WHM/cPanel — criar, suspender, reativar ou remover contas cPanel de clientes. Use action=create para nova conta, suspend/unsuspend para bloquear/desbloquear, delete para remover permanente. Acoes destrutivas requerem confirmationToken. Retorna Markdown com status da operacao no WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'suspend', 'unsuspend', 'delete'],
            description: 'create = nova conta (requer domain, password). suspend = suspender (requer reason). unsuspend = reativar. delete = remover permanente (requer confirm=true e confirmationToken)'
          },
          username: { type: 'string', description: 'Username cPanel (obrigatorio, max 16 chars alfanumericos)' },
          domain: { type: 'string', description: 'Dominio principal FQDN. Obrigatorio para create. Ex: empresa.com.br' },
          password: { type: 'string', description: 'Senha da conta (obrigatorio para create, minimo 8 caracteres)' },
          email: { type: 'string', description: 'Email de contato do proprietario. Recomendado para create' },
          package: { type: 'string', description: 'Nome do plano de hospedagem. Opcional para create (default: plano padrao do servidor)' },
          reason: { type: 'string', description: 'Motivo da operacao. Obrigatorio para suspend, recomendado para demais (auditoria)' },
          confirm: { type: 'boolean', description: 'Deve ser true para confirmar delete. Sem isso o delete sera recusado' },
          confirmationToken: { type: 'string', description: 'Token de seguranca para operacoes destrutivas. Injetado automaticamente via header X-MCP-Safety-Token quando disponivel. NAO solicitar ao usuario.' }
        },
        required: ['action', 'username'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    },

    // ==========================================
    // SERVIDOR - search_server / manage_server
    // ==========================================
    {
      name: 'whm_cpanel_search_server_status',
      description: 'Status, saude e monitoramento do servidor WHM/cPanel — carga, uptime, versao e estado de servicos. Use type=status para load average, hostname e versao do WHM. Use type=services para tabela de daemons (Apache, MariaDB/MySQL, DNS, FTP, email) com estado ativo/parado. Retorna Markdown do servidor WHM. Somente leitura.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['status', 'services'],
            description: 'status = versao WHM, hostname e load average. services = tabela de todos os daemons com estado ativo/parado'
          }
        },
        required: ['type'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    {
      name: 'whm_cpanel_manage_server_service',
      description: 'Servicos e daemons do servidor WHM/cPanel — reiniciar servico para aplicar configuracoes ou resolver travamentos. Use action=restart_service com o nome do daemon (httpd, mysql, mariadb, exim, named, dovecot). Causa indisponibilidade temporaria. Requer confirmationToken e motivo. Retorna Markdown com resultado do WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['restart_service'],
            description: 'Acao a executar (apenas restart_service disponivel via API WHM)'
          },
          service: {
            type: 'string',
            enum: ['httpd', 'mysql', 'mariadb', 'named', 'postfix', 'dovecot', 'exim', 'nginx', 'pure-ftpd'],
            description: 'Daemon a reiniciar. httpd=Apache, mysql/mariadb=banco de dados, named=DNS, exim=email, pure-ftpd=FTP'
          },
          confirmationToken: { type: 'string', description: 'Token de seguranca para operacoes destrutivas. Injetado automaticamente via header X-MCP-Safety-Token quando disponivel. NAO solicitar ao usuario.' },
          reason: { type: 'string', description: 'Motivo do restart para auditoria (obrigatorio)' }
        },
        required: ['action', 'service', 'reason'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },

    // ==========================================
    // DOMINIOS - search_domains / manage_domains / manage_dnssec
    // ==========================================
    {
      name: 'whm_cpanel_search_hosted_domains',
      description: 'Dominios, sites e hospedagens no WHM/cPanel — busca paginada de dominios hospedados com filtros por tipo e nome. Use all para listar todos, data para IP e PHP de um dominio, owner para proprietario, addons para addon domains de uma conta, authority para verificar autoridade DNS. Retorna Markdown paginado do servidor WHM. Somente leitura.',
      inputSchema: {
        type: 'object',
        properties: {
          searchType: {
            type: 'string',
            enum: ['all', 'data', 'owner', 'addons', 'addon_details', 'authority'],
            description: 'all = listar todos (paginado). data = IP, PHP, docroot de 1 dominio (requer domain). owner = conta proprietaria (requer domain). addons = addon domains de 1 conta (requer username). addon_details = detalhe de addon (requer domain + username). authority = verificar se servidor e autoritativo DNS (requer domain)'
          },
          domain: { type: 'string', description: 'Nome do dominio FQDN. Obrigatorio para data, owner, addon_details, authority. Ex: skillsit.com.br' },
          username: { type: 'string', description: 'Username cPanel. Obrigatorio para addons e addon_details. Ex: skillsitcom' },
          domain_filter: { type: 'string', description: 'Filtro por nome de dominio (substring, case-insensitive). Usado apenas com searchType=all. Ex: "wink" filtra grupowink.com' },
          limit: { type: 'integer', default: 25, description: 'Registros por pagina (default: 25, max: 50). Usado com searchType=all' },
          offset: { type: 'integer', default: 0, description: 'Pular N registros. Usado com searchType=all' },
          filter: { type: 'string', enum: ['addon', 'alias', 'subdomain', 'main'], description: 'Filtrar por tipo de dominio. Usado com searchType=all. main=dominio principal, addon=dominio adicional, alias=dominio estacionado, subdomain=subdominio' }
        },
        required: ['searchType'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    {
      name: 'whm_cpanel_manage_hosted_domains',
      description: 'Dominios, sites e enderecos web no WHM/cPanel — criar alias (parked domain), subdominio, deletar, resolver IP e gerenciar conversoes addon. Use resolve_ip para consultar apontamento DNS e list_conversions para listar conversoes (somente leitura). Acoes destrutivas requerem confirmationToken. Retorna Markdown do servidor WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create_alias', 'create_subdomain', 'delete', 'resolve_ip', 'get_conversion_status', 'create_conversion', 'get_conversion_details', 'list_conversions', 'update_cache'],
            description: 'create_alias = dominio estacionado (requer domain + username). create_subdomain = subdominio (requer domain + username + subdomain). delete = remover dominio (requer domain + username + type + confirmationToken). resolve_ip = consultar IP (requer domain, somente leitura). list_conversions = listar conversoes (somente leitura). create_conversion = converter addon em conta (requer domain + username + new_username). update_cache = sincronizar cache de dominios'
          },
          domain: { type: 'string', description: 'Dominio FQDN. Obrigatorio para create_alias, create_subdomain, delete, resolve_ip, create_conversion' },
          username: { type: 'string', description: 'Username cPanel proprietario. Obrigatorio para create_alias, create_subdomain, delete, create_conversion' },
          subdomain: { type: 'string', description: 'Prefixo do subdominio SEM o dominio pai. Obrigatorio para create_subdomain. Ex: "blog" para blog.empresa.com.br' },
          target_domain: { type: 'string', description: 'Dominio alvo para alias. Opcional, default: dominio principal da conta' },
          document_root: { type: 'string', description: 'Caminho do document root para subdominio. Opcional, auto-gerado se omitido' },
          type: { type: 'string', enum: ['addon', 'parked', 'subdomain'], description: 'Tipo do dominio a deletar. Obrigatorio para delete. addon=dominio adicional, parked=estacionado, subdomain=subdominio' },
          new_username: { type: 'string', description: 'Novo username cPanel para conversao de addon em conta independente. Obrigatorio para create_conversion' },
          conversion_id: { type: 'string', description: 'ID da conversao retornado por create_conversion. Obrigatorio para get_conversion_status e get_conversion_details' },
          confirmationToken: { type: 'string', description: 'Token de seguranca para operacoes destrutivas. Injetado automaticamente via header X-MCP-Safety-Token quando disponivel. NAO solicitar ao usuario.' },
          reason: { type: 'string', description: 'Motivo da operacao para auditoria' }
        },
        required: ['action'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    },
    {
      name: 'whm_cpanel_manage_dnssec_settings',
      description: 'DNSSEC, chaves DS e NSEC3 no WHM/cPanel — gerenciar seguranca e assinatura de zonas DNS. Use get_ds_records para obter chaves DS para o registrador. Use enable_nsec3/disable_nsec3 para protecao contra zone walking (requerem confirmationToken). Aceita ate 100 dominios. Retorna Markdown do servidor WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get_ds_records', 'enable_nsec3', 'disable_nsec3', 'get_status'],
            description: 'get_ds_records = obter chaves DS (requer domains, somente leitura). enable_nsec3 = ativar protecao (requer domains + confirmationToken). disable_nsec3 = desativar (requer domains + confirmationToken). get_status = consultar operacao (requer operation_id, somente leitura)'
          },
          domains: { type: 'array', items: { type: 'string' }, description: 'Lista de dominios FQDN. Obrigatorio para get_ds_records, enable_nsec3, disable_nsec3. Maximo 100 dominios. Ex: ["skillsit.com.br", "grupowink.com"]' },
          operation_id: { type: 'string', description: 'ID da operacao assincrona retornado por enable_nsec3 ou disable_nsec3. Obrigatorio para get_status' },
          confirmationToken: { type: 'string', description: 'Token de seguranca para operacoes destrutivas. Injetado automaticamente via header X-MCP-Safety-Token quando disponivel. NAO solicitar ao usuario.' },
          reason: { type: 'string', description: 'Motivo da alteracao para auditoria (minimo 10 caracteres). Obrigatorio para enable/disable' }
        },
        required: ['action'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },

    // ==========================================
    // DNS - search_dns / manage_dns
    // ==========================================
    {
      name: 'whm_cpanel_search_dns_zone_records',
      description: 'Zonas DNS, registros e apontamentos no WHM/cPanel — consulta completa de zonas e seus registros (A, AAAA, CNAME, MX, TXT, NS). Use zones para listar zonas, records para registros de uma zona, search para buscar registro especifico, mx_records para MX de um dominio. Retorna tabela Markdown do servidor WHM. Somente leitura.',
      inputSchema: {
        type: 'object',
        properties: {
          searchType: {
            type: 'string',
            enum: ['zones', 'records', 'search', 'mx_records', 'nested_subdomains', 'alias_check'],
            description: 'zones = listar todas as zonas DNS. records = registros de 1 zona (requer zone). search = buscar registro especifico (requer zone + name). mx_records = registros MX (requer domain). nested_subdomains = analise de subdominios aninhados (requer zone). alias_check = verificar disponibilidade de alias (requer zone + name)'
          },
          zone: { type: 'string', description: 'Nome da zona DNS (igual ao dominio). Obrigatorio para records, search, nested_subdomains, alias_check. Ex: skillsit.com.br' },
          domain: { type: 'string', description: 'Nome do dominio para consulta MX. Obrigatorio APENAS para mx_records. Ex: skillsit.com.br' },
          name: { type: 'string', description: 'Nome completo do registro DNS a buscar. Obrigatorio para search e alias_check. Use FQDN com ponto final. Ex: skillsit.com.br. ou mail.skillsit.com.br.' },
          record_type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SOA', 'SRV', 'CAA'], description: 'Filtrar registros por tipo. Usado com searchType=records. Ex: A para registros de IP' },
          name_filter: { type: 'string', description: 'Filtrar registros por nome (substring). Usado com searchType=records. Ex: "mail" filtra mail.dominio.com' },
          max_records: { type: 'integer', default: 25, description: 'Maximo de registros retornados (default: 25, max: 100). Usado com searchType=records' },
          include_stats: { type: 'boolean', default: false, description: 'Incluir estatisticas de subdominios aninhados. Usado com searchType=records' },
          type: {
            type: 'array',
            items: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SOA', 'SRV', 'CAA'] },
            description: 'Tipos de registro a buscar. Usado APENAS com searchType=search. Default: ["A", "AAAA"]. Ex: ["A", "CNAME"] para buscar registros A e CNAME'
          },
          match_mode: {
            type: 'string',
            enum: ['exact', 'contains', 'startsWith'],
            description: 'Modo de correspondencia do nome. Usado APENAS com searchType=search. exact = correspondencia exata, contains = contem substring, startsWith = inicia com'
          }
        },
        required: ['searchType'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    {
      name: 'whm_cpanel_manage_dns_zone_records',
      description: 'Registros DNS e apontamentos no WHM/cPanel — criar, atualizar ou deletar registros em zonas DNS do servidor. Use create para novo registro (A, CNAME, MX, TXT), update/delete com numero de linha obtido via search. reset_zone recria zona inteira. Acoes destrutivas requerem confirmationToken. Retorna Markdown do servidor WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'update', 'delete', 'reset_zone', 'create_mx'],
            description: 'create = novo registro (requer zone + type + name + valor). update = alterar registro existente (requer zone + line). delete = remover registro (requer zone + line + confirmationToken). reset_zone = resetar zona inteira (requer zone + confirmationToken, DESTRUTIVO). create_mx = adicionar MX (requer domain + exchange)'
          },
          zone: { type: 'string', description: 'Nome da zona DNS. Obrigatorio para create, update, delete, reset_zone. Ex: skillsit.com.br' },
          domain: { type: 'string', description: 'Nome do dominio. Obrigatorio APENAS para create_mx. Ex: skillsit.com.br' },
          type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR'], description: 'Tipo do registro DNS. Obrigatorio para create' },
          name: { type: 'string', description: 'Nome FQDN do registro com ponto final. Obrigatorio para create. Ex: mail.skillsit.com.br.' },
          line: { type: 'integer', description: 'Numero da linha do registro na zona. Obrigatorio para update e delete. Obtenha via search_dns_zone_records com searchType=records' },
          expected_content: { type: 'string', description: 'Valor esperado do registro para verificacao de concorrencia. Recomendado para update e delete para prevenir edicao de registro errado' },
          address: { type: 'string', description: 'Endereco IP. Usado para registros tipo A e AAAA. Ex: 192.0.2.1' },
          cname: { type: 'string', description: 'Dominio alvo. Usado para registros tipo CNAME. Ex: outro.dominio.com.' },
          exchange: { type: 'string', description: 'Servidor de email. Usado para registros MX e create_mx. Ex: mail.skillsit.com.br.' },
          preference: { type: 'integer', description: 'Prioridade MX para action=create com type=MX (menor numero = maior prioridade). Ex: 10' },
          priority: { type: 'integer', default: 10, description: 'Prioridade MX para action=create_mx (default: 10). Mesmo conceito que preference' },
          txtdata: { type: 'string', description: 'Conteudo do registro TXT. Usado para tipo TXT. Ex: v=spf1 include:_spf.google.com ~all' },
          nsdname: { type: 'string', description: 'Nome do nameserver. Usado para registros tipo NS. Ex: ns1.smartskills.com.br.' },
          ptrdname: { type: 'string', description: 'Hostname para DNS reverso. Usado para registros tipo PTR. Ex: servidor.empresa.com.br.' },
          ttl: { type: 'integer', default: 14400, description: 'Time To Live em segundos (default: 14400 = 4 horas). Valores comuns: 300 (5min), 3600 (1h), 14400 (4h), 86400 (24h)' },
          always_accept: { type: 'boolean', default: false, description: 'Aceitar email mesmo sem conta local configurada. Usado com create_mx' },
          confirmationToken: { type: 'string', description: 'Token de seguranca para operacoes destrutivas. Injetado automaticamente via header X-MCP-Safety-Token quando disponivel. NAO solicitar ao usuario.' },
          reason: { type: 'string', description: 'Motivo da operacao para auditoria' }
        },
        required: ['action'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    },

    // ==========================================
    // SISTEMA - manage_system
    // ==========================================
    {
      name: 'whm_cpanel_manage_system_services',
      description: 'Sistema, processos e logs do servidor WHM/cPanel via SSH — monitorar carga, ler logs e reiniciar servicos. Use get_load para CPU, RAM e disco em tempo real, read_logs para ultimas linhas de logs do servidor. restart_service reinicia daemon (requer confirmationToken). Retorna Markdown do servidor WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['restart_service', 'get_load', 'read_logs'],
            description: 'get_load = metricas de CPU, RAM e disco em tempo real (somente leitura). read_logs = ultimas linhas de arquivo de log (requer log_file, somente leitura). restart_service = reiniciar daemon (requer service + confirmationToken, DESTRUTIVO)'
          },
          service: {
            type: 'string',
            enum: ['httpd', 'mysql', 'mariadb', 'named', 'postfix', 'dovecot', 'exim', 'nginx', 'pure-ftpd'],
            description: 'Daemon a reiniciar. Obrigatorio para restart_service. httpd=Apache, mysql/mariadb=banco de dados, named=DNS BIND, exim=email MTA, dovecot=IMAP/POP3, pure-ftpd=FTP'
          },
          log_file: { type: 'string', description: 'Caminho absoluto do arquivo de log. Obrigatorio para read_logs. Permitidos: /var/log/messages, /var/log/secure, /usr/local/apache/logs/error_log, /usr/local/cpanel/logs/error_log, entre outros' },
          lines: { type: 'integer', default: 30, description: 'Numero de linhas a ler do final do log (default: 30, max: 100). Usado com read_logs' },
          confirmationToken: { type: 'string', description: 'Token de seguranca para operacoes destrutivas. Injetado automaticamente via header X-MCP-Safety-Token quando disponivel. NAO solicitar ao usuario.' },
          reason: { type: 'string', description: 'Motivo da operacao para auditoria. Obrigatorio para restart_service' }
        },
        required: ['action'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },

    // ==========================================
    // ARQUIVOS - search_files / manage_files
    // ==========================================
    {
      name: 'whm_cpanel_search_account_files',
      description: 'Arquivos, diretorios e conteudo de contas cPanel no WHM — navegacao e leitura do home do usuario. Use searchType=list para explorar pastas e subdiretorios, read para visualizar conteudo de arquivos texto. Restrito a /home/{cpanel_user}/ por seguranca contra path traversal. Retorna Markdown do servidor WHM. Somente leitura.',
      inputSchema: {
        type: 'object',
        properties: {
          searchType: {
            type: 'string',
            enum: ['list', 'read'],
            description: 'list = listar arquivos e subdiretorios (como ls). read = ler conteudo de arquivo texto (como cat)'
          },
          cpanel_user: { type: 'string', description: 'Username cPanel dono dos arquivos (obrigatorio). Ex: skillsitcom' },
          path: { type: 'string', description: 'Caminho RELATIVO ao /home/{cpanel_user}/. Para list: diretorio a explorar (ex: public_html). Para read: arquivo a ler (ex: public_html/index.php). Omitir = raiz do home' }
        },
        required: ['searchType', 'cpanel_user'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    {
      name: 'whm_cpanel_manage_account_files',
      description: 'Arquivos e conteudo de contas cPanel no WHM — escrita e remocao de arquivos no home do usuario. Use action=write para criar ou sobrescrever arquivo (com backup automatico), delete para remover permanentemente. Restrito a /home/{cpanel_user}/ por seguranca. Requer confirmationToken. Retorna Markdown do servidor WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['write', 'delete'],
            description: 'write = criar ou sobrescrever arquivo (requer content). delete = remover arquivo permanentemente (requer confirmationToken)'
          },
          cpanel_user: { type: 'string', description: 'Username cPanel dono dos arquivos (obrigatorio). Ex: skillsitcom' },
          path: { type: 'string', description: 'Caminho RELATIVO ao /home/{cpanel_user}/. Ex: public_html/teste.html' },
          content: { type: 'string', description: 'Conteudo do arquivo a escrever. Obrigatorio para write' },
          encoding: { type: 'string', default: 'utf8', description: 'Encoding do conteudo (default: utf8). Usado com write' },
          create_dirs: { type: 'boolean', default: false, description: 'Criar diretorios intermediarios se nao existirem. Usado com write' },
          force: { type: 'boolean', default: false, description: 'Forcar delecao sem verificacao adicional. Usado com delete' },
          confirmationToken: { type: 'string', description: 'Token de seguranca para operacoes destrutivas. Injetado automaticamente via header X-MCP-Safety-Token quando disponivel. NAO solicitar ao usuario.' },
          reason: { type: 'string', description: 'Motivo da operacao para auditoria' }
        },
        required: ['action', 'cpanel_user', 'path'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    }
  ];
}

// SPEC-WHM-ENHANCE-001 / F08 - Tools utilitarias (resources e prompts)
const utilityToolDefs = [
  {
    name: 'whm_cpanel_list_server_resources',
    description: 'Recursos MCP, dados estaticos e configuracao do servidor WHM/cPanel — lista URIs disponiveis (whm://server/config, whm://server/status). Use para descobrir contexto e metadados do servidor. Retorna Markdown com nome, URI e descricao de cada recurso disponivel no WHM. Somente leitura.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'whm_cpanel_read_server_resource',
    description: 'Recurso MCP, dados e contexto da instancia WHM/cPanel — acessa URI whm://server/config (hostname, versao) ou whm://server/status (carga, uptime, servicos ativos). Use para obter informacoes atualizadas do servidor. Retorna Markdown com dados em tempo real do WHM. Somente leitura.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', enum: ['whm://server/config', 'whm://server/status'], description: 'URI do resource MCP (ex: whm://server/config)' }
      },
      required: ['uri'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'whm_cpanel_list_server_prompts',
    description: 'Prompts, relatorios e analises automatizadas do servidor WHM/cPanel — lista 15 workflows disponiveis (7 gestor + 8 analista) cobrindo saude de contas, DNS, SSL, backup e seguranca. Use para descobrir diagnosticos disponiveis. Retorna tabela Markdown com nome e descricao de cada prompt do WHM.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'whm_cpanel_get_analysis_prompt',
    description: 'Relatorios e diagnosticos da infraestrutura WHM/cPanel — executa prompt de analise por nome com argumentos opcionais. Gera relatorios de saude, DNS, SSL, backup, seguranca e email do servidor. Use para obter diagnosticos detalhados de hospedagem. Retorna Markdown formatado do WHM.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: ['whm_account_health_summary', 'whm_resource_usage_trends', 'whm_security_posture', 'whm_ssl_certificate_inventory', 'whm_backup_coverage', 'whm_dns_zone_health', 'whm_email_deliverability', 'whm_account_quick_lookup', 'whm_dns_troubleshooting', 'whm_email_setup_guide', 'whm_ssl_installation_guide', 'whm_website_down_investigation', 'whm_disk_usage_alert', 'whm_domain_migration_checklist', 'whm_backup_restore_guide'], description: 'Nome do prompt WHM a executar' },
        arguments: { type: 'object', description: 'Argumentos do prompt (opcionais)', additionalProperties: true }
      },
      required: ['name'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }
];

// Carregar tools: 12 consolidadas + 4 utilitarias = 16 tools
const toolDefinitions = [...buildToolDefinitions(), ...utilityToolDefs];

class MCPHandler {
  constructor() {
    this.whmService = null;
    this.dnsService = null;
    this.sshManager = null;
    this.fileManager = null;
    this.currentHeaders = {}; // GAP-IMP-02: Armazenar headers da requisição atual

    // Inicializar servicos lazy
    this.initServices();
  }

  initServices() {
    try {
      this.whmService = new WHMService();
      this.dnsService = new DNSService(this.whmService);
      this.fileManager = new FileManager();
    } catch (error) {
      logger.warn(`Service initialization warning: ${error.message}`);
    }

    try {
      this.sshManager = new SSHManager();
    } catch (error) {
      logger.warn(`SSH service not available: ${error.message}`);
    }
  }

  /**
   * Processa requisicao MCP JSON-RPC 2.0
   * Correções aplicadas:
   * - GAP-IMP-02: Aceita headers opcionais para token via header HTTP
   *
   * @param {object} request - Requisição JSON-RPC
   * @param {object} headers - Headers HTTP opcionais
   */
  async handleRequest(request, headers = {}) {
    const { jsonrpc, method, params, id } = request;

    // GAP-IMP-02: Armazenar headers para uso nas tool calls
    this.currentHeaders = headers || {};

    // Validar formato JSON-RPC
    if (jsonrpc !== '2.0') {
      return this.errorResponse(id, -32600, 'Invalid Request', { expected: '2.0' });
    }

    logger.debug(`MCP Request: ${method}`, { id });

    try {
      // Rotear para handler apropriado
      switch (method) {
        case 'initialize':
          // SPEC-WHM-ENHANCE-001 / F05, F07, F11
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2025-11-25',
              serverInfo: {
                name: 'mcp-whm-cpanel',
                version: '2.0.0'
              },
              capabilities: {
                tools: {},
                prompts: {},
                resources: {}
              },
              instructions: WHM_INSTRUCTIONS
            }
          };

        case 'tools/list':
          return this.handleToolsList(id);

        case 'tools/call':
          return await this.handleToolCall(id, params);

        case 'prompts/list':
          return this.handlePromptsList(id);

        case 'prompts/get':
          return await this.handlePromptGet(id, params);

        case 'resources/list':
          return { jsonrpc: '2.0', id, result: { resources: listResources() } };

        case 'resources/read':
          return await this.handleResourceRead(id, params);

        case 'notifications/initialized':
        case 'initialized':
          // MCP Protocol: confirmação de inicialização (notificação, retorna vazio)
          return { jsonrpc: '2.0', id, result: {} };

        default:
          return this.errorResponse(id, -32601, 'Method not found', { method });
      }
    } catch (error) {
      logger.error(`MCP Handler Error: ${error.message}`);
      recordError('mcp_handler', error.code || -32000);

      if (error.toJsonRpcError) {
        const rpcError = error.toJsonRpcError();
        return {
          jsonrpc: '2.0',
          id,
          error: rpcError
        };
      }

      return this.errorResponse(id, -32000, error.message);
    }
  }

  /**
   * Lista tools disponiveis (AC02)
   */
  handleToolsList(id) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: toolDefinitions
      }
    };
  }

  /**
   * Lista prompts disponíveis
   */
  handlePromptsList(id) {
    logger.debug(`[MCP] Retornando lista de ${WHM_PROMPTS.length} prompts`);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        prompts: WHM_PROMPTS
      }
    };
  }

  /**
   * Executa prompt específico
   */
  async handlePromptGet(id, params) {
    const { name, arguments: args } = params || {};

    if (!name) {
      return this.errorResponse(id, -32602, 'Invalid params', { reason: 'Prompt name required' });
    }

    // Verificar se prompt existe
    const prompt = WHM_PROMPTS.find(p => p.name === name);
    if (!prompt) {
      return this.errorResponse(id, -32601, 'Prompt not found', {
        prompt: name,
        available: WHM_PROMPTS.map(p => p.name)
      });
    }

    try {
      logger.debug(`[MCP] Executando prompt: ${name}`);
      const result = await handleWHMPrompt(name, args || {}, this.whmService, this.dnsService);

      return {
        jsonrpc: '2.0',
        id,
        result
      };
    } catch (error) {
      logger.error(`Prompt execution error: ${error.message}`);
      return this.errorResponse(id, -32000, error.message);
    }
  }

  /**
   * Executa tool especifica
   */
  async handleToolCall(id, params) {
    let { name, arguments: args } = params || {};

    if (!name) {
      return this.errorResponse(id, -32602, 'Invalid params', { reason: 'Tool name required' });
    }

    // Verificar se tool existe
    const tool = toolDefinitions.find(t => t.name === name);
    if (!tool) {
      return this.errorResponse(id, -32601, 'Tool not found', {
        tool: name,
        suggestion: 'Use tools/list para ver todas as tools disponiveis. Nomes iniciam com whm_cpanel_'
      });
    }

    // Executar tool com medicao de tempo
    const executor = measureToolExecution(name, async () => {
      return await this.executeTool(name, args || {});
    });

    try {
      const result = await executor();

      // SPEC-WHM-ENHANCE-001 / F01: Interceptor Markdown centralizado
      // Substitui JSON.stringify por formatToolResponse() com fallback chain
      // FIX [G2]: Fallback identico ao Hudu (server.ts:385-390)
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: formatToolResponse(name, result, args) || result?.message || 'Operacao realizada com sucesso.'
            }
          ]
        }
      };
    } catch (error) {
      // Tratar erros especificos
      if (error.toJsonRpcError) {
        return {
          jsonrpc: '2.0',
          id,
          error: error.toJsonRpcError()
        };
      }

      throw error;
    }
  }

  /**
   * Executa tool pelo nome (consolidado)
   * SPEC-WHM-ENHANCE-001 / F06: Routing por tool consolidada → service method
   * Correções aplicadas:
   * - GAP-IMP-02: Enriquecer args com token de header se não fornecido no body
   */
  async executeTool(name, args) {
    // GAP-IMP-02: Se confirmationToken não está no body, tentar extrair do header
    const enrichedArgs = { ...args };
    if (!enrichedArgs.confirmationToken) {
      const headerToken = extractSafetyToken(args, this.currentHeaders);
      if (headerToken) {
        enrichedArgs.confirmationToken = headerToken;
      }
    }

    // Propagar token de ACL para o whmService (usado pelo validateUserAccess)
    const aclToken = extractAclToken(args, this.currentHeaders);
    if (aclToken && this.whmService) {
      this.whmService.currentToken = aclToken;
    }

    // Routing por categoria via TOOL_CATEGORIES map
    const category = TOOL_CATEGORIES[name];
    if (!category) {
      throw new Error(`Unknown tool: ${name}. Use tools/list to see available tools.`);
    }

    switch (category) {
      case 'whm':
        return await this.executeWhmTool(name, enrichedArgs);
      case 'domain':
        return await this.executeDomainTool(name, enrichedArgs);
      case 'dns':
        return await this.executeDnsTool(name, enrichedArgs);
      case 'ssh':
        return await this.executeSshTool(name, enrichedArgs);
      case 'file':
        return await this.executeFileTool(name, enrichedArgs);
      case 'utility':
        return await this.executeUtilityTool(name, enrichedArgs);
      default:
        throw new Error(`Unknown tool category for: ${name}`);
    }
  }

  /**
   * Executa tools WHM consolidadas (search_accounts, manage_accounts, search_server, manage_server)
   */
  async executeWhmTool(name, args) {
    if (!this.whmService) {
      throw new Error('WHM service not configured');
    }

    switch (name) {
      case 'whm_cpanel_search_hosting_accounts': {
        const searchType = args.searchType || 'list';
        switch (searchType) {
          case 'list':
            return await withOperationTimeout(async () => {
              const result = await this.whmService.listAccounts();
              const accounts = result?.data?.acct || [];
              return {
                success: true,
                data: {
                  accounts: accounts,
                  total: accounts.length
                }
              };
            }, 'whm_cpanel_search_hosting_accounts');

          case 'summary':
            if (!args.username) throw new Error('username obrigatorio para searchType=summary');
            return await withOperationTimeout(
              () => this.whmService.getAccountSummary(args.username),
              'whm_cpanel_search_hosting_accounts'
            );

          case 'domains':
            if (!args.username) throw new Error('username obrigatorio para searchType=domains');
            return await withOperationTimeout(
              () => this.whmService.listDomains(args.username, args.limit || 50, args.offset || 0),
              'whm_cpanel_search_hosting_accounts'
            );

          default:
            throw new Error(`searchType invalido: ${searchType}. Valores aceitos: list, summary, domains`);
        }
      }

      case 'whm_cpanel_manage_hosting_accounts': {
        const action = args.action;
        if (!action) throw new Error('action obrigatorio para manage_accounts');

        switch (action) {
          case 'create':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_hosting_accounts', args);
            return await withOperationTimeout(
              () => this.whmService.createAccount(args),
              'whm_cpanel_manage_hosting_accounts'
            );

          case 'suspend':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_hosting_accounts', args);
            return await withOperationTimeout(
              () => this.whmService.suspendAccount(args.username, args.reason),
              'whm_cpanel_manage_hosting_accounts'
            );

          case 'unsuspend':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_hosting_accounts', args);
            return await withOperationTimeout(
              () => this.whmService.unsuspendAccount(args.username),
              'whm_cpanel_manage_hosting_accounts'
            );

          case 'delete':
            if (!args.confirm) {
              throw new Error('Confirmation required to terminate account');
            }
            SafetyGuard.requireConfirmation('whm_cpanel_manage_hosting_accounts', args);
            return await withOperationTimeout(
              () => this.whmService.terminateAccount(args.username),
              'whm_cpanel_manage_hosting_accounts'
            );

          default:
            throw new Error(`action invalida: ${action}. Valores aceitos: create, suspend, unsuspend, delete`);
        }
      }

      case 'whm_cpanel_search_server_status': {
        const type = args.type;
        if (!type) throw new Error('type obrigatorio para search_server');

        switch (type) {
          case 'status':
            return await withOperationTimeout(
              () => this.whmService.getServerStatus(),
              'whm_cpanel_search_server_status'
            );

          case 'services':
            // WHM /servicestatus injects malformed HTTP headers that Node.js rejects.
            // Primary: try WHM API. Fallback: use SSH whmapi1 command.
            try {
              return await withOperationTimeout(
                () => this.whmService.getServiceStatus(),
                'whm_cpanel_search_server_status'
              );
            } catch (apiError) {
              if (this.sshManager && apiError.message?.includes('Parse Error')) {
                try {
                  const sshResult = await withOperationTimeout(
                    () => this.sshManager._executeCommand('whmapi1 servicestatus --output=json'),
                    'whm_cpanel_search_server_status'
                  );
                  const parsed = JSON.parse(sshResult.output);
                  const serviceData = parsed?.data?.service || [];
                  return { services: serviceData, timestamp: new Date().toISOString() };
                } catch (sshError) {
                  return { services: [], timestamp: new Date().toISOString(), error: `API: ${apiError.message}; SSH: ${sshError.message}` };
                }
              }
              throw apiError;
            }

          default:
            throw new Error(`type invalido: ${type}. Valores aceitos: status, services`);
        }
      }

      case 'whm_cpanel_manage_server_service': {
        const action = args.action;
        if (!action) throw new Error('action obrigatorio para manage_server');

        switch (action) {
          case 'restart_service':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_server_service', args);
            return await withOperationTimeout(
              () => this.whmService.restartService(args.service),
              'whm_cpanel_manage_server_service'
            );

          default:
            throw new Error(`action invalida: ${action}. Valores aceitos: restart_service`);
        }
      }

      default:
        throw new Error(`Unknown WHM tool: ${name}`);
    }
  }

  /**
   * Executa tools de gerenciamento de domínios consolidadas (search_domains, manage_domains, manage_dnssec)
   */
  async executeDomainTool(name, args) {
    if (!this.whmService) {
      throw new Error('WHM service not configured');
    }

    switch (name) {
      case 'whm_cpanel_search_hosted_domains': {
        const searchType = args.searchType;
        if (!searchType) throw new Error('searchType obrigatorio para search_domains');

        switch (searchType) {
          case 'all':
            return await withOperationTimeout(
              () => this.whmService.getAllDomainInfo(args.limit, args.offset, args.filter, args.domain_filter),
              'whm_cpanel_search_hosted_domains'
            );

          case 'data':
            if (!args.domain) throw new Error('domain obrigatorio para searchType=data');
            return await withOperationTimeout(
              () => this.whmService.getDomainUserData(args.domain),
              'whm_cpanel_search_hosted_domains'
            );

          case 'owner':
            if (!args.domain) throw new Error('domain obrigatorio para searchType=owner');
            return await withOperationTimeout(
              () => this.whmService.getDomainOwner(args.domain),
              'whm_cpanel_search_hosted_domains'
            );

          case 'addons':
            if (!args.username) throw new Error('username obrigatorio para searchType=addons');
            return await withOperationTimeout(
              () => this.whmService.listAddonDomains(args.username),
              'whm_cpanel_search_hosted_domains'
            );

          case 'addon_details':
            if (!args.domain || !args.username) throw new Error('domain e username obrigatorios para searchType=addon_details');
            return await withOperationTimeout(
              () => this.whmService.getAddonDomainDetails(args.domain, args.username),
              'whm_cpanel_search_hosted_domains'
            );

          case 'authority':
            if (!args.domain) throw new Error('domain obrigatorio para searchType=authority');
            return await withOperationTimeout(
              () => this.whmService.hasLocalAuthority(args.domain),
              'whm_cpanel_search_hosted_domains'
            );

          default:
            throw new Error(`searchType invalido: ${searchType}. Valores aceitos: all, data, owner, addons, addon_details, authority`);
        }
      }

      case 'whm_cpanel_manage_hosted_domains': {
        const action = args.action;
        if (!action) throw new Error('action obrigatorio para manage_domains');

        switch (action) {
          case 'create_alias':
            return await withOperationTimeout(
              () => this.whmService.createParkedDomain(
                args.domain,
                args.username,
                args.target_domain
              ),
              'whm_cpanel_manage_hosted_domains'
            );

          case 'create_subdomain':
            return await withOperationTimeout(
              () => this.whmService.createSubdomain(
                args.subdomain,
                args.domain,
                args.username,
                args.document_root
              ),
              'whm_cpanel_manage_hosted_domains'
            );

          case 'delete':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_hosted_domains', args);
            return await withOperationTimeout(
              () => this.whmService.deleteDomain(
                args.domain,
                args.username,
                args.type,
                true // confirmed=true because SafetyGuard already validated
              ),
              'whm_cpanel_manage_hosted_domains'
            );

          case 'resolve_ip':
            return await withOperationTimeout(
              () => this.whmService.resolveDomainName(args.domain),
              'whm_cpanel_manage_hosted_domains'
            );

          case 'get_conversion_status':
            return await withOperationTimeout(
              () => this.whmService.getConversionStatus(args.conversion_id),
              'whm_cpanel_manage_hosted_domains'
            );

          case 'create_conversion':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_hosted_domains', args);
            return await withOperationTimeout(
              () => this.whmService.initiateAddonConversion(args),
              'whm_cpanel_manage_hosted_domains'
            );

          case 'get_conversion_details':
            return await withOperationTimeout(
              () => this.whmService.getConversionDetails(args.conversion_id),
              'whm_cpanel_manage_hosted_domains'
            );

          case 'list_conversions':
            return await withOperationTimeout(
              () => this.whmService.listConversions(),
              'whm_cpanel_manage_hosted_domains'
            );

          case 'update_cache':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_hosted_domains', args);
            return await withOperationTimeout(
              () => this.whmService.updateUserdomains(),
              'whm_cpanel_manage_hosted_domains'
            );

          default:
            throw new Error(`action invalida: ${action}. Valores aceitos: create_alias, create_subdomain, delete, resolve_ip, get_conversion_status, create_conversion, get_conversion_details, list_conversions, update_cache`);
        }
      }

      case 'whm_cpanel_manage_dnssec_settings': {
        const action = args.action;
        if (!action) throw new Error('action obrigatorio para manage_dnssec');

        switch (action) {
          case 'get_ds_records':
            return await withOperationTimeout(
              () => this.whmService.getDSRecords(args.domains),
              'whm_cpanel_manage_dnssec_settings'
            );

          case 'enable_nsec3':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_dnssec_settings', args);
            // Dynamic timeout: 60s + (30s * num_domains), max 600s
            {
              const enableTimeout = Math.min(60000 + (30000 * (args.domains?.length || 1)), 600000);
              return await withOperationTimeout(
                () => this.whmService.setNSEC3ForDomains(args.domains),
                'whm_cpanel_manage_dnssec_settings',
                enableTimeout
              );
            }

          case 'disable_nsec3':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_dnssec_settings', args);
            // Dynamic timeout: 60s + (30s * num_domains), max 600s
            {
              const disableTimeout = Math.min(60000 + (30000 * (args.domains?.length || 1)), 600000);
              return await withOperationTimeout(
                () => this.whmService.unsetNSEC3ForDomains(args.domains),
                'whm_cpanel_manage_dnssec_settings',
                disableTimeout
              );
            }

          case 'get_status':
            return await withOperationTimeout(
              () => this.whmService.getNsec3Status(args.operation_id),
              'whm_cpanel_manage_dnssec_settings'
            );

          default:
            throw new Error(`action invalida: ${action}. Valores aceitos: get_ds_records, enable_nsec3, disable_nsec3, get_status`);
        }
      }

      default:
        throw new Error(`Unknown Domain tool: ${name}`);
    }
  }

  /**
   * Executa tools DNS consolidadas (search_dns, manage_dns)
   */
  async executeDnsTool(name, args) {
    if (!this.dnsService) {
      throw new Error('DNS service not configured');
    }

    switch (name) {
      case 'whm_cpanel_search_dns_zone_records': {
        const searchType = args.searchType;
        if (!searchType) throw new Error('searchType obrigatorio para search_dns');

        switch (searchType) {
          case 'zones':
            return await withOperationTimeout(
              () => this.dnsService.listZones(),
              'whm_cpanel_search_dns_zone_records'
            );

          case 'records':
            if (!args.zone) throw new Error('zone obrigatorio para searchType=records');
            return await withOperationTimeout(
              () => this.dnsService.getZone(args.zone, {
                record_type: args.record_type,
                name_filter: args.name_filter,
                max_records: args.max_records,
                include_stats: args.include_stats
              }),
              'whm_cpanel_search_dns_zone_records'
            );

          case 'search':
            if (!args.zone || !args.name) throw new Error('zone e name obrigatorios para searchType=search');
            return await withOperationTimeout(
              () => this.dnsService.searchRecord(
                args.zone,
                args.name,
                args.type || ['A', 'AAAA'],
                args.match_mode || 'exact'
              ),
              'whm_cpanel_search_dns_zone_records'
            );

          case 'mx_records':
            if (!args.domain) throw new Error('domain obrigatorio para searchType=mx_records');
            return await withOperationTimeout(
              () => this.whmService.listMXRecords(args.domain),
              'whm_cpanel_search_dns_zone_records'
            );

          case 'nested_subdomains':
            if (!args.zone) throw new Error('zone obrigatorio para searchType=nested_subdomains');
            return await withOperationTimeout(
              () => this.dnsService.checkNestedDomains(args.zone),
              'whm_cpanel_search_dns_zone_records'
            );

          case 'alias_check':
            if (!args.zone || !args.name) throw new Error('zone e name obrigatorios para searchType=alias_check');
            return await withOperationTimeout(
              () => this.whmService.isAliasAvailable(args.zone, args.name),
              'whm_cpanel_search_dns_zone_records'
            );

          default:
            throw new Error(`searchType invalido: ${searchType}. Valores aceitos: zones, records, search, mx_records, nested_subdomains, alias_check`);
        }
      }

      case 'whm_cpanel_manage_dns_zone_records': {
        const action = args.action;
        if (!action) throw new Error('action obrigatorio para manage_dns');

        switch (action) {
          case 'create':
            return await withOperationTimeout(
              () => this.dnsService.addRecord(args.zone, args.type, args.name, {
                address: args.address,
                cname: args.cname,
                exchange: args.exchange,
                preference: args.preference,
                txtdata: args.txtdata,
                nsdname: args.nsdname,
                ptrdname: args.ptrdname,
                ttl: args.ttl
              }),
              'whm_cpanel_manage_dns_zone_records'
            );

          case 'update':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_dns_zone_records', args);
            return await withOperationTimeout(
              () => this.dnsService.editRecord(
                args.zone,
                args.line,
                {
                  type: args.type,
                  name: args.name,
                  address: args.address,
                  cname: args.cname,
                  exchange: args.exchange,
                  preference: args.preference,
                  txtdata: args.txtdata,
                  nsdname: args.nsdname,
                  ptrdname: args.ptrdname,
                  ttl: args.ttl
                },
                args.expected_content
              ),
              'whm_cpanel_manage_dns_zone_records'
            );

          case 'delete':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_dns_zone_records', args);
            return await withOperationTimeout(
              () => this.dnsService.deleteRecord(args.zone, args.line, args.expected_content),
              'whm_cpanel_manage_dns_zone_records'
            );

          case 'reset_zone':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_dns_zone_records', args);
            return await withOperationTimeout(
              () => this.dnsService.resetZone(args.zone),
              'whm_cpanel_manage_dns_zone_records'
            );

          case 'create_mx':
            // Use addzonerecord with type=MX (writes to DNS zone file)
            // savemxs only configures mail routing, not DNS records
            if (!args.domain) throw new Error('domain obrigatorio para create_mx');
            if (!args.exchange) throw new Error('exchange obrigatorio para create_mx');
            return await withOperationTimeout(
              () => this.dnsService.addRecord(
                args.domain,
                'MX',
                args.domain + '.',
                {
                  exchange: args.exchange,
                  preference: args.priority || 10,
                  ttl: args.ttl || 14400
                }
              ),
              'whm_cpanel_manage_dns_zone_records'
            );

          default:
            throw new Error(`action invalida: ${action}. Valores aceitos: create, update, delete, reset_zone, create_mx`);
        }
      }

      default:
        throw new Error(`Unknown DNS tool: ${name}`);
    }
  }

  /**
   * Executa tools SSH/System consolidadas (manage_system)
   */
  async executeSshTool(name, args) {
    if (!this.sshManager) {
      throw new Error('SSH service not configured');
    }

    switch (name) {
      case 'whm_cpanel_manage_system_services': {
        const action = args.action;
        if (!action) throw new Error('action obrigatorio para manage_system');

        switch (action) {
          case 'restart_service':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_system_services', args);
            return await withOperationTimeout(
              () => this.sshManager.restartService(args.service),
              'whm_cpanel_manage_system_services'
            );

          case 'get_load':
            return await withOperationTimeout(
              () => this.sshManager.getSystemLoad(),
              'whm_cpanel_manage_system_services'
            );

          case 'read_logs':
            if (!args.log_file) throw new Error('log_file obrigatorio para action=read_logs');
            return await withOperationTimeout(
              () => this.sshManager.readLogLines(args.log_file, args.lines || 50),
              'whm_cpanel_manage_system_services'
            );

          default:
            throw new Error(`action invalida: ${action}. Valores aceitos: restart_service, get_load, read_logs`);
        }
      }

      default:
        throw new Error(`Unknown SSH tool: ${name}`);
    }
  }

  /**
   * Executa tools de arquivo consolidadas (search_files, manage_files)
   */
  async executeFileTool(name, args) {
    if (!this.fileManager) {
      throw new Error('File manager not configured');
    }

    switch (name) {
      case 'whm_cpanel_search_account_files': {
        const searchType = args.searchType;
        if (!searchType) throw new Error('searchType obrigatorio para search_files');

        switch (searchType) {
          case 'list':
            return await withOperationTimeout(
              () => this.fileManager.listDirectory(args.cpanel_user, args.path),
              'whm_cpanel_search_account_files'
            );

          case 'read':
            if (!args.path) throw new Error('path obrigatorio para searchType=read');
            return await withOperationTimeout(
              () => this.fileManager.readFile(args.cpanel_user, args.path),
              'whm_cpanel_search_account_files'
            );

          default:
            throw new Error(`searchType invalido: ${searchType}. Valores aceitos: list, read`);
        }
      }

      case 'whm_cpanel_manage_account_files': {
        const action = args.action;
        if (!action) throw new Error('action obrigatorio para manage_files');

        switch (action) {
          case 'write':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_account_files', args);
            return await withOperationTimeout(
              () => this.fileManager.writeFile(args.cpanel_user, args.path, args.content, {
                encoding: args.encoding,
                createDirs: args.create_dirs
              }),
              'whm_cpanel_manage_account_files'
            );

          case 'delete':
            SafetyGuard.requireConfirmation('whm_cpanel_manage_account_files', args);
            return await withOperationTimeout(
              () => this.fileManager.deleteFile(args.cpanel_user, args.path, {
                force: args.force
              }),
              'whm_cpanel_manage_account_files'
            );

          default:
            throw new Error(`action invalida: ${action}. Valores aceitos: write, delete`);
        }
      }

      default:
        throw new Error(`Unknown file tool: ${name}`);
    }
  }

  /**
   * SPEC-WHM-ENHANCE-001 / F08 - Bridge tools
   */
  async executeUtilityTool(name, args) {
    switch (name) {
      case 'whm_cpanel_list_server_resources':
        return listResources().map(r => `- **${r.name}**: \`${r.uri}\` — ${r.description}`).join('\n');

      case 'whm_cpanel_read_server_resource': {
        if (!args.uri) throw new Error('URI obrigatoria. URIs disponiveis: whm://server/config, whm://server/status');
        const result = await readResource(args.uri, this.whmService, this.sshManager);
        return result.text;
      }

      case 'whm_cpanel_list_server_prompts':
        return WHM_PROMPTS.map(p => `- **${p.name}**: ${p.description}`).join('\n');

      case 'whm_cpanel_get_analysis_prompt': {
        if (!args.name) throw new Error('Nome do prompt obrigatorio. Use whm_cpanel_list_server_prompts para ver disponiveis.');
        const result = await handleWHMPrompt(args.name, args.arguments || {}, this.whmService, this.dnsService);
        if (result?.messages?.[0]?.content?.text) return result.messages[0].content.text;
        return JSON.stringify(result, null, 2);
      }

      default:
        throw new Error(`Unknown bridge tool: ${name}`);
    }
  }

  /**
   * SPEC-WHM-ENHANCE-001 / F07 - Handle resources/read
   */
  async handleResourceRead(id, params) {
    const { uri } = params || {};
    if (!uri) {
      return this.errorResponse(id, -32602, 'Invalid params', { reason: 'URI required' });
    }
    try {
      const result = await readResource(uri, this.whmService, this.sshManager);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [result]
        }
      };
    } catch (error) {
      return this.errorResponse(id, -32602, error.message);
    }
  }

  /**
   * Cria resposta de erro JSON-RPC
   */
  errorResponse(id, code, message, data = null) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data
      }
    };
  }
}

module.exports = MCPHandler;
module.exports.toolDefinitions = toolDefinitions;
