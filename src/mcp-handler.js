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
      description: 'Contas de hospedagem, clientes e planos no WHM/cPanel — inventario completo de contas ativas, suspensas, resumo de recursos e dominios por conta. Use searchType list para listar todas, summary para detalhes de uma conta, domains para dominios. Retorna Markdown com dados paginados do servidor WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          searchType: {
            type: 'string',
            enum: ['list', 'summary', 'domains'],
            description: 'Tipo de busca: list (listar contas), summary (resumo de conta), domains (dominios de conta)'
          },
          username: { type: 'string', description: 'Username da conta (obrigatorio para summary e domains)' },
          limit: { type: 'integer', default: 25, description: 'Maximo de resultados por pagina (default: 25, max: 50)' },
          offset: { type: 'integer', default: 0, description: 'Numero de resultados a pular (para paginacao)' }
        },
        required: ['searchType'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    {
      name: 'whm_cpanel_manage_hosting_accounts',
      description: 'Conta de hospedagem no WHM/cPanel — criar, suspender, reativar ou remover contas de clientes. Acoes destrutivas (delete) requerem confirmationToken e confirm=true. Suspensao preserva dados e e reversivel. Criacao requer username, domain e password. Retorna Markdown com status da operacao no servidor WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'suspend', 'unsuspend', 'delete'],
            description: 'Acao: create (criar), suspend (suspender), unsuspend (reativar), delete (remover permanente)'
          },
          username: { type: 'string', description: 'Username da conta (obrigatorio para todas as acoes)' },
          domain: { type: 'string', description: 'Dominio principal (obrigatorio para create)' },
          password: { type: 'string', description: 'Senha da conta (obrigatorio para create, min 8 chars)' },
          email: { type: 'string', description: 'Email de contato (create)' },
          package: { type: 'string', description: 'Plano de hospedagem (create, ex: default, business)' },
          reason: { type: 'string', description: 'Motivo da operacao (obrigatorio para suspend, recomendado para demais)' },
          confirm: { type: 'boolean', description: 'Confirmacao obrigatoria para delete (deve ser true)' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' }
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
      description: 'Status do servidor WHM/cPanel — monitoramento geral incluindo load average, uptime, versao e estado de servicos (Apache, MySQL, DNS, FTP, email). Use type status para saude geral do servidor, services para estado individual de cada daemon. Retorna Markdown com metricas e estados de servicos do WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['status', 'services'],
            description: 'Tipo de consulta: status (saude geral), services (estado de cada servico)'
          }
        },
        required: ['type'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    {
      name: 'whm_cpanel_manage_server_service',
      description: 'Reinicio de servico via API do WHM/cPanel — reinicializa daemon para aplicar configuracoes ou resolver travamentos. Causa indisponibilidade temporaria do servico. Servicos validos: httpd, mysql, named, postfix, dovecot, exim, nginx, pure-ftpd. Requer confirmationToken. Retorna Markdown com resultado do WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['restart_service'],
            description: 'Acao: restart_service (reiniciar servico via API WHM)'
          },
          service: {
            type: 'string',
            enum: ['httpd', 'mysql', 'named', 'postfix', 'dovecot', 'exim', 'nginx', 'pure-ftpd'],
            description: 'Nome do servico a reiniciar'
          },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo do restart (auditoria)' }
        },
        required: ['action', 'service'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },

    // ==========================================
    // DOMINIOS - search_domains / manage_domains / manage_dnssec
    // ==========================================
    {
      name: 'whm_cpanel_search_hosted_domains',
      description: 'Dominios, sites e hospedagens no WHM/cPanel — busca paginada com filtros por tipo e nome. searchType: all (listar todos), data (dados de dominio unico), owner (proprietario), addons (addon domains de conta), addon_details (detalhes addon), authority (autoridade DNS). Retorna Markdown com dados do WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          searchType: {
            type: 'string',
            enum: ['all', 'data', 'owner', 'addons', 'addon_details', 'authority'],
            description: 'Tipo de busca: all (listar), data (dados unico), owner (proprietario), addons (addon domains), addon_details (detalhe addon), authority (autoridade DNS)'
          },
          domain: { type: 'string', description: 'Nome do dominio (obrigatorio para data, owner, addon_details, authority)' },
          username: { type: 'string', description: 'Username cPanel (obrigatorio para addons, addon_details)' },
          domain_filter: { type: 'string', description: 'Filtrar por nome (substring, case-insensitive). Usado com searchType=all' },
          limit: { type: 'integer', default: 25, description: 'Maximo de resultados por pagina (default: 25, max: 50)' },
          offset: { type: 'integer', default: 0, description: 'Numero de resultados a pular (para paginacao)' },
          filter: { type: 'string', enum: ['addon', 'alias', 'subdomain', 'main'], description: 'Filtrar por tipo de dominio (usado com searchType=all)' }
        },
        required: ['searchType'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    {
      name: 'whm_cpanel_manage_hosted_domains',
      description: 'Dominios, sites e enderecos web no WHM/cPanel — criar alias, subdominio, deletar, resolver IP, conversoes addon e cache. Acoes destrutivas (delete) requerem confirmationToken. Conversoes criam conta independente a partir de addon. resolve_ip consulta apontamento DNS. update_cache sincroniza userdomains. Retorna Markdown do WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create_alias', 'create_subdomain', 'delete', 'resolve_ip', 'get_conversion_status', 'create_conversion', 'get_conversion_details', 'list_conversions', 'update_cache'],
            description: 'Acao a executar no dominio'
          },
          domain: { type: 'string', description: 'Nome do dominio (obrigatorio para create_alias, create_subdomain, delete, resolve_ip, create_conversion)' },
          username: { type: 'string', description: 'Usuario cPanel proprietario (obrigatorio para create_alias, create_subdomain, delete, create_conversion)' },
          subdomain: { type: 'string', description: 'Nome do subdominio sem dominio pai (obrigatorio para create_subdomain, ex: "blog")' },
          target_domain: { type: 'string', description: 'Dominio alvo para alias (opcional, default: dominio principal da conta)' },
          document_root: { type: 'string', description: 'Raiz do documento para subdominio (opcional, auto-gerado)' },
          type: { type: 'string', enum: ['addon', 'parked', 'subdomain'], description: 'Tipo de dominio (obrigatorio para delete)' },
          new_username: { type: 'string', description: 'Novo username para conversao addon (obrigatorio para create_conversion)' },
          conversion_id: { type: 'string', description: 'ID da conversao (obrigatorio para get_conversion_status, get_conversion_details)' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da operacao (auditoria)' }
        },
        required: ['action'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    },
    {
      name: 'whm_cpanel_manage_dnssec_settings',
      description: 'DNSSEC e NSEC3 no WHM/cPanel — gerenciar seguranca DNS de dominios. get_ds_records obtem chaves DS para registrar. enable_nsec3 ativa protecao contra zone walking. disable_nsec3 reverte para NSEC. get_status consulta operacao assincrona. Aceita ate 100 dominios por chamada. Retorna Markdown do WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get_ds_records', 'enable_nsec3', 'disable_nsec3', 'get_status'],
            description: 'Acao: get_ds_records, enable_nsec3, disable_nsec3, get_status'
          },
          domains: { type: 'array', items: { type: 'string' }, description: 'Lista de dominios (obrigatorio para get_ds_records, enable_nsec3, disable_nsec3; max 100)' },
          operation_id: { type: 'string', description: 'ID da operacao NSEC3 (obrigatorio para get_status)' },
          confirmationToken: { type: 'string', description: 'Token de seguranca (MCP_SAFETY_TOKEN, obrigatorio para enable/disable)' },
          reason: { type: 'string', description: 'Motivo da alteracao (auditoria, min 10 chars)' }
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
      description: 'Zonas e registros DNS no WHM/cPanel — busca completa com filtros por tipo e nome. searchType: zones (listar zonas), records (registros de zona), search (buscar registro especifico), mx_records (registros MX), nested_subdomains (analise hierarquica), alias_check (disponibilidade). Retorna Markdown do WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          searchType: {
            type: 'string',
            enum: ['zones', 'records', 'search', 'mx_records', 'nested_subdomains', 'alias_check'],
            description: 'Tipo de busca DNS'
          },
          zone: { type: 'string', description: 'Nome da zona/dominio (obrigatorio para records, search, nested_subdomains, alias_check)' },
          domain: { type: 'string', description: 'Nome do dominio (obrigatorio para mx_records)' },
          name: { type: 'string', description: 'Nome do registro a buscar (obrigatorio para search e alias_check)' },
          record_type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SOA', 'SRV', 'CAA'], description: 'Filtrar por tipo de registro (records)' },
          name_filter: { type: 'string', description: 'Filtrar por nome de registro (substring, records)' },
          max_records: { type: 'integer', default: 25, description: 'Limite de registros retornados (default: 25, max: 100)' },
          include_stats: { type: 'boolean', default: false, description: 'Incluir estatisticas de subdominios (records)' },
          type: {
            type: 'array',
            items: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SOA', 'SRV', 'CAA'] },
            description: 'Tipos de registro a buscar (search, default: ["A", "AAAA"])'
          },
          match_mode: {
            type: 'string',
            enum: ['exact', 'contains', 'startsWith'],
            description: 'Modo de correspondencia (search): exact, contains, startsWith'
          }
        },
        required: ['searchType'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    {
      name: 'whm_cpanel_manage_dns_zone_records',
      description: 'Registros DNS no WHM/cPanel — criar, atualizar, deletar registros e resetar zona. create suporta A, AAAA, CNAME, MX, TXT, NS, PTR. update requer linha obtida via search. delete e reset_zone sao destrutivos e requerem confirmationToken. create_mx adiciona registro MX com prioridade. Retorna Markdown do WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'update', 'delete', 'reset_zone', 'create_mx'],
            description: 'Acao: create, update, delete, reset_zone, create_mx'
          },
          zone: { type: 'string', description: 'Nome da zona/dominio (obrigatorio para create, update, delete, reset_zone)' },
          domain: { type: 'string', description: 'Nome do dominio (obrigatorio para create_mx)' },
          type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR'], description: 'Tipo do registro (obrigatorio para create)' },
          name: { type: 'string', description: 'Nome do registro (obrigatorio para create)' },
          line: { type: 'integer', description: 'Numero da linha (obrigatorio para update e delete)' },
          expected_content: { type: 'string', description: 'Conteudo esperado para verificacao (update/delete, previne edicao concorrente)' },
          address: { type: 'string', description: 'IP para registros A/AAAA' },
          cname: { type: 'string', description: 'Target para CNAME' },
          exchange: { type: 'string', description: 'Servidor de email para MX/create_mx' },
          preference: { type: 'integer', description: 'Prioridade MX (menor = maior prioridade)' },
          priority: { type: 'integer', default: 10, description: 'Prioridade MX para create_mx (default: 10)' },
          txtdata: { type: 'string', description: 'Conteudo para registro TXT' },
          nsdname: { type: 'string', description: 'Nameserver para NS' },
          ptrdname: { type: 'string', description: 'Hostname para PTR' },
          ttl: { type: 'integer', default: 14400, description: 'TTL em segundos (default: 14400)' },
          always_accept: { type: 'boolean', default: false, description: 'Aceitar email sem conta local (create_mx)' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da operacao (auditoria)' }
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
      description: 'Sistema e processos do servidor WHM/cPanel via SSH — reiniciar servicos, consultar carga e ler logs. restart_service reinicia daemon via SSH. get_load retorna CPU, memoria e disco em tempo real. read_logs le ultimas linhas de /var/log/*, /usr/local/apache/logs/*, /usr/local/cpanel/logs/*. Retorna Markdown do WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['restart_service', 'get_load', 'read_logs'],
            description: 'Acao: restart_service, get_load (metricas CPU/RAM/disco), read_logs (ultimas linhas)'
          },
          service: {
            type: 'string',
            enum: ['httpd', 'mysql', 'named', 'postfix', 'dovecot', 'exim', 'nginx', 'pure-ftpd'],
            description: 'Servico a reiniciar (obrigatorio para restart_service)'
          },
          log_file: { type: 'string', description: 'Caminho absoluto do log (obrigatorio para read_logs). Permitidos: /var/log/*, /usr/local/apache/logs/*, /usr/local/cpanel/logs/*' },
          lines: { type: 'integer', default: 30, description: 'Numero de linhas do log (default: 30, max: 100)' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN, obrigatorio para restart_service)' },
          reason: { type: 'string', description: 'Motivo (auditoria, obrigatorio para restart_service)' }
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
      description: 'Arquivos e diretorios de conta cPanel no WHM — navegacao e leitura do home do usuario. searchType list para explorar estrutura de diretorios, read para visualizar conteudo de arquivo. Restrito a /home/{usuario} por seguranca contra path traversal. Retorna Markdown com listagem ou conteudo do arquivo no WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          searchType: {
            type: 'string',
            enum: ['list', 'read'],
            description: 'Tipo de busca: list (listar diretorios), read (ler conteudo de arquivo)'
          },
          cpanel_user: { type: 'string', description: 'Usuario cPanel (dono dos arquivos, obrigatorio)' },
          path: { type: 'string', description: 'Caminho relativo ao home (ex: public_html, public_html/index.php). Para list: diretorio; para read: arquivo' }
        },
        required: ['searchType', 'cpanel_user'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    {
      name: 'whm_cpanel_manage_account_files',
      description: 'Escrita e remocao de arquivos de conta cPanel no WHM — criar, atualizar ou deletar conteudo no home do usuario. write cria ou sobrescreve com backup automatico. delete remove permanentemente. Restrito a /home/{usuario} por seguranca. Requer confirmationToken. Retorna Markdown com resultado da operacao no WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['write', 'delete'],
            description: 'Acao: write (criar/atualizar arquivo), delete (remover arquivo)'
          },
          cpanel_user: { type: 'string', description: 'Usuario cPanel (obrigatorio)' },
          path: { type: 'string', description: 'Caminho do arquivo relativo ao home (obrigatorio)' },
          content: { type: 'string', description: 'Conteudo a escrever (obrigatorio para write)' },
          encoding: { type: 'string', default: 'utf8', description: 'Encoding do arquivo (default: utf8, para write)' },
          create_dirs: { type: 'boolean', default: false, description: 'Criar diretorios pais se nao existirem (write)' },
          force: { type: 'boolean', default: false, description: 'Forcar delecao sem confirmacao adicional (delete)' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da operacao (auditoria)' }
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
    description: 'Recursos MCP, dados estaticos e configuracao da maquina WHM/cPanel — lista URIs disponiveis (whm://server/config, whm://server/status). Use para descobrir contexto e metadados do servidor WHM. Retorna Markdown com nome, URI e descricao de cada recurso.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'whm_cpanel_read_server_resource',
    description: 'Recurso MCP, dados e contexto da instancia WHM/cPanel — acessa URI whm://server/config (configuracao, hostname, versao) ou whm://server/status (carga, uptime, servicos). Use para obter informacoes do servidor WHM. Retorna Markdown com dados atualizados.',
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
    description: 'Prompts e relatorios automatizados do servidor WHM/cPanel — lista 15 workflows disponiveis (7 gestor + 8 analista), incluindo saude de contas, DNS, SSL e backup. Use para descobrir analises disponiveis no WHM. Retorna Markdown com nome e descricao de cada prompt.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'whm_cpanel_get_analysis_prompt',
    description: 'Relatorio e analise da infraestrutura WHM/cPanel — executa prompt por nome com argumentos opcionais. Gera diagnosticos de saude, DNS, SSL, backup e seguranca do servidor WHM. Use para obter relatorios detalhados de hospedagem. Retorna Markdown formatado.',
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
              () => this.whmService.listDomains(args.username),
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
            return await withOperationTimeout(
              () => this.whmService.getServiceStatus(),
              'whm_cpanel_search_server_status'
            );

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
                  address: args.address,
                  cname: args.cname,
                  exchange: args.exchange,
                  preference: args.preference,
                  txtdata: args.txtdata,
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
            return await withOperationTimeout(
              () => this.whmService.saveMXRecord(
                args.domain,
                args.exchange,
                args.priority,
                args.always_accept
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
        const result = await readResource(args.uri, this.whmService);
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
      const result = await readResource(uri, this.whmService);
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
