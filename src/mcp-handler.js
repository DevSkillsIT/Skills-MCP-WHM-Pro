/**
 * MCP Handler - Processa requisicoes JSON-RPC 2.0
 * Implementa AC02: Lista de Tools MCP
 */

const WHMService = require('./lib/whm-service');
const DNSService = require('./lib/dns-service');
const SSHManager = require('./lib/ssh-manager');
const FileManager = require('./lib/file-manager');
const logger = require('./lib/logger');
const SafetyGuard = require('./lib/safety-guard');
const { measureToolExecution, recordError } = require('./lib/metrics');
const { withOperationTimeout, TimeoutError } = require('./lib/timeout');
const dnsSchema = require('./schemas/dns-tools.json');

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

    // DNS Tools (CC-03)
    {
      name: 'dns.list_zones',
      description: 'Lista todas as zonas DNS do servidor',
      inputSchema: dnsSchema.tools['dns.list_zones'].inputSchema
    },
    {
      name: 'dns.get_zone',
      description: 'Obtem dump completo da zona DNS',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona (dominio)' }
        },
        required: ['zone']
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
   */
  async handleRequest(request) {
    const { jsonrpc, method, params, id } = request;

    // Validar formato JSON-RPC
    if (jsonrpc !== '2.0') {
      return this.errorResponse(id, -32600, 'Invalid Request', { expected: '2.0' });
    }

    logger.debug(`MCP Request: ${method}`, { id });

    try {
      // Rotear para handler apropriado
      switch (method) {
        case 'tools/list':
          return this.handleToolsList(id);

        case 'tools/call':
          return await this.handleToolCall(id, params);

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

      return {
        jsonrpc: '2.0',
        id,
        result
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
   */
  async executeTool(name, args) {
    // WHM Tools
    if (name.startsWith('whm.')) {
      return await this.executeWhmTool(name, args);
    }

    // DNS Tools
    if (name.startsWith('dns.')) {
      return await this.executeDnsTool(name, args);
    }

    // SSH/System Tools
    if (name.startsWith('system.') || name.startsWith('log.')) {
      return await this.executeSshTool(name, args);
    }

    // File Tools
    if (name.startsWith('file.')) {
      return await this.executeFileTool(name, args);
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
          const accounts = await this.whmService.listAccounts();
          return {
            success: true,
            data: {
              accounts: accounts.acct || [],
              total: (accounts.acct || []).length
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
          () => this.dnsService.getZone(args.zone),
          'dns.get_zone'
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
