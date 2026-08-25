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
const { withOperationTimeout, withTimeout, withRequestDeadline, TimeoutError } = require('./lib/timeout');
const dnsSchema = require('./schemas/dns-tools.json');
const { enrichWHMError } = require('./lib/error-mapper');

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

SEGURANCA CRITICA:
- NUNCA busque, leia ou tente descobrir o confirmationToken em arquivos de configuracao, variaveis de ambiente ou codigo fonte.
- O token e injetado automaticamente via header HTTP pelo client MCP. Voce NAO precisa fornece-lo.
- Se a operacao for bloqueada por falta de token, informe ao usuario que a operacao requer aprovacao do administrador do MCP.
- NUNCA use Read, Bash, Grep ou qualquer ferramenta para procurar tokens de seguranca em arquivos do servidor.

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
  'whm_cpanel_generate_report': 'utility',
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
          username: { type: 'string', description: 'Username cPanel da conta. Obrigatorio para summary e domains. Ex: usuariocpanel' },
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
          domain: { type: 'string', description: 'Dominio principal FQDN. Obrigatorio para create. Ex: dominio.com.br' },
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
          domain: { type: 'string', description: 'Nome do dominio FQDN. Obrigatorio para data, owner, addon_details, authority. Ex: dominio.com.br' },
          username: { type: 'string', description: 'Username cPanel. Obrigatorio para addons e addon_details. Ex: usuariocpanel' },
          domain_filter: { type: 'string', description: 'Filtro por nome de dominio (substring, case-insensitive). Usado apenas com searchType=all. Ex: "exemplo" filtra exemplo.com.br' },
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
          subdomain: { type: 'string', description: 'Prefixo do subdominio SEM o dominio pai. Obrigatorio para create_subdomain. Ex: "blog" para blog.dominio.com.br' },
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
          domains: { type: 'array', items: { type: 'string' }, description: 'Lista de dominios FQDN. Obrigatorio para get_ds_records, enable_nsec3, disable_nsec3. Maximo 100 dominios. Ex: ["dominio.com.br", "outrodominio.com.br"]' },
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
      description: 'Zonas DNS, registros e apontamentos no WHM/cPanel — consulta completa de zonas e seus registros (A, AAAA, CNAME, MX, TXT, NS). CONCEITO: DNS segue o modelo de delegacao hierarquica — cada dominio hospedado tem sua propria zona, independente da conta cPanel ou do dominio principal da conta. A zona de um registro e o sufixo de dominio mais especifico (ex: registros de "x.exemplo.com" ficam na zona "exemplo.com"). Use zones para listar zonas, records para registros de uma zona, search para buscar registro especifico, mx_records para MX de um dominio. Se a zona informada nao existir, o erro lista as zonas disponiveis. Retorna tabela Markdown do servidor WHM. Somente leitura.',
      inputSchema: {
        type: 'object',
        properties: {
          searchType: {
            type: 'string',
            enum: ['zones', 'records', 'search', 'mx_records', 'nested_subdomains', 'alias_check'],
            description: 'zones = listar todas as zonas DNS. records = registros de 1 zona (requer zone). search = buscar registro especifico (requer zone + name). mx_records = registros MX (requer domain). nested_subdomains = analise de subdominios aninhados (requer zone). alias_check = verificar disponibilidade de alias (requer zone + name)'
          },
          zone: { type: 'string', description: 'Nome da zona DNS (igual ao dominio). Obrigatorio para records, search, nested_subdomains, alias_check. Ex: dominio.com.br' },
          domain: { type: 'string', description: 'Nome do dominio para consulta MX. Obrigatorio APENAS para mx_records. Ex: dominio.com.br' },
          name: { type: 'string', description: 'Nome completo do registro DNS a buscar. Obrigatorio para search e alias_check. Use FQDN com ponto final. Ex: dominio.com.br. ou mail.dominio.com.br.' },
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
      description: 'Registros DNS e apontamentos no WHM/cPanel — criar, atualizar ou deletar registros em zonas DNS do servidor. CONCEITO IMPORTANTE: DNS opera por ZONA, e cada dominio hospedado tem sua propria zona DNS independente, mesmo que varios dominios pertencam a mesma conta cPanel. O username da conta e o dominio principal NAO importam para DNS — o que importa e a qual zona o registro pertence. Para create, basta informar o name como FQDN (ex: "teste.qualquerdominio.com") que a zona correta e detectada automaticamente. Use create para novo registro (A, CNAME, MX, TXT), update/delete com numero de linha obtido via search. reset_zone recria zona inteira. Acoes destrutivas requerem confirmationToken. Retorna Markdown do servidor WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'update', 'delete', 'reset_zone', 'create_mx'],
            description: 'create = novo registro (requer type + name + valor; zone e OPCIONAL, detectada do name). update = alterar registro existente (requer zone + line). delete = remover registro (requer zone + line + confirmationToken). reset_zone = resetar zona inteira (requer zone + confirmationToken, DESTRUTIVO). create_mx = adicionar MX (requer domain + exchange)'
          },
          zone: { type: 'string', description: 'Nome da zona DNS (= o dominio cuja zona contem o registro). Para create e OPCIONAL: se omitida, e inferida automaticamente do sufixo do name (ex: name="teste.exemplo.com" -> zona "exemplo.com"). Obrigatoria para update, delete, reset_zone. NAO confundir com username da conta nem com o dominio principal da conta — a zona e o dominio do proprio registro. Ex: exemplo.com.br' },
          domain: { type: 'string', description: 'Nome do dominio. Obrigatorio APENAS para create_mx. Ex: dominio.com.br' },
          type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR'], description: 'Tipo do registro DNS. Obrigatorio para create' },
          name: { type: 'string', description: 'Nome do registro. Para create, prefira o FQDN completo (ex: "teste.exemplo.com" ou "teste.exemplo.com."): a zona e detectada automaticamente a partir dele. Aceita tambem nome relativo (ex: "teste") desde que a zona seja informada. Ex: mail.exemplo.com.br' },
          line: { type: 'integer', description: 'Numero da linha do registro na zona. Obrigatorio para update e delete. Obtenha via search_dns_zone_records com searchType=records' },
          expected_content: { type: 'string', description: 'Conteudo COMPLETO esperado da linha do registro (formato BIND: "nome. TTL IN TIPO valor", ex: "teste.exemplo.com. 14400 IN A 192.0.2.1") para verificacao de concorrencia (optimistic lock). Obtenha o valor exato via search_dns_zone_records. Opcional mas recomendado em update/delete para evitar editar o registro errado. Se omitido, a operacao prossegue sem checagem de concorrencia.' },
          address: { type: 'string', description: 'Endereco IP. Usado para registros tipo A e AAAA. Ex: 192.0.2.1' },
          cname: { type: 'string', description: 'Dominio alvo. Usado para registros tipo CNAME. Ex: outro.dominio.com.' },
          exchange: { type: 'string', description: 'Servidor de email. Usado para registros MX e create_mx. Ex: mail.dominio.com.br.' },
          preference: { type: 'integer', description: 'Prioridade MX para action=create com type=MX (menor numero = maior prioridade). Ex: 10' },
          priority: { type: 'integer', default: 10, description: 'Prioridade MX para action=create_mx (default: 10). Mesmo conceito que preference' },
          txtdata: { type: 'string', description: 'Conteudo do registro TXT. Usado para tipo TXT. Ex: v=spf1 include:_spf.google.com ~all' },
          nsdname: { type: 'string', description: 'Nome do nameserver. Usado para registros tipo NS. Ex: ns1.nameserver.com.br.' },
          ptrdname: { type: 'string', description: 'Hostname para DNS reverso. Usado para registros tipo PTR. Ex: servidor.dominio.com.br.' },
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
          cpanel_user: { type: 'string', description: 'Username cPanel dono dos arquivos (obrigatorio). Ex: usuariocpanel' },
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
          cpanel_user: { type: 'string', description: 'Username cPanel dono dos arquivos (obrigatorio). Ex: usuariocpanel' },
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
    name: 'whm_cpanel_generate_report',
    description: 'Relatorios EXECUTAVEIS do WHM/cPanel — gera 15 relatorios com DADOS REAIS coletados diretamente do servidor (sem placeholders). Substitui os antigos Analysis Prompts. Para gestor: health_summary, resource_usage_trends, security_posture, ssl_inventory, backup_coverage, dns_zone_health, email_deliverability. Para analista: account_quick_lookup, dns_troubleshooting, email_setup_guide, ssl_installation_guide, website_down_investigation, disk_usage_alert, domain_migration_checklist, backup_restore_guide. Retorna Markdown pronto para exibir. Somente leitura.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          enum: [
            'whm_account_health_summary', 'whm_resource_usage_trends', 'whm_security_posture',
            'whm_ssl_certificate_inventory', 'whm_backup_coverage', 'whm_dns_zone_health',
            'whm_email_deliverability', 'whm_account_quick_lookup', 'whm_dns_troubleshooting',
            'whm_email_setup_guide', 'whm_ssl_installation_guide', 'whm_website_down_investigation',
            'whm_disk_usage_alert', 'whm_domain_migration_checklist', 'whm_backup_restore_guide'
          ],
          description: 'Nome do relatorio. account_quick_lookup/disk_usage_alert exigem username; dns_troubleshooting/email_deliverability/website_down_investigation exigem domain; demais sao opcionais.'
        },
        arguments: {
          type: 'object',
          description: 'Argumentos do relatorio: username, domain, account_name, search_term, filter_suspended, period_days, check_type, expiring_days, domain_from, domain_to, backup_date, email_address.',
          additionalProperties: true
        }
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

        // Os tres metodos abaixo tocam o servidor WHM e podem demorar.
        // Rodam sob deadline para que o servidor SEMPRE responda antes do
        // cliente desistir — um erro explicado vale mais que `{"error": ""}`.
        case 'tools/call':
          return await withRequestDeadline(
            () => this.handleToolCall(id, params),
            'tools/call',
            params?.name
          );

        case 'prompts/list':
          return this.handlePromptsList(id);

        case 'prompts/get':
          return await withRequestDeadline(
            () => this.handlePromptGet(id, params),
            'prompts/get',
            params?.name
          );

        case 'resources/list':
          return { jsonrpc: '2.0', id, result: { resources: listResources() } };

        case 'resources/read':
          return await withRequestDeadline(
            () => this.handleResourceRead(id, params),
            'resources/read',
            params?.uri
          );

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
        // Enrich message with actionable hint when pattern matches
        if (rpcError?.message) rpcError.message = enrichWHMError(rpcError.message);
        return {
          jsonrpc: '2.0',
          id,
          error: rpcError
        };
      }

      return this.errorResponse(id, -32000, enrichWHMError(error.message));
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
   * Lista prompts disponíveis. Cada prompt MCP nativo internamente delega para
   * `reports.js` via `prompts/get`, garantindo que o mesmo conjunto de 15 relatorios
   * seja acessivel tanto via tool `whm_cpanel_generate_report` quanto via prompts MCP.
   */
  handlePromptsList(id) {
    const { REPORT_NAMES } = require('./lib/reports');
    const PROMPT_META = {
      whm_account_health_summary: { desc: 'Resumo executivo de saude das contas WHM (ativas/suspensas/over-quota/servicos criticos).', args: [{ name: 'filter_suspended', required: false }] },
      whm_resource_usage_trends: { desc: 'Tendencias de uso de disco/CPU/memoria + projecao linear de ETA ate 90% da quota.', args: [{ name: 'period_days', required: false }] },
      whm_security_posture: { desc: 'Postura de seguranca (CSF/LFD, cPHulk, SSH, ClamAV) com acoes recomendadas.', args: [{ name: 'check_type', required: false }] },
      whm_ssl_certificate_inventory: { desc: 'Inventario de certificados SSL instalados com alerta de expiracao.', args: [] },
      whm_backup_coverage: { desc: 'Cobertura de backups (JetBackup5 ou /backup) com identificacao de gaps.', args: [] },
      whm_dns_zone_health: { desc: 'Saude DNS por zona: A/MX/SPF/DKIM/DMARC com contagem de registros.', args: [] },
      whm_email_deliverability: { desc: 'Entregabilidade de email: MX, SPF, DKIM, DMARC do dominio informado.', args: [{ name: 'domain', required: true }] },
      whm_account_quick_lookup: { desc: 'Busca rapida de conta: dados, recursos, dominios e status.', args: [{ name: 'search_term', required: true }] },
      whm_dns_troubleshooting: { desc: 'Troubleshoot DNS do dominio: autoridade, A/www/NS/MX, diagnostico.', args: [{ name: 'domain', required: true }] },
      whm_email_setup_guide: { desc: 'Guia IMAP/POP3/SMTP/Webmail customizado para o dominio.', args: [{ name: 'domain', required: false }] },
      whm_ssl_installation_guide: { desc: 'Guia AutoSSL + manual + redirect HTTPS customizado.', args: [{ name: 'domain', required: false }] },
      whm_website_down_investigation: { desc: 'Investigacao site fora do ar: DNS, owner, servicos, carga.', args: [{ name: 'domain', required: true }] },
      whm_disk_usage_alert: { desc: 'Alerta de disco da conta com top diretorios via SSH du -sh.', args: [{ name: 'username', required: true }] },
      whm_domain_migration_checklist: { desc: 'Checklist completo de migracao de dominio entre servidores.', args: [{ name: 'domain_from', required: false }, { name: 'domain_to', required: false }] },
      whm_backup_restore_guide: { desc: 'Guia passo-a-passo de restauracao de backup da conta.', args: [{ name: 'account_name', required: false }, { name: 'backup_date', required: false }] }
    };
    const prompts = REPORT_NAMES.map(name => ({
      name,
      description: (PROMPT_META[name]?.desc || 'Relatorio WHM com dados reais.') + ' [Implementado via whm_cpanel_generate_report]',
      arguments: PROMPT_META[name]?.args || []
    }));
    logger.debug(`[MCP] prompts/list — retornando ${prompts.length} prompts (delegacao para generate_report)`);
    return { jsonrpc: '2.0', id, result: { prompts } };
  }

  /**
   * Executa prompt específico. Delega para reports.js e empacota como MCP prompt response.
   */
  async handlePromptGet(id, params) {
    const { name, arguments: args } = params || {};
    if (!name) {
      return this.errorResponse(id, -32602, 'Invalid params', { reason: 'Prompt name required' });
    }
    try {
      const { generateReport, REPORT_NAMES } = require('./lib/reports');
      if (!REPORT_NAMES.includes(name)) {
        return this.errorResponse(id, -32601, `Prompt nao encontrado: ${name}`, {
          available: REPORT_NAMES
        });
      }
      const ctx = { whmService: this.whmService, sshManager: this.sshManager };
      const markdown = await generateReport(name, ctx, args || {});
      return {
        jsonrpc: '2.0',
        id,
        result: {
          description: `Relatorio ${name} (dados reais via WHM API + SSH)`,
          messages: [{
            role: 'user',
            content: { type: 'text', text: markdown }
          }]
        }
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
          case 'status': {
            const baseStatus = await withOperationTimeout(
              () => this.whmService.getServerStatus(),
              'whm_cpanel_search_server_status'
            );
            // Best-effort uptime via SSH (WHM API does not expose it reliably)
            if (this.sshManager && !baseStatus?.uptime) {
              try {
                const sshResult = await withOperationTimeout(
                  () => this.sshManager._executeCommand('uptime -p'),
                  'whm_cpanel_search_server_status'
                );
                const uptime = (sshResult?.output || '').trim();
                if (uptime) baseStatus.uptime = uptime;
              } catch (_) { /* uptime is optional; do not fail status read */ }
            }
            return baseStatus;
          }

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

        // Validar que cada dominio informado existe como zona DNS no servidor.
        // DNSSEC opera por zona; um dominio que nao e zona local nao tem DNSSEC gerenciavel aqui.
        if (Array.isArray(args.domains) && args.domains.length > 0) {
          const { validateZone, getAvailableZones } = require('./lib/dns-helpers/zone-resolver');
          const zones = await getAvailableZones(() => this.dnsService.listZones());
          const invalid = [];
          for (const d of args.domains) {
            const v = validateZone(d, zones);
            if (!v.valid) invalid.push(d);
          }
          if (invalid.length > 0) {
            throw new Error(
              `Os seguintes dominios nao sao zonas DNS locais neste servidor: ${invalid.join(', ')}. ` +
              `DNSSEC opera por zona (cada dominio hospedado tem zona propria, independente da conta cPanel). ` +
              `Use search_dns_zone_records (searchType=zones) para ver as zonas disponiveis.`
            );
          }
        }

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
  /**
   * Resolve/valida a zona DNS de uma operacao antes de executa-la.
   * - Se um FQDN (name/domain) for fornecido, infere/corrige a zona pelo sufixo.
   * - Caso contrario, valida que a zona informada existe no servidor.
   * Usa cache TTL de zonas para evitar chamadas WHM repetidas em batch.
   *
   * @param {{ zone?: string, name?: string }} opts
   * @returns {Promise<{ zone: string, recordName: string|null, warning: string|null }>}
   * @throws {Error} com mensagem orientativa quando a zona nao pode ser resolvida/validada
   */
  async resolveDnsZone({ zone, name }) {
    const { resolveZone, validateZone, getAvailableZones } = require('./lib/dns-helpers/zone-resolver');
    const availableZones = await getAvailableZones(() => this.dnsService.listZones());

    if (name) {
      const r = resolveZone(name, zone, availableZones);
      if (r.error) throw new Error(r.error);
      return { zone: r.zone, recordName: r.recordName, warning: r.warning };
    }
    const v = validateZone(zone, availableZones);
    if (!v.valid) throw new Error(v.error);
    return { zone: v.zone, recordName: null, warning: v.warning || null };
  }

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

          case 'records': {
            if (!args.zone) throw new Error('zone obrigatorio para searchType=records');
            const { zone: rZone } = await this.resolveDnsZone({ zone: args.zone });
            return await withOperationTimeout(
              () => this.dnsService.getZone(rZone, {
                record_type: args.record_type,
                name_filter: args.name_filter,
                max_records: args.max_records,
                include_stats: args.include_stats
              }),
              'whm_cpanel_search_dns_zone_records'
            );
          }

          case 'search': {
            if (!args.zone || !args.name) throw new Error('zone e name obrigatorios para searchType=search');
            const { zone: sZone } = await this.resolveDnsZone({ zone: args.zone, name: args.name });
            return await withOperationTimeout(
              () => this.dnsService.searchRecord(
                sZone,
                args.name,
                args.type || ['A', 'AAAA'],
                args.match_mode || 'exact'
              ),
              'whm_cpanel_search_dns_zone_records'
            );
          }

          case 'mx_records': {
            if (!args.domain) throw new Error('domain obrigatorio para searchType=mx_records');
            const { zone: mxZone } = await this.resolveDnsZone({ zone: args.domain });
            return await withOperationTimeout(
              () => this.whmService.listMXRecords(mxZone),
              'whm_cpanel_search_dns_zone_records'
            );
          }

          case 'nested_subdomains': {
            if (!args.zone) throw new Error('zone obrigatorio para searchType=nested_subdomains');
            const { zone: nZone } = await this.resolveDnsZone({ zone: args.zone });
            return await withOperationTimeout(
              () => this.dnsService.checkNestedDomains(nZone),
              'whm_cpanel_search_dns_zone_records'
            );
          }

          case 'alias_check': {
            if (!args.zone || !args.name) throw new Error('zone e name obrigatorios para searchType=alias_check');
            const { zone: aZone } = await this.resolveDnsZone({ zone: args.zone, name: args.name });
            return await withOperationTimeout(
              () => this.whmService.isAliasAvailable(aZone, args.name),
              'whm_cpanel_search_dns_zone_records'
            );
          }

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

          case 'update': {
            SafetyGuard.requireConfirmation('whm_cpanel_manage_dns_zone_records', args);
            // Validar que a zona existe (NAO auto-corrigir via name: o "line" esta atrelado
            // a zona informada; trocar a zona invalidaria o line. expected_content protege o resto).
            const { zone: uZone } = await this.resolveDnsZone({ zone: args.zone });
            return await withOperationTimeout(
              () => this.dnsService.editRecord(
                uZone,
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
          }

          case 'delete': {
            SafetyGuard.requireConfirmation('whm_cpanel_manage_dns_zone_records', args);
            const { zone: dZone } = await this.resolveDnsZone({ zone: args.zone });
            return await withOperationTimeout(
              () => this.dnsService.deleteRecord(dZone, args.line, args.expected_content),
              'whm_cpanel_manage_dns_zone_records'
            );
          }

          case 'reset_zone': {
            SafetyGuard.requireConfirmation('whm_cpanel_manage_dns_zone_records', args);
            const { zone: rzZone } = await this.resolveDnsZone({ zone: args.zone });
            return await withOperationTimeout(
              () => this.dnsService.resetZone(rzZone),
              'whm_cpanel_manage_dns_zone_records'
            );
          }

          case 'create_mx': {
            // Use addzonerecord with type=MX (writes to DNS zone file)
            // savemxs only configures mail routing, not DNS records
            if (!args.domain) throw new Error('domain obrigatorio para create_mx');
            if (!args.exchange) throw new Error('exchange obrigatorio para create_mx');
            const { zone: mxcZone } = await this.resolveDnsZone({ zone: args.domain });
            return await withOperationTimeout(
              () => this.dnsService.addRecord(
                mxcZone,
                'MX',
                mxcZone + '.',
                {
                  exchange: args.exchange,
                  preference: args.priority || 10,
                  ttl: args.ttl || 14400
                }
              ),
              'whm_cpanel_manage_dns_zone_records'
            );
          }

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

      case 'whm_cpanel_generate_report': {
        if (!args.name) throw new Error('Nome do relatorio obrigatorio (parametro "name"). 15 relatorios disponiveis em REPORT_NAMES.');
        const { generateReport } = require('./lib/reports');
        const reportArgs = args.arguments || {};
        const ctx = { whmService: this.whmService, sshManager: this.sshManager };
        return await withOperationTimeout(
          () => generateReport(args.name, ctx, reportArgs),
          'whm_cpanel_generate_report'
        );
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
    const validUris = listResources().map(r => r.uri);

    if (!uri) {
      return this.errorResponse(id, -32602, 'Parametro `uri` obrigatorio.', { uris_validas: validUris });
    }

    // URI desconhecida: ai sim o erro e do chamador.
    if (!validUris.includes(uri)) {
      return this.errorResponse(id, -32602, `URI desconhecida: "${uri}".`, {
        uris_validas: validUris,
        o_que_fazer: 'Use exatamente uma das URIs listadas em uris_validas.'
      });
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
      // A URI era valida — a falha veio do servidor WHM.
      // Antes isto retornava -32602 (Invalid params), fazendo o modelo acreditar
      // que tinha passado uma URI errada e tentar variacoes indefinidamente.
      logger.error(`Falha ao ler resource ${uri}: ${error.message}`);
      return this.errorResponse(id, -32000, `Falha ao ler ${uri}: ${enrichWHMError(error.message)}`, {
        uri,
        uri_estava_correta: true,
        o_que_fazer: 'A URI esta certa e nao ha variacao a tentar. Informe a indisponibilidade ao usuario ou busque o dado por outra tool (ex: whm_cpanel_search_server_status).',
        o_que_nao_adianta: 'Tentar outras grafias da URI — o problema esta na coleta no servidor WHM, nao no parametro.'
      });
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
