/**
 * MCP Handler - Processa requisicoes JSON-RPC 2.0
 * Implementa AC02: Lista de Tools MCP
 * Correções aplicadas:
 * - GAP-IMP-02: Suporte a header X-MCP-Safety-Token
 */

const WHMService = require('./lib/whm-service');
const DNSService = require('./lib/dns-service');
const SSHManager = require('./lib/ssh-manager');
const FileManager = require('./lib/file-manager');
const logger = require('./lib/logger');
const SafetyGuard = require('./lib/safety-guard');
const { measureToolExecution, recordError } = require('./lib/metrics');
const { withOperationTimeout, withTimeout, TimeoutError } = require('./lib/timeout');
const dnsSchema = require('./schemas/dns-tools.json');

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

// Carregar tools do schema
const toolDefinitions = buildToolDefinitions();

/**
 * Constroi definicoes de tools para MCP
 */
function buildToolDefinitions() {
  return [
    // WHM Account Tools
    {
      name: 'whm.list_accounts',
      description: 'Lista todas as contas de hospedagem do servidor WHM',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'whm.create_account',
      description: 'Cria nova conta de hospedagem',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Nome de usuario' },
          domain: { type: 'string', description: 'Dominio principal' },
          password: { type: 'string', description: 'Senha' },
          email: { type: 'string', description: 'Email de contato' },
          package: { type: 'string', description: 'Plano de hospedagem' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da criacao' }
        },
        required: ['username', 'domain', 'password']
      }
    },
    {
      name: 'whm.suspend_account',
      description: 'Suspende conta de hospedagem',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          reason: { type: 'string' },
          confirmationToken: { type: 'string' }
        },
        required: ['username', 'reason']
      }
    },
    {
      name: 'whm.unsuspend_account',
      description: 'Reativa conta de hospedagem suspensa',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          confirmationToken: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['username']
      }
    },
    {
      name: 'whm.terminate_account',
      description: 'Remove conta permanentemente (PERIGOSO)',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          confirm: { type: 'boolean', description: 'Confirmacao obrigatoria' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao' },
          reason: { type: 'string', description: 'Motivo da exclusao' }
        },
        required: ['username', 'confirm']
      }
    },
    {
      name: 'whm.get_account_summary',
      description: 'Obtem resumo da conta',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string' }
        },
        required: ['username']
      }
    },
    {
      name: 'whm.server_status',
      description: 'Status do servidor WHM',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'whm.service_status',
      description: 'Status dos servicos',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'whm.restart_service',
      description: 'Reinicia servico via WHM',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string' },
          confirmationToken: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['service']
      }
    },
    {
      name: 'whm.list_domains',
      description: 'Lista dominios de uma conta',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string' }
        },
        required: ['username']
      }
    },

    // Domain Management Tools (Phase 1)
    {
      name: 'domain.get_user_data',
      description: 'Obtem dados do usuario do dominio (RF01)',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio' }
        },
        required: ['domain']
      }
    },
    {
      name: 'domain.get_all_info',
      description: 'Retorna informacoes de todos os dominios do servidor (paginado) (RF02)',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 100, description: 'Numero maximo de dominios por pagina (max 1000)' },
          offset: { type: 'integer', default: 0, description: 'Numero de dominios a pular (para paginacao)' },
          filter: { type: 'string', enum: ['addon', 'alias', 'subdomain', 'main'], description: 'Filtrar por tipo de dominio (opcional)' }
        },
        required: []
      }
    },
    {
      name: 'domain.get_owner',
      description: 'Obtem proprietario do dominio (RF03)',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio' }
        },
        required: ['domain']
      }
    },
    {
      name: 'domain.create_alias',
      description: 'Cria dominio alias (parked domain) (RF10)',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do novo dominio alias' },
          username: { type: 'string', description: 'Proprietario (usuario cPanel)' },
          target_domain: { type: 'string', description: 'Dominio alvo que sera apontado (opcional)' }
        },
        required: ['domain', 'username']
      }
    },
    {
      name: 'domain.create_subdomain',
      description: 'Cria subdominio (RF11)',
      inputSchema: {
        type: 'object',
        properties: {
          subdomain: { type: 'string', description: 'Nome do subdominio (sem o dominio pai)' },
          domain: { type: 'string', description: 'Dominio pai' },
          username: { type: 'string', description: 'Proprietario' },
          document_root: { type: 'string', description: 'Raiz do documento (path no servidor)' }
        },
        required: ['subdomain', 'domain', 'username']
      }
    },
    {
      name: 'domain.delete',
      description: 'Deleta dominio (addon/parked/subdomain) - OPERACAO DESTRUTIVA (RF12)',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio a deletar' },
          username: { type: 'string', description: 'Proprietario' },
          type: { type: 'string', enum: ['addon', 'parked', 'subdomain'], description: 'Tipo de dominio' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo detalhado da delecao' }
        },
        required: ['domain', 'username', 'type', 'confirmationToken', 'reason']
      }
    },
    {
      name: 'domain.resolve',
      description: 'Resolve nome de dominio para IP (RF13)',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio' }
        },
        required: ['domain']
      }
    },

    // Addon Domain Tools (Phase 2)
    {
      name: 'domain.addon.list',
      description: 'Lista todos os addon domains de um usuario (RF04)',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Usuario cPanel' }
        },
        required: ['username']
      }
    },
    {
      name: 'domain.addon.details',
      description: 'Obtem detalhes de um addon domain (RF05)',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do addon domain' },
          username: { type: 'string', description: 'Usuario cPanel' }
        },
        required: ['domain', 'username']
      }
    },
    {
      name: 'domain.addon.conversion_status',
      description: 'Obtem status de conversao de addon domain (RF06)',
      inputSchema: {
        type: 'object',
        properties: {
          conversion_id: { type: 'string', description: 'ID da conversao' }
        },
        required: ['conversion_id']
      }
    },
    {
      name: 'domain.addon.start_conversion',
      description: 'Inicia conversao de addon domain para conta independente [SAFETY GUARD] (RF07)',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Addon domain a converter' },
          username: { type: 'string', description: 'Usuario atual' },
          new_username: { type: 'string', description: 'Novo usuario para a conta' },
          confirmationToken: { type: 'string', description: 'Token de seguranca (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da conversao (min 10 chars)' }
        },
        required: ['domain', 'username', 'new_username', 'confirmationToken', 'reason']
      }
    },
    {
      name: 'domain.addon.conversion_details',
      description: 'Obtem detalhes completos de uma conversao (RF08)',
      inputSchema: {
        type: 'object',
        properties: {
          conversion_id: { type: 'string', description: 'ID da conversao' }
        },
        required: ['conversion_id']
      }
    },
    {
      name: 'domain.addon.list_conversions',
      description: 'Lista todas as conversoes de addon domains (RF09)',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },

    // Domain Authority and DNSSEC Tools (Phase 2)
    {
      name: 'domain.check_authority',
      description: 'Verifica se servidor e autoritativo para dominio (RF14)',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio' }
        },
        required: ['domain']
      }
    },
    {
      name: 'domain.get_ds_records',
      description: 'Obtem registros DS (DNSSEC) de dominios (RF17)',
      inputSchema: {
        type: 'object',
        properties: {
          domains: { type: 'array', items: { type: 'string' }, description: 'Lista de dominios (maximo 100)' }
        },
        required: ['domains']
      }
    },
    {
      name: 'domain.enable_nsec3',
      description: 'Habilita semantica NSEC3 (DNSSEC) para dominios [SAFETY GUARD] (RF19)',
      inputSchema: {
        type: 'object',
        properties: {
          domains: { type: 'array', items: { type: 'string' }, description: 'Lista de dominios (maximo 50)' },
          confirmationToken: { type: 'string', description: 'Token de seguranca (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da alteracao (min 10 chars)' }
        },
        required: ['domains', 'confirmationToken', 'reason']
      }
    },
    {
      name: 'domain.disable_nsec3',
      description: 'Desabilita NSEC3 para dominios [SAFETY GUARD] (RF20)',
      inputSchema: {
        type: 'object',
        properties: {
          domains: { type: 'array', items: { type: 'string' }, description: 'Lista de dominios (maximo 50)' },
          confirmationToken: { type: 'string', description: 'Token de seguranca (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da alteracao (min 10 chars)' }
        },
        required: ['domains', 'confirmationToken', 'reason']
      }
    },
    {
      name: 'domain.get_nsec3_status',
      description: 'Consulta status de operacao NSEC3 assincrona para polling (RF22)',
      inputSchema: {
        type: 'object',
        properties: {
          operation_id: { type: 'string', description: 'ID da operacao NSEC3' }
        },
        required: ['operation_id']
      }
    },
    {
      name: 'domain.update_userdomains',
      description: 'Atualiza arquivo /etc/userdomains [SAFETY GUARD] (RF21)',
      inputSchema: {
        type: 'object',
        properties: {
          confirmationToken: { type: 'string', description: 'Token de seguranca (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da atualizacao (min 10 chars)' }
        },
        required: ['confirmationToken', 'reason']
      }
    },

    // DNS Tools (CC-03)
    {
      name: 'dns.list_zones',
      description: 'Lista todas as zonas DNS do servidor',
      inputSchema: dnsSchema.tools['dns.list_zones'].inputSchema
    },
    {
      name: 'dns.get_zone',
      description: 'Obtem dump completo da zona DNS com suporte a filtros e otimizacao',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona (dominio)' },
          record_type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SOA', 'SRV', 'CAA'], description: 'Filtrar por tipo de registro (opcional)' },
          name_filter: { type: 'string', description: 'Filtrar por nome de registro (substring, opcional)' },
          max_records: { type: 'integer', default: 500, description: 'Limitar quantidade de registros retornados (default: 500, max: 2000)' },
          include_stats: { type: 'boolean', default: false, description: 'Incluir estatisticas de aninhamento de dominios (opcional)' }
        },
        required: ['zone']
      }
    },
    {
      name: 'dns.check_nested_domains',
      description: 'Verifica se uma zona DNS possui muitos subdominios aninhados (comum em WHM/cPanel)',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Dominio a verificar (ex: skillsit.com.br)' }
        },
        required: ['zone']
      }
    },
    {
      name: 'dns.search_record',
      description: 'Busca registros DNS especificos em uma zona (otimizado para economizar tokens)',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona (dominio)' },
          name: { type: 'string', description: 'Nome do registro a buscar (ex: prometheus, www, @)' },
          type: {
            type: 'array',
            items: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SOA', 'SRV', 'CAA'] },
            description: 'Tipos de registro a buscar (default: ["A", "AAAA"])'
          },
          matchMode: {
            type: 'string',
            enum: ['exact', 'contains', 'startsWith'],
            description: 'Modo de correspondencia (default: exact)'
          }
        },
        required: ['zone', 'name']
      }
    },
    {
      name: 'dns.add_record',
      description: 'Adiciona registro DNS na zona',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona' },
          type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR'] },
          name: { type: 'string', description: 'Nome do registro' },
          address: { type: 'string', description: 'IP para A/AAAA' },
          cname: { type: 'string', description: 'Target para CNAME' },
          exchange: { type: 'string', description: 'Mail server para MX' },
          preference: { type: 'integer', description: 'Prioridade MX' },
          txtdata: { type: 'string', description: 'Conteudo TXT' },
          nsdname: { type: 'string', description: 'Nameserver para NS' },
          ptrdname: { type: 'string', description: 'Hostname para PTR' },
          ttl: { type: 'integer', default: 14400 }
        },
        required: ['zone', 'type', 'name']
      }
    },
    {
      name: 'dns.edit_record',
      description: 'Edita registro DNS existente (suporta optimistic locking)',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string' },
          line: { type: 'integer', description: 'Numero da linha' },
          expected_content: { type: 'string', description: 'Conteudo esperado para verificacao' },
          address: { type: 'string' },
          cname: { type: 'string' },
          exchange: { type: 'string' },
          preference: { type: 'integer' },
          txtdata: { type: 'string' },
          ttl: { type: 'integer' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN) para edicoes destrutivas' },
          reason: { type: 'string', description: 'Motivo detalhado da edicao' }
        },
        required: ['zone', 'line']
      }
    },
    {
      name: 'dns.delete_record',
      description: 'Remove registro DNS da zona',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string' },
          line: { type: 'integer' },
          expected_content: { type: 'string', description: 'Conteudo esperado para verificacao' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da remocao' }
        },
        required: ['zone', 'line']
      }
    },
    {
      name: 'dns.reset_zone',
      description: 'Reseta zona para configuracao padrao',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string' },
          confirmationToken: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['zone']
      }
    },
    {
      name: 'dns.list_mx',
      description: 'Lista todos os registros MX configurados para um dominio (RF15)',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio' }
        },
        required: ['domain']
      }
    },
    {
      name: 'dns.add_mx',
      description: 'Adiciona novo registro MX para um dominio (RF16)',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio' },
          exchange: { type: 'string', description: 'Servidor de email' },
          priority: { type: 'integer', default: 10, description: 'Prioridade MX (opcional)' },
          alwaysaccept: { type: 'boolean', default: false, description: 'Sempre aceitar email (opcional)' }
        },
        required: ['domain', 'exchange']
      }
    },
    {
      name: 'dns.check_alias_available',
      description: 'Verifica se registro ALIAS DNS esta disponivel (RF18)',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona' },
          name: { type: 'string', description: 'Nome do registro' }
        },
        required: ['zone', 'name']
      }
    },

    // SSH Tools Seguras (CC-02)
    {
      name: 'system.restart_service',
      description: 'Reinicia servico do sistema (apenas allowlist: httpd, mysql, named, postfix, dovecot)',
      inputSchema: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            enum: ['httpd', 'mysql', 'named', 'postfix', 'dovecot', 'exim', 'nginx', 'pure-ftpd']
          },
          confirmationToken: { type: 'string', description: 'Token de confirmacao' },
          reason: { type: 'string', description: 'Motivo para reiniciar' }
        },
        required: ['service']
      }
    },
    {
      name: 'system.get_load',
      description: 'Obtem carga do servidor (CPU, memoria, disco)',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'log.read_last_lines',
      description: 'Le ultimas linhas de arquivo de log (apenas whitelist)',
      inputSchema: {
        type: 'object',
        properties: {
          logfile: { type: 'string', description: 'Caminho do arquivo de log' },
          lines: { type: 'integer', default: 50, description: 'Numero de linhas' }
        },
        required: ['logfile']
      }
    },

    // File Tools (AC05)
    {
      name: 'file.list',
      description: 'Lista arquivos de um diretorio',
      inputSchema: {
        type: 'object',
        properties: {
          cpanelUser: { type: 'string', description: 'Usuario cPanel' },
          path: { type: 'string', description: 'Caminho do diretorio' }
        },
        required: ['cpanelUser']
      }
    },
    {
      name: 'file.read',
      description: 'Le conteudo de arquivo',
      inputSchema: {
        type: 'object',
        properties: {
          cpanelUser: { type: 'string' },
          path: { type: 'string' }
        },
        required: ['cpanelUser', 'path']
      }
    },
    {
      name: 'file.write',
      description: 'Escreve conteudo em arquivo',
      inputSchema: {
        type: 'object',
        properties: {
          cpanelUser: { type: 'string' },
          path: { type: 'string' },
          content: { type: 'string' },
          encoding: { type: 'string', default: 'utf8' },
          create_dirs: { type: 'boolean', default: false },
          confirmationToken: { type: 'string', description: 'Token de confirmacao para escrita' },
          reason: { type: 'string', description: 'Motivo da alteracao' }
        },
        required: ['cpanelUser', 'path', 'content']
      }
    },
    {
      name: 'file.delete',
      description: 'Deleta arquivo',
      inputSchema: {
        type: 'object',
        properties: {
          cpanelUser: { type: 'string' },
          path: { type: 'string' },
          force: { type: 'boolean', default: false },
          confirmationToken: { type: 'string', description: 'Token de confirmacao para delecao' },
          reason: { type: 'string', description: 'Motivo da remocao' }
        },
        required: ['cpanelUser', 'path']
      }
    }
  ];
}

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
          // MCP Protocol initialization handshake (obrigatório para Claude Code)
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: {
                name: 'mcp-whm-cpanel',
                version: '1.0.0'
              },
              capabilities: {
                tools: {}
              }
            }
          };

        case 'tools/list':
          return this.handleToolsList(id);

        case 'tools/call':
          return await this.handleToolCall(id, params);

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
   * Executa tool especifica
   */
  async handleToolCall(id, params) {
    const { name, arguments: args } = params || {};

    if (!name) {
      return this.errorResponse(id, -32602, 'Invalid params', { reason: 'Tool name required' });
    }

    // Verificar se tool existe
    const tool = toolDefinitions.find(t => t.name === name);
    if (!tool) {
      return this.errorResponse(id, -32601, 'Tool not found', {
        tool: name,
        suggestion: 'Use system.restart_service, system.get_load, or log.read_last_lines'
      });
    }

    // Executar tool com medicao de tempo
    const executor = measureToolExecution(name, async () => {
      return await this.executeTool(name, args || {});
    });

    try {
      const result = await executor();

      // MCP Protocol 2024-11-05: tools/call deve retornar content array
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
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
   * Executa tool pelo nome
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

    // WHM Tools
    if (name.startsWith('whm.')) {
      return await this.executeWhmTool(name, enrichedArgs);
    }

    // Domain Tools (Phase 1)
    if (name.startsWith('domain.')) {
      return await this.executeDomainTool(name, enrichedArgs);
    }

    // DNS Tools
    if (name.startsWith('dns.')) {
      return await this.executeDnsTool(name, enrichedArgs);
    }

    // SSH/System Tools
    if (name.startsWith('system.') || name.startsWith('log.')) {
      return await this.executeSshTool(name, enrichedArgs);
    }

    // File Tools
    if (name.startsWith('file.')) {
      return await this.executeFileTool(name, enrichedArgs);
    }

    throw new Error(`Unknown tool category: ${name}`);
  }

  /**
   * Executa tools WHM
   */
  async executeWhmTool(name, args) {
    if (!this.whmService) {
      throw new Error('WHM service not configured');
    }

    switch (name) {
      case 'whm.list_accounts':
        return await withOperationTimeout(async () => {
          const result = await this.whmService.listAccounts();
          // result = {success: true, data: {acct: [...]}}
          const accounts = result?.data?.acct || [];
          return {
            success: true,
            data: {
              accounts: accounts,
              total: accounts.length
            }
          };
        }, 'whm.list_accounts');

      case 'whm.create_account':
        SafetyGuard.requireConfirmation('whm.create_account', args);
        return await withOperationTimeout(
          () => this.whmService.createAccount(args),
          'whm.create_account'
        );

      case 'whm.suspend_account':
        SafetyGuard.requireConfirmation('whm.suspend_account', args);
        return await withOperationTimeout(
          () => this.whmService.suspendAccount(args.username, args.reason),
          'whm.suspend_account'
        );

      case 'whm.unsuspend_account':
        SafetyGuard.requireConfirmation('whm.unsuspend_account', args);
        return await withOperationTimeout(
          () => this.whmService.unsuspendAccount(args.username),
          'whm.unsuspend_account'
        );

      case 'whm.terminate_account':
        if (!args.confirm) {
          throw new Error('Confirmation required to terminate account');
        }
        SafetyGuard.requireConfirmation('whm.terminate_account', args);
        return await withOperationTimeout(
          () => this.whmService.terminateAccount(args.username),
          'whm.terminate_account'
        );

      case 'whm.get_account_summary':
        return await withOperationTimeout(
          () => this.whmService.getAccountSummary(args.username),
          'whm.get_account_summary'
        );

      case 'whm.server_status':
        return await withOperationTimeout(
          () => this.whmService.getServerStatus(),
          'whm.server_status'
        );

      case 'whm.service_status':
        return await withOperationTimeout(
          () => this.whmService.getServiceStatus(),
          'whm.service_status'
        );

      case 'whm.restart_service':
        SafetyGuard.requireConfirmation('whm.restart_service', args);
        return await withOperationTimeout(
          () => this.whmService.restartService(args.service),
          'whm.restart_service'
        );

      case 'whm.list_domains':
        return await withOperationTimeout(
          () => this.whmService.listDomains(args.username),
          'whm.list_domains'
        );

      default:
        throw new Error(`Unknown WHM tool: ${name}`);
    }
  }

  /**
   * Executa tools de gerenciamento de domínios (Phase 1)
   */
  async executeDomainTool(name, args) {
    if (!this.whmService) {
      throw new Error('WHM service not configured');
    }

    switch (name) {
      case 'domain.get_user_data':
        return await withOperationTimeout(
          () => this.whmService.getDomainUserData(args.domain),
          'domain.get_user_data'
        );

      case 'domain.get_all_info':
        return await withOperationTimeout(
          () => this.whmService.getAllDomainInfo(args.limit, args.offset, args.filter),
          'domain.get_all_info'
        );

      case 'domain.get_owner':
        return await withOperationTimeout(
          () => this.whmService.getDomainOwner(args.domain),
          'domain.get_owner'
        );

      case 'domain.create_alias':
        return await withOperationTimeout(
          () => this.whmService.createParkedDomain(
            args.domain,
            args.username,
            args.target_domain
          ),
          'domain.create_alias'
        );

      case 'domain.create_subdomain':
        return await withOperationTimeout(
          () => this.whmService.createSubdomain(
            args.subdomain,
            args.domain,
            args.username,
            args.document_root
          ),
          'domain.create_subdomain'
        );

      case 'domain.delete':
        SafetyGuard.requireConfirmation('domain.delete', args);
        return await withOperationTimeout(
          () => this.whmService.deleteDomain(
            args.domain,
            args.username,
            args.type,
            true // confirmed=true because SafetyGuard already validated
          ),
          'domain.delete'
        );

      case 'domain.resolve':
        return await withOperationTimeout(
          () => this.whmService.resolveDomainName(args.domain),
          'domain.resolve'
        );

      // Addon Domain Tools (Phase 2)
      case 'domain.addon.list':
        return await withOperationTimeout(
          () => this.whmService.listAddonDomains(args.username),
          'domain.addon.list'
        );

      case 'domain.addon.details':
        return await withOperationTimeout(
          () => this.whmService.getAddonDomainDetails(args.domain, args.username),
          'domain.addon.details'
        );

      case 'domain.addon.conversion_status':
        return await withOperationTimeout(
          () => this.whmService.getConversionStatus(args.conversion_id),
          'domain.addon.conversion_status'
        );

      case 'domain.addon.start_conversion':
        SafetyGuard.requireConfirmation('domain.addon.start_conversion', args);
        return await withOperationTimeout(
          () => this.whmService.initiateAddonConversion(args),
          'domain.addon.start_conversion'
        );

      case 'domain.addon.conversion_details':
        return await withOperationTimeout(
          () => this.whmService.getConversionDetails(args.conversion_id),
          'domain.addon.conversion_details'
        );

      case 'domain.addon.list_conversions':
        return await withOperationTimeout(
          () => this.whmService.listConversions(),
          'domain.addon.list_conversions'
        );

      // Domain Authority and DNSSEC Tools (Phase 2)
      case 'domain.check_authority':
        return await withOperationTimeout(
          () => this.whmService.hasLocalAuthority(args.domain),
          'domain.check_authority'
        );

      case 'domain.get_ds_records':
        return await withOperationTimeout(
          () => this.whmService.getDSRecords(args.domains),
          'domain.get_ds_records'
        );

      case 'domain.enable_nsec3':
        SafetyGuard.requireConfirmation('domain.enable_nsec3', args);
        // Dynamic timeout: 60s + (30s * num_domains), max 600s
        const enableTimeout = Math.min(60000 + (30000 * (args.domains?.length || 1)), 600000);
        return await withOperationTimeout(
          () => this.whmService.setNSEC3ForDomains(args.domains),
          'domain.enable_nsec3',
          enableTimeout
        );

      case 'domain.disable_nsec3':
        SafetyGuard.requireConfirmation('domain.disable_nsec3', args);
        // Dynamic timeout: 60s + (30s * num_domains), max 600s
        const disableTimeout = Math.min(60000 + (30000 * (args.domains?.length || 1)), 600000);
        return await withOperationTimeout(
          () => this.whmService.unsetNSEC3ForDomains(args.domains),
          'domain.disable_nsec3',
          disableTimeout
        );

      case 'domain.get_nsec3_status':
        return await withOperationTimeout(
          () => this.whmService.getNsec3Status(args.operation_id),
          'domain.get_nsec3_status'
        );

      case 'domain.update_userdomains':
        SafetyGuard.requireConfirmation('domain.update_userdomains', args);
        return await withOperationTimeout(
          () => this.whmService.updateUserdomains(),
          'domain.update_userdomains'
        );

      default:
        throw new Error(`Unknown Domain tool: ${name}`);
    }
  }

  /**
   * Executa tools DNS (CC-03, CC-04)
   */
  async executeDnsTool(name, args) {
    if (!this.dnsService) {
      throw new Error('DNS service not configured');
    }

    switch (name) {
      case 'dns.list_zones':
        return await withOperationTimeout(
          () => this.dnsService.listZones(),
          'dns.list_zones'
        );

      case 'dns.get_zone':
        return await withOperationTimeout(
          () => this.dnsService.getZone(args.zone, {
            record_type: args.record_type,
            name_filter: args.name_filter,
            max_records: args.max_records,
            include_stats: args.include_stats
          }),
          'dns.get_zone'
        );

      case 'dns.check_nested_domains':
        return await withOperationTimeout(
          () => this.dnsService.checkNestedDomains(args.zone),
          'dns.check_nested_domains'
        );

      case 'dns.search_record':
        return await withOperationTimeout(
          () => this.dnsService.searchRecord(
            args.zone,
            args.name,
            args.type || ['A', 'AAAA'],
            args.matchMode || 'exact'
          ),
          'dns.search_record'
        );

      case 'dns.add_record':
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
          'dns.add_record'
        );

      case 'dns.edit_record':
        SafetyGuard.requireConfirmation('dns.edit_record', args);
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
          'dns.edit_record'
        );

      case 'dns.delete_record':
        SafetyGuard.requireConfirmation('dns.delete_record', args);
        return await withOperationTimeout(
          () => this.dnsService.deleteRecord(args.zone, args.line, args.expected_content),
          'dns.delete_record'
        );

      case 'dns.reset_zone':
        SafetyGuard.requireConfirmation('dns.reset_zone', args);
        return await withOperationTimeout(
          () => this.dnsService.resetZone(args.zone),
          'dns.reset_zone'
        );

      case 'dns.list_mx':
        return await withOperationTimeout(
          () => this.whmService.listMXRecords(args.domain),
          'dns.list_mx'
        );

      case 'dns.add_mx':
        return await withOperationTimeout(
          () => this.whmService.saveMXRecord(
            args.domain,
            args.exchange,
            args.priority,
            args.alwaysaccept
          ),
          'dns.add_mx'
        );

      case 'dns.check_alias_available':
        return await withOperationTimeout(
          () => this.whmService.isAliasAvailable(args.zone, args.name),
          'dns.check_alias_available'
        );

      default:
        throw new Error(`Unknown DNS tool: ${name}`);
    }
  }

  /**
   * Executa tools SSH seguras (CC-02)
   */
  async executeSshTool(name, args) {
    if (!this.sshManager) {
      throw new Error('SSH service not configured');
    }

    switch (name) {
      case 'system.restart_service':
        SafetyGuard.requireConfirmation('system.restart_service', args);
        return await withOperationTimeout(
          () => this.sshManager.restartService(args.service),
          'system.restart_service'
        );

      case 'system.get_load':
        return await withOperationTimeout(
          () => this.sshManager.getSystemLoad(),
          'system.get_load'
        );

      case 'log.read_last_lines':
        return await withOperationTimeout(
          () => this.sshManager.readLogLines(args.logfile, args.lines || 50),
          'log.read_last_lines'
        );

      default:
        throw new Error(`Unknown SSH tool: ${name}`);
    }
  }

  /**
   * Executa tools de arquivo (AC05)
   */
  async executeFileTool(name, args) {
    if (!this.fileManager) {
      throw new Error('File manager not configured');
    }

    switch (name) {
      case 'file.list':
        return await withOperationTimeout(
          () => this.fileManager.listDirectory(args.cpanelUser, args.path),
          'file.list'
        );

      case 'file.read':
        return await withOperationTimeout(
          () => this.fileManager.readFile(args.cpanelUser, args.path),
          'file.read'
        );

      case 'file.write':
        SafetyGuard.requireConfirmation('file.write', args);
        return await withOperationTimeout(
          () => this.fileManager.writeFile(args.cpanelUser, args.path, args.content, {
            encoding: args.encoding,
            createDirs: args.create_dirs
          }),
          'file.write'
        );

      case 'file.delete':
        SafetyGuard.requireConfirmation('file.delete', args);
        return await withOperationTimeout(
          () => this.fileManager.deleteFile(args.cpanelUser, args.path, {
            force: args.force
          }),
          'file.delete'
        );

      default:
        throw new Error(`Unknown file tool: ${name}`);
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
