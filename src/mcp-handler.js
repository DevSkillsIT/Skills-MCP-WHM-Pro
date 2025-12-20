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

// Carregar tools do schema
const toolDefinitions = buildToolDefinitions();

/**
 * Constroi definicoes de tools para MCP
 * Descricoes claras e detalhadas para guiar o modelo na escolha correta da tool
 */
function buildToolDefinitions() {
  return [
    // ==========================================
    // WHM ACCOUNT TOOLS - Gerenciamento de Contas
    // ==========================================
    {
      name: 'whm_list_accounts',
      description: 'Lista todas as contas de hospedagem do servidor WHM. USE para: ver todas as contas, verificar quantas contas existem, encontrar uma conta pelo nome. Retorna: username, domain, email, package, suspended status.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'whm_create_account',
      description: 'Cria nova conta de hospedagem cPanel. [SAFETY GUARD] Requer confirmationToken. USE para: provisionar novo cliente, criar conta de teste.',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Nome de usuario (max 8 chars, sem espacos)' },
          domain: { type: 'string', description: 'Dominio principal da conta (ex: exemplo.com.br)' },
          password: { type: 'string', description: 'Senha da conta (min 8 chars, complexidade requerida)' },
          email: { type: 'string', description: 'Email de contato do proprietario' },
          package: { type: 'string', description: 'Plano de hospedagem (ex: default, business, enterprise)' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da criacao (auditoria)' }
        },
        required: ['username', 'domain', 'password']
      }
    },
    {
      name: 'whm_suspend_account',
      description: 'Suspende conta de hospedagem (bloqueia acesso). [SAFETY GUARD] USE para: inadimplencia, violacao de termos, manutencao. Conta fica inacessivel mas dados preservados.',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Username da conta a suspender' },
          reason: { type: 'string', description: 'Motivo da suspensao (obrigatorio, visivel ao cliente)' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' }
        },
        required: ['username', 'reason']
      }
    },
    {
      name: 'whm_unsuspend_account',
      description: 'Reativa conta de hospedagem suspensa. [SAFETY GUARD] USE para: cliente regularizou pagamento, problema resolvido. Restaura acesso completo.',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Username da conta a reativar' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da reativacao (auditoria)' }
        },
        required: ['username']
      }
    },
    {
      name: 'whm_terminate_account',
      description: 'Remove conta PERMANENTEMENTE. [OPERACAO DESTRUTIVA] [SAFETY GUARD] CUIDADO: Deleta todos os arquivos, emails, databases. Acao IRREVERSIVEL. USE apenas: cancelamento definitivo.',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Username da conta a remover' },
          confirm: { type: 'boolean', description: 'Confirmacao OBRIGATORIA (deve ser true)' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da remocao (auditoria, obrigatorio)' }
        },
        required: ['username', 'confirm']
      }
    },
    {
      name: 'whm_get_account_summary',
      description: 'Obtem resumo completo de UMA conta especifica. USE para: verificar detalhes de um cliente, ver uso de recursos, diagnosticar problemas. Retorna: dominio, email, package, disco, bandwidth, suspended.',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Username da conta (exato)' }
        },
        required: ['username']
      }
    },
    {
      name: 'whm_server_status',
      description: 'Status geral do servidor WHM. USE para: verificar saude do servidor, ver load average, uptime, versao WHM.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'whm_service_status',
      description: 'Status de todos os servicos do servidor (Apache, MySQL, FTP, Email, etc). USE para: diagnosticar problemas, verificar se servicos estao rodando.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'whm_restart_service',
      description: 'Reinicia servico do sistema via WHM. [SAFETY GUARD] USE para: aplicar configuracoes, resolver travamentos. Servicos permitidos: httpd, mysql, named, postfix, dovecot, exim, nginx, pure-ftpd.',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string', enum: ['httpd', 'mysql', 'named', 'postfix', 'dovecot', 'exim', 'nginx', 'pure-ftpd'], description: 'Nome do servico a reiniciar' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo do restart (auditoria)' }
        },
        required: ['service']
      }
    },
    {
      name: 'whm_list_domains',
      description: 'Lista TODOS os dominios de uma conta especifica (principal + addon + subdominios). USE para: ver quais dominios um cliente tem, verificar configuracao de dominio.',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Username da conta cPanel' }
        },
        required: ['username']
      }
    },

    // ==========================================
    // DOMAIN TOOLS - Gerenciamento de Dominios
    // ==========================================
    {
      name: 'domain_get_user_data',
      description: 'Obtem dados COMPLETOS de UM dominio especifico (usuario, docroot, IP, PHP version, etc). USE ESTA TOOL quando souber o nome exato do dominio. Mais eficiente que domain_get_all_info para consulta unica.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome exato do dominio (ex: servidor.one)' }
        },
        required: ['domain']
      }
    },
    {
      name: 'domain_get_all_info',
      description: 'Retorna informacoes de todos os dominios do servidor (paginado). USE domain_filter para FILTRAR por nome (ex: domain_filter="servidor" retorna apenas dominios contendo "servidor"). Sem domain_filter retorna TODOS (pode ser muitos). Para info de UM dominio especifico, prefira domain_get_user_data.',
      inputSchema: {
        type: 'object',
        properties: {
          domain_filter: { type: 'string', description: 'IMPORTANTE: Filtrar por nome do dominio (substring, case-insensitive). Ex: "servidor" retorna "servidor.one", "api.servidor.one", etc. SEMPRE use quando buscar dominio especifico!' },
          limit: { type: 'integer', default: 100, description: 'Numero maximo de dominios por pagina (max 1000)' },
          offset: { type: 'integer', default: 0, description: 'Numero de dominios a pular (para paginacao)' },
          filter: { type: 'string', enum: ['addon', 'alias', 'subdomain', 'main'], description: 'Filtrar por tipo de dominio (opcional)' }
        },
        required: []
      }
    },
    {
      name: 'domain_get_owner',
      description: 'Obtem proprietario (username cPanel) de um dominio. USE para: descobrir quem eh dono de um dominio, antes de fazer alteracoes.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio' }
        },
        required: ['domain']
      }
    },
    {
      name: 'domain_create_alias',
      description: 'Cria dominio alias (parked domain) - aponta para mesmo conteudo de outro dominio. USE para: dominio alternativo, redirecionar dominio adicional.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do novo dominio alias (ex: novodominio.com)' },
          username: { type: 'string', description: 'Proprietario - usuario cPanel que tera o dominio' },
          target_domain: { type: 'string', description: 'Dominio alvo que sera apontado (opcional, default: dominio principal da conta)' }
        },
        required: ['domain', 'username']
      }
    },
    {
      name: 'domain_create_subdomain',
      description: 'Cria subdominio (ex: blog.exemplo.com). USE para: criar subdominios, separar aplicacoes.',
      inputSchema: {
        type: 'object',
        properties: {
          subdomain: { type: 'string', description: 'Nome do subdominio SEM o dominio pai (ex: "blog" para blog.exemplo.com)' },
          domain: { type: 'string', description: 'Dominio pai (ex: "exemplo.com")' },
          username: { type: 'string', description: 'Usuario cPanel proprietario' },
          document_root: { type: 'string', description: 'Raiz do documento - path no servidor (opcional, auto-gerado se omitido)' }
        },
        required: ['subdomain', 'domain', 'username']
      }
    },
    {
      name: 'domain_delete',
      description: 'Deleta dominio (addon/parked/subdomain). [OPERACAO DESTRUTIVA] [SAFETY GUARD] CUIDADO: Remove configuracao do dominio. Arquivos no docroot NAO sao deletados automaticamente.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio a deletar' },
          username: { type: 'string', description: 'Usuario cPanel proprietario' },
          type: { type: 'string', enum: ['addon', 'parked', 'subdomain'], description: 'Tipo de dominio (obrigatorio)' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo detalhado da delecao (auditoria, min 10 chars)' }
        },
        required: ['domain', 'username', 'type', 'confirmationToken', 'reason']
      }
    },
    {
      name: 'domain_resolve',
      description: 'Resolve nome de dominio para IP via DNS. USE para: verificar para onde dominio aponta, diagnosticar problemas de DNS.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio a resolver' }
        },
        required: ['domain']
      }
    },

    // Addon Domain Tools
    {
      name: 'domain_addon_list',
      description: 'Lista todos os addon domains de um usuario cPanel. USE para: ver dominios adicionais de um cliente.',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Usuario cPanel' }
        },
        required: ['username']
      }
    },
    {
      name: 'domain_addon_details',
      description: 'Obtem detalhes completos de um addon domain (docroot, subdominio associado, etc).',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do addon domain' },
          username: { type: 'string', description: 'Usuario cPanel proprietario' }
        },
        required: ['domain', 'username']
      }
    },
    {
      name: 'domain_addon_conversion_status',
      description: 'Obtem status de conversao de addon domain para conta independente. USE para: acompanhar processo de conversao em andamento.',
      inputSchema: {
        type: 'object',
        properties: {
          conversion_id: { type: 'string', description: 'ID da conversao (retornado por domain_addon_start_conversion)' }
        },
        required: ['conversion_id']
      }
    },
    {
      name: 'domain_addon_start_conversion',
      description: 'Inicia conversao de addon domain para conta cPanel independente. [SAFETY GUARD] USE para: cliente quer conta separada, migrar addon para conta propria.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Addon domain a converter' },
          username: { type: 'string', description: 'Usuario cPanel atual (dono do addon)' },
          new_username: { type: 'string', description: 'Novo username para a conta independente' },
          confirmationToken: { type: 'string', description: 'Token de seguranca (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da conversao (auditoria, min 10 chars)' }
        },
        required: ['domain', 'username', 'new_username', 'confirmationToken', 'reason']
      }
    },
    {
      name: 'domain_addon_conversion_details',
      description: 'Obtem detalhes completos de uma conversao de addon domain (logs, progresso, erros).',
      inputSchema: {
        type: 'object',
        properties: {
          conversion_id: { type: 'string', description: 'ID da conversao' }
        },
        required: ['conversion_id']
      }
    },
    {
      name: 'domain_addon_list_conversions',
      description: 'Lista todas as conversoes de addon domains (historico completo).',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },

    // Domain Authority and DNSSEC Tools
    {
      name: 'domain_check_authority',
      description: 'Verifica se este servidor WHM eh autoritativo para um dominio (se controla o DNS). USE para: verificar se podemos editar DNS do dominio.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio a verificar' }
        },
        required: ['domain']
      }
    },
    {
      name: 'domain_get_ds_records',
      description: 'Obtem registros DS (Delegation Signer) para DNSSEC. USE para: configurar DNSSEC no registrar, verificar configuracao DNSSEC.',
      inputSchema: {
        type: 'object',
        properties: {
          domains: { type: 'array', items: { type: 'string' }, description: 'Lista de dominios (maximo 100)' }
        },
        required: ['domains']
      }
    },
    {
      name: 'domain_enable_nsec3',
      description: 'Habilita NSEC3 (DNSSEC aprimorado) para dominios. [SAFETY GUARD] NSEC3 previne zone walking attacks. Operacao pode demorar.',
      inputSchema: {
        type: 'object',
        properties: {
          domains: { type: 'array', items: { type: 'string' }, description: 'Lista de dominios (maximo 50)' },
          confirmationToken: { type: 'string', description: 'Token de seguranca (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da alteracao (auditoria, min 10 chars)' }
        },
        required: ['domains', 'confirmationToken', 'reason']
      }
    },
    {
      name: 'domain_disable_nsec3',
      description: 'Desabilita NSEC3 para dominios (volta para NSEC padrao). [SAFETY GUARD]',
      inputSchema: {
        type: 'object',
        properties: {
          domains: { type: 'array', items: { type: 'string' }, description: 'Lista de dominios (maximo 50)' },
          confirmationToken: { type: 'string', description: 'Token de seguranca (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da alteracao (auditoria, min 10 chars)' }
        },
        required: ['domains', 'confirmationToken', 'reason']
      }
    },
    {
      name: 'domain_get_nsec3_status',
      description: 'Consulta status de operacao NSEC3 assincrona (polling). USE para: acompanhar operacao em andamento.',
      inputSchema: {
        type: 'object',
        properties: {
          operation_id: { type: 'string', description: 'ID da operacao NSEC3' }
        },
        required: ['operation_id']
      }
    },
    {
      name: 'domain_update_userdomains',
      description: 'Atualiza arquivo /etc/userdomains (sincroniza mapeamento dominio->usuario). [SAFETY GUARD] USE apenas: corrigir inconsistencias, apos migracao.',
      inputSchema: {
        type: 'object',
        properties: {
          confirmationToken: { type: 'string', description: 'Token de seguranca (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da atualizacao (auditoria, min 10 chars)' }
        },
        required: ['confirmationToken', 'reason']
      }
    },

    // ==========================================
    // DNS TOOLS - Gerenciamento de Zonas DNS
    // ==========================================
    {
      name: 'dns_list_zones',
      description: 'Lista todas as zonas DNS do servidor. USE para: ver todos os dominios com DNS gerenciado, encontrar zona para editar.',
      inputSchema: dnsSchema.tools['dns_list_zones'].inputSchema
    },
    {
      name: 'dns_get_zone',
      description: 'Obtem TODOS os registros de uma zona DNS (dump completo). USE record_type ou name_filter para filtrar. CUIDADO: zonas grandes podem ter muitos registros, use filtros!',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona/dominio (ex: exemplo.com.br)' },
          record_type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SOA', 'SRV', 'CAA'], description: 'Filtrar por tipo de registro (ex: A, MX, TXT)' },
          name_filter: { type: 'string', description: 'Filtrar por nome de registro (substring). Ex: "www" encontra www, www2, api-www' },
          max_records: { type: 'integer', default: 500, description: 'Limite de registros retornados (default: 500, max: 2000)' },
          include_stats: { type: 'boolean', default: false, description: 'Incluir estatisticas de subdominios aninhados' }
        },
        required: ['zone']
      }
    },
    {
      name: 'dns_check_nested_domains',
      description: 'Verifica quantidade de subdominios aninhados em uma zona. USE para: diagnosticar zonas complexas, antes de grandes alteracoes.',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Dominio a verificar (ex: skillsit.com.br)' }
        },
        required: ['zone']
      }
    },
    {
      name: 'dns_search_record',
      description: 'Busca registros DNS especificos em uma zona (otimizado, economiza tokens). USE ESTA TOOL para encontrar registro especifico ao inves de dns_get_zone completo.',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona/dominio' },
          name: { type: 'string', description: 'Nome do registro a buscar (ex: www, @, mail, prometheus)' },
          type: {
            type: 'array',
            items: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SOA', 'SRV', 'CAA'] },
            description: 'Tipos de registro a buscar (default: ["A", "AAAA"])'
          },
          matchMode: {
            type: 'string',
            enum: ['exact', 'contains', 'startsWith'],
            description: 'Modo de busca: exact (padrao), contains, startsWith'
          }
        },
        required: ['zone', 'name']
      }
    },
    {
      name: 'dns_add_record',
      description: 'Adiciona NOVO registro DNS na zona. USE para: criar registro A, AAAA, CNAME, MX, TXT, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona/dominio' },
          type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR'], description: 'Tipo do registro' },
          name: { type: 'string', description: 'Nome do registro (ex: www, @, mail)' },
          address: { type: 'string', description: 'IP para registros A/AAAA' },
          cname: { type: 'string', description: 'Target para CNAME (ex: outro.dominio.com.)' },
          exchange: { type: 'string', description: 'Servidor de email para MX' },
          preference: { type: 'integer', description: 'Prioridade MX (menor = maior prioridade)' },
          txtdata: { type: 'string', description: 'Conteudo para registro TXT (SPF, DKIM, verificacao, etc)' },
          nsdname: { type: 'string', description: 'Nameserver para NS' },
          ptrdname: { type: 'string', description: 'Hostname para PTR (reverso)' },
          ttl: { type: 'integer', default: 14400, description: 'TTL em segundos (default: 14400 = 4 horas)' }
        },
        required: ['zone', 'type', 'name']
      }
    },
    {
      name: 'dns_edit_record',
      description: 'Edita registro DNS existente. [SAFETY GUARD] Requer numero da linha (use dns_search_record primeiro). Suporta optimistic locking via expected_content.',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona/dominio' },
          line: { type: 'integer', description: 'Numero da linha do registro (obter via dns_search_record)' },
          expected_content: { type: 'string', description: 'Conteudo esperado para verificacao (previne edicao de registro errado)' },
          address: { type: 'string', description: 'Novo IP para A/AAAA' },
          cname: { type: 'string', description: 'Novo target para CNAME' },
          exchange: { type: 'string', description: 'Novo servidor MX' },
          preference: { type: 'integer', description: 'Nova prioridade MX' },
          txtdata: { type: 'string', description: 'Novo conteudo TXT' },
          ttl: { type: 'integer', description: 'Novo TTL' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da edicao (auditoria)' }
        },
        required: ['zone', 'line']
      }
    },
    {
      name: 'dns_delete_record',
      description: 'Remove registro DNS da zona. [OPERACAO DESTRUTIVA] [SAFETY GUARD] CUIDADO: Pode afetar funcionamento de servicos!',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona/dominio' },
          line: { type: 'integer', description: 'Numero da linha do registro (obter via dns_search_record)' },
          expected_content: { type: 'string', description: 'Conteudo esperado para verificacao (previne delecao de registro errado)' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da remocao (auditoria)' }
        },
        required: ['zone', 'line']
      }
    },
    {
      name: 'dns_reset_zone',
      description: 'Reseta zona DNS para configuracao padrao. [OPERACAO DESTRUTIVA] [SAFETY GUARD] CUIDADO: Remove TODOS os registros customizados!',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona/dominio' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo do reset (auditoria)' }
        },
        required: ['zone']
      }
    },
    {
      name: 'dns_list_mx',
      description: 'Lista todos os registros MX de um dominio (servidores de email). USE para: verificar configuracao de email, diagnosticar problemas de email.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio' }
        },
        required: ['domain']
      }
    },
    {
      name: 'dns_add_mx',
      description: 'Adiciona novo registro MX para um dominio. USE para: configurar servidor de email, adicionar backup MX.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio' },
          exchange: { type: 'string', description: 'Servidor de email (ex: mail.exemplo.com)' },
          priority: { type: 'integer', default: 10, description: 'Prioridade MX (menor = maior prioridade). Default: 10' },
          alwaysaccept: { type: 'boolean', default: false, description: 'Sempre aceitar email para este MX' }
        },
        required: ['domain', 'exchange']
      }
    },
    {
      name: 'dns_check_alias_available',
      description: 'Verifica se um nome de registro ALIAS esta disponivel na zona. USE para: antes de criar registro, verificar se nome ja existe.',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona/dominio' },
          name: { type: 'string', description: 'Nome do registro a verificar' }
        },
        required: ['zone', 'name']
      }
    },

    // ==========================================
    // SYSTEM TOOLS - Gerenciamento do Servidor
    // ==========================================
    {
      name: 'system_restart_service',
      description: 'Reinicia servico do sistema. [SAFETY GUARD] Apenas servicos permitidos: httpd (Apache), mysql, named (DNS), postfix, dovecot, exim, nginx, pure-ftpd.',
      inputSchema: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            enum: ['httpd', 'mysql', 'named', 'postfix', 'dovecot', 'exim', 'nginx', 'pure-ftpd'],
            description: 'Servico a reiniciar'
          },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo do restart (auditoria)' }
        },
        required: ['service']
      }
    },
    {
      name: 'system_get_load',
      description: 'Obtem metricas de carga do servidor: CPU (load average), memoria (RAM), disco. USE para: diagnosticar lentidao, monitorar recursos.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'log_read_last_lines',
      description: 'Le ultimas linhas de arquivo de log do sistema. Apenas arquivos permitidos (whitelist de seguranca). USE para: diagnosticar erros, ver logs recentes.',
      inputSchema: {
        type: 'object',
        properties: {
          logfile: { type: 'string', description: 'Caminho do arquivo de log (ex: /var/log/messages, /usr/local/apache/logs/error_log)' },
          lines: { type: 'integer', default: 50, description: 'Numero de linhas a retornar (default: 50)' }
        },
        required: ['logfile']
      }
    },

    // ==========================================
    // FILE TOOLS - Gerenciamento de Arquivos
    // ==========================================
    {
      name: 'file_list',
      description: 'Lista arquivos de um diretorio de usuario cPanel. USE para: ver conteudo de pasta, encontrar arquivos.',
      inputSchema: {
        type: 'object',
        properties: {
          cpanelUser: { type: 'string', description: 'Usuario cPanel (dono dos arquivos)' },
          path: { type: 'string', description: 'Caminho relativo ao home do usuario (ex: public_html, public_html/images). Default: raiz do home' }
        },
        required: ['cpanelUser']
      }
    },
    {
      name: 'file_read',
      description: 'Le conteudo de arquivo de usuario cPanel. USE para: ver configuracao, ler codigo, diagnosticar problemas.',
      inputSchema: {
        type: 'object',
        properties: {
          cpanelUser: { type: 'string', description: 'Usuario cPanel (dono do arquivo)' },
          path: { type: 'string', description: 'Caminho do arquivo relativo ao home (ex: public_html/index.php)' }
        },
        required: ['cpanelUser', 'path']
      }
    },
    {
      name: 'file_write',
      description: 'Escreve/sobrescreve conteudo em arquivo. [SAFETY GUARD] CUIDADO: Sobrescreve arquivo existente!',
      inputSchema: {
        type: 'object',
        properties: {
          cpanelUser: { type: 'string', description: 'Usuario cPanel' },
          path: { type: 'string', description: 'Caminho do arquivo' },
          content: { type: 'string', description: 'Conteudo a escrever' },
          encoding: { type: 'string', default: 'utf8', description: 'Encoding do arquivo (default: utf8)' },
          create_dirs: { type: 'boolean', default: false, description: 'Criar diretorios pais se nao existirem' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da escrita (auditoria)' }
        },
        required: ['cpanelUser', 'path', 'content']
      }
    },
    {
      name: 'file_delete',
      description: 'Deleta arquivo de usuario cPanel. [OPERACAO DESTRUTIVA] [SAFETY GUARD] CUIDADO: Acao IRREVERSIVEL!',
      inputSchema: {
        type: 'object',
        properties: {
          cpanelUser: { type: 'string', description: 'Usuario cPanel' },
          path: { type: 'string', description: 'Caminho do arquivo a deletar' },
          force: { type: 'boolean', default: false, description: 'Forcar delecao sem confirmacao adicional' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da delecao (auditoria)' }
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
                tools: {},
                prompts: {}
              }
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
    const { name, arguments: args } = params || {};

    if (!name) {
      return this.errorResponse(id, -32602, 'Invalid params', { reason: 'Tool name required' });
    }

    // Verificar se tool existe
    const tool = toolDefinitions.find(t => t.name === name);
    if (!tool) {
      return this.errorResponse(id, -32601, 'Tool not found', {
        tool: name,
        suggestion: 'Use system_restart_service, system_get_load, or log_read_last_lines'
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
    if (name.startsWith('whm_')) {
      return await this.executeWhmTool(name, enrichedArgs);
    }

    // Domain Tools (Phase 1)
    if (name.startsWith('domain_')) {
      return await this.executeDomainTool(name, enrichedArgs);
    }

    // DNS Tools
    if (name.startsWith('dns_')) {
      return await this.executeDnsTool(name, enrichedArgs);
    }

    // SSH/System Tools
    if (name.startsWith('system_') || name.startsWith('log_')) {
      return await this.executeSshTool(name, enrichedArgs);
    }

    // File Tools
    if (name.startsWith('file_')) {
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
      case 'whm_list_accounts':
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
        }, 'whm_list_accounts');

      case 'whm_create_account':
        SafetyGuard.requireConfirmation('whm_create_account', args);
        return await withOperationTimeout(
          () => this.whmService.createAccount(args),
          'whm_create_account'
        );

      case 'whm_suspend_account':
        SafetyGuard.requireConfirmation('whm_suspend_account', args);
        return await withOperationTimeout(
          () => this.whmService.suspendAccount(args.username, args.reason),
          'whm_suspend_account'
        );

      case 'whm_unsuspend_account':
        SafetyGuard.requireConfirmation('whm_unsuspend_account', args);
        return await withOperationTimeout(
          () => this.whmService.unsuspendAccount(args.username),
          'whm_unsuspend_account'
        );

      case 'whm_terminate_account':
        if (!args.confirm) {
          throw new Error('Confirmation required to terminate account');
        }
        SafetyGuard.requireConfirmation('whm_terminate_account', args);
        return await withOperationTimeout(
          () => this.whmService.terminateAccount(args.username),
          'whm_terminate_account'
        );

      case 'whm_get_account_summary':
        return await withOperationTimeout(
          () => this.whmService.getAccountSummary(args.username),
          'whm_get_account_summary'
        );

      case 'whm_server_status':
        return await withOperationTimeout(
          () => this.whmService.getServerStatus(),
          'whm_server_status'
        );

      case 'whm_service_status':
        return await withOperationTimeout(
          () => this.whmService.getServiceStatus(),
          'whm_service_status'
        );

      case 'whm_restart_service':
        SafetyGuard.requireConfirmation('whm_restart_service', args);
        return await withOperationTimeout(
          () => this.whmService.restartService(args.service),
          'whm_restart_service'
        );

      case 'whm_list_domains':
        return await withOperationTimeout(
          () => this.whmService.listDomains(args.username),
          'whm_list_domains'
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
      case 'domain_get_user_data':
        return await withOperationTimeout(
          () => this.whmService.getDomainUserData(args.domain),
          'domain_get_user_data'
        );

      case 'domain_get_all_info':
        return await withOperationTimeout(
          () => this.whmService.getAllDomainInfo(args.limit, args.offset, args.filter, args.domain_filter),
          'domain_get_all_info'
        );

      case 'domain_get_owner':
        return await withOperationTimeout(
          () => this.whmService.getDomainOwner(args.domain),
          'domain_get_owner'
        );

      case 'domain_create_alias':
        return await withOperationTimeout(
          () => this.whmService.createParkedDomain(
            args.domain,
            args.username,
            args.target_domain
          ),
          'domain_create_alias'
        );

      case 'domain_create_subdomain':
        return await withOperationTimeout(
          () => this.whmService.createSubdomain(
            args.subdomain,
            args.domain,
            args.username,
            args.document_root
          ),
          'domain_create_subdomain'
        );

      case 'domain_delete':
        SafetyGuard.requireConfirmation('domain_delete', args);
        return await withOperationTimeout(
          () => this.whmService.deleteDomain(
            args.domain,
            args.username,
            args.type,
            true // confirmed=true because SafetyGuard already validated
          ),
          'domain_delete'
        );

      case 'domain_resolve':
        return await withOperationTimeout(
          () => this.whmService.resolveDomainName(args.domain),
          'domain_resolve'
        );

      // Addon Domain Tools (Phase 2)
      case 'domain_addon_list':
        return await withOperationTimeout(
          () => this.whmService.listAddonDomains(args.username),
          'domain_addon_list'
        );

      case 'domain_addon_details':
        return await withOperationTimeout(
          () => this.whmService.getAddonDomainDetails(args.domain, args.username),
          'domain_addon_details'
        );

      case 'domain_addon_conversion_status':
        return await withOperationTimeout(
          () => this.whmService.getConversionStatus(args.conversion_id),
          'domain_addon_conversion_status'
        );

      case 'domain_addon_start_conversion':
        SafetyGuard.requireConfirmation('domain_addon_start_conversion', args);
        return await withOperationTimeout(
          () => this.whmService.initiateAddonConversion(args),
          'domain_addon_start_conversion'
        );

      case 'domain_addon_conversion_details':
        return await withOperationTimeout(
          () => this.whmService.getConversionDetails(args.conversion_id),
          'domain_addon_conversion_details'
        );

      case 'domain_addon_list_conversions':
        return await withOperationTimeout(
          () => this.whmService.listConversions(),
          'domain_addon_list_conversions'
        );

      // Domain Authority and DNSSEC Tools (Phase 2)
      case 'domain_check_authority':
        return await withOperationTimeout(
          () => this.whmService.hasLocalAuthority(args.domain),
          'domain_check_authority'
        );

      case 'domain_get_ds_records':
        return await withOperationTimeout(
          () => this.whmService.getDSRecords(args.domains),
          'domain_get_ds_records'
        );

      case 'domain_enable_nsec3':
        SafetyGuard.requireConfirmation('domain_enable_nsec3', args);
        // Dynamic timeout: 60s + (30s * num_domains), max 600s
        const enableTimeout = Math.min(60000 + (30000 * (args.domains?.length || 1)), 600000);
        return await withOperationTimeout(
          () => this.whmService.setNSEC3ForDomains(args.domains),
          'domain_enable_nsec3',
          enableTimeout
        );

      case 'domain_disable_nsec3':
        SafetyGuard.requireConfirmation('domain_disable_nsec3', args);
        // Dynamic timeout: 60s + (30s * num_domains), max 600s
        const disableTimeout = Math.min(60000 + (30000 * (args.domains?.length || 1)), 600000);
        return await withOperationTimeout(
          () => this.whmService.unsetNSEC3ForDomains(args.domains),
          'domain_disable_nsec3',
          disableTimeout
        );

      case 'domain_get_nsec3_status':
        return await withOperationTimeout(
          () => this.whmService.getNsec3Status(args.operation_id),
          'domain_get_nsec3_status'
        );

      case 'domain_update_userdomains':
        SafetyGuard.requireConfirmation('domain_update_userdomains', args);
        return await withOperationTimeout(
          () => this.whmService.updateUserdomains(),
          'domain_update_userdomains'
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
      case 'dns_list_zones':
        return await withOperationTimeout(
          () => this.dnsService.listZones(),
          'dns_list_zones'
        );

      case 'dns_get_zone':
        return await withOperationTimeout(
          () => this.dnsService.getZone(args.zone, {
            record_type: args.record_type,
            name_filter: args.name_filter,
            max_records: args.max_records,
            include_stats: args.include_stats
          }),
          'dns_get_zone'
        );

      case 'dns_check_nested_domains':
        return await withOperationTimeout(
          () => this.dnsService.checkNestedDomains(args.zone),
          'dns_check_nested_domains'
        );

      case 'dns_search_record':
        return await withOperationTimeout(
          () => this.dnsService.searchRecord(
            args.zone,
            args.name,
            args.type || ['A', 'AAAA'],
            args.matchMode || 'exact'
          ),
          'dns_search_record'
        );

      case 'dns_add_record':
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
          'dns_add_record'
        );

      case 'dns_edit_record':
        SafetyGuard.requireConfirmation('dns_edit_record', args);
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
          'dns_edit_record'
        );

      case 'dns_delete_record':
        SafetyGuard.requireConfirmation('dns_delete_record', args);
        return await withOperationTimeout(
          () => this.dnsService.deleteRecord(args.zone, args.line, args.expected_content),
          'dns_delete_record'
        );

      case 'dns_reset_zone':
        SafetyGuard.requireConfirmation('dns_reset_zone', args);
        return await withOperationTimeout(
          () => this.dnsService.resetZone(args.zone),
          'dns_reset_zone'
        );

      case 'dns_list_mx':
        return await withOperationTimeout(
          () => this.whmService.listMXRecords(args.domain),
          'dns_list_mx'
        );

      case 'dns_add_mx':
        return await withOperationTimeout(
          () => this.whmService.saveMXRecord(
            args.domain,
            args.exchange,
            args.priority,
            args.alwaysaccept
          ),
          'dns_add_mx'
        );

      case 'dns_check_alias_available':
        return await withOperationTimeout(
          () => this.whmService.isAliasAvailable(args.zone, args.name),
          'dns_check_alias_available'
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
      case 'system_restart_service':
        SafetyGuard.requireConfirmation('system_restart_service', args);
        return await withOperationTimeout(
          () => this.sshManager.restartService(args.service),
          'system_restart_service'
        );

      case 'system_get_load':
        return await withOperationTimeout(
          () => this.sshManager.getSystemLoad(),
          'system_get_load'
        );

      case 'log_read_last_lines':
        return await withOperationTimeout(
          () => this.sshManager.readLogLines(args.logfile, args.lines || 50),
          'log_read_last_lines'
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
      case 'file_list':
        return await withOperationTimeout(
          () => this.fileManager.listDirectory(args.cpanelUser, args.path),
          'file_list'
        );

      case 'file_read':
        return await withOperationTimeout(
          () => this.fileManager.readFile(args.cpanelUser, args.path),
          'file_read'
        );

      case 'file_write':
        SafetyGuard.requireConfirmation('file_write', args);
        return await withOperationTimeout(
          () => this.fileManager.writeFile(args.cpanelUser, args.path, args.content, {
            encoding: args.encoding,
            createDirs: args.create_dirs
          }),
          'file_write'
        );

      case 'file_delete':
        SafetyGuard.requireConfirmation('file_delete', args);
        return await withOperationTimeout(
          () => this.fileManager.deleteFile(args.cpanelUser, args.path, {
            force: args.force
          }),
          'file_delete'
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
