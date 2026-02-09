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

// Mapa de categorias para routing de tools (substitui prefix matching)
const TOOL_CATEGORIES = {
  // WHM Account Tools
  'whm_cpanel_list_accounts': 'whm',
  'whm_cpanel_create_account': 'whm',
  'whm_cpanel_suspend_account': 'whm',
  'whm_cpanel_unsuspend_account': 'whm',
  'whm_cpanel_delete_account': 'whm',
  'whm_cpanel_get_account_summary': 'whm',
  'whm_cpanel_get_server_status': 'whm',
  'whm_cpanel_get_services_status': 'whm',
  'whm_cpanel_restart_service': 'whm',
  'whm_cpanel_list_account_domains': 'whm',
  // Domain Tools
  'whm_cpanel_get_domain_data': 'domain',
  'whm_cpanel_list_all_domains': 'domain',
  'whm_cpanel_get_domain_owner': 'domain',
  'whm_cpanel_create_domain_alias': 'domain',
  'whm_cpanel_create_subdomain': 'domain',
  'whm_cpanel_delete_domain': 'domain',
  'whm_cpanel_resolve_domain_ip': 'domain',
  'whm_cpanel_list_addon_domains': 'domain',
  'whm_cpanel_get_addon_domain_details': 'domain',
  'whm_cpanel_get_addon_conversion_status': 'domain',
  'whm_cpanel_create_addon_conversion': 'domain',
  'whm_cpanel_get_addon_conversion_details': 'domain',
  'whm_cpanel_list_addon_conversions': 'domain',
  'whm_cpanel_check_domain_authority': 'domain',
  'whm_cpanel_get_dnssec_ds_records': 'domain',
  'whm_cpanel_enable_dnssec_nsec3': 'domain',
  'whm_cpanel_disable_dnssec_nsec3': 'domain',
  'whm_cpanel_get_nsec3_operation_status': 'domain',
  'whm_cpanel_update_userdomains_cache': 'domain',
  // DNS Tools
  'whm_cpanel_list_dns_zones': 'dns',
  'whm_cpanel_get_dns_zone_records': 'dns',
  'whm_cpanel_check_dns_nested_subdomains': 'dns',
  'whm_cpanel_search_dns_record': 'dns',
  'whm_cpanel_create_dns_record': 'dns',
  'whm_cpanel_update_dns_record': 'dns',
  'whm_cpanel_delete_dns_record': 'dns',
  'whm_cpanel_reset_dns_zone': 'dns',
  'whm_cpanel_list_dns_mx_records': 'dns',
  'whm_cpanel_create_dns_mx_record': 'dns',
  'whm_cpanel_check_dns_alias_available': 'dns',
  // SSH/System Tools
  'whm_cpanel_restart_system_service': 'ssh',
  'whm_cpanel_get_system_load_metrics': 'ssh',
  'whm_cpanel_read_system_log_lines': 'ssh',
  // File Tools
  'whm_cpanel_list_user_files': 'file',
  'whm_cpanel_read_user_file': 'file',
  'whm_cpanel_write_user_file': 'file',
  'whm_cpanel_delete_user_file': 'file',
};


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
      name: 'whm_cpanel_list_accounts',
      description: 'Contas de hospedagem, clientes e planos no WHM/cPanel — inventario completo de contas ativas e suspensas no servidor. Use no WHM quando precisar localizar conta, verificar status ou auditar ocupacao do servidor. Retorna array com username, dominio, email, pacote, uso de disco e status de cada conta no cPanel.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'whm_cpanel_create_account',
      description: 'Conta de hospedagem nova no WHM/cPanel — provisionamento de cliente com dominio, usuario e pacote configuraveis. Use no WHM quando precisar criar conta para novo cliente ou ambiente de teste. Requer confirmationToken. Retorna dados da conta criada incluindo usuario, dominio principal e IP atribuido no cPanel.',
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
      name: 'whm_cpanel_suspend_account',
      description: 'Suspensao de conta de hospedagem, cliente ou usuario no WHM/cPanel — bloqueia acesso ao cPanel, FTP e email. Use no WHM quando houver inadimplencia, violacao de termos ou manutencao programada. Dados preservados, operacao reversivel via whm_cpanel_unsuspend_account. Requer motivo visivel ao cliente.',
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
      name: 'whm_cpanel_unsuspend_account',
      description: 'Reativacao de conta suspensa, cliente ou hospedagem no WHM/cPanel — restaura acesso completo ao cPanel, FTP, email e website. Use no WHM quando o cliente regularizar pagamento ou motivo da suspensao for resolvido. Retorna confirmacao da reativacao e status atualizado da conta no servidor WHM.',
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
      name: 'whm_cpanel_delete_account',
      description: 'Remocao permanente de conta de hospedagem no WHM/cPanel — deleta arquivos, emails, bancos e configuracoes do cliente. Use no WHM apenas para cancelamento definitivo. Acao destrutiva e irreversivel. Requer confirmationToken, flag confirm=true e motivo detalhado para auditoria no WHM/cPanel.',
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
      name: 'whm_cpanel_get_account_summary',
      description: 'Resumo de conta de hospedagem, cliente e recursos no WHM/cPanel — dados detalhados de uso e configuracao. Use no WHM quando precisar verificar quota de disco, bandwidth ou alocacao de recursos de um cliente especifico. Retorna dominio, email, pacote, uso de disco e bandwidth da conta no cPanel.',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Username da conta (exato)' }
        },
        required: ['username']
      }
    },
    {
      name: 'whm_cpanel_get_server_status',
      description: 'Status do servidor, saude e versao do WHM/cPanel — monitoramento geral incluindo load average e uptime. Use no WHM quando precisar verificar carga de CPU, confirmar versao instalada ou diagnosticar lentidao no servidor. Retorna metricas de carga para 1, 5 e 15 minutos e tempo de atividade do WHM.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'whm_cpanel_get_services_status',
      description: 'Servicos, daemons e processos do servidor WHM/cPanel — status de Apache, MySQL, DNS, FTP e email. Use no WHM quando precisar diagnosticar problemas de conectividade ou verificar se servicos estao operacionais. Retorna estado individual de cada servico: ativo, parado ou com falha no servidor WHM.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'whm_cpanel_restart_service',
      description: 'Reinicio de servico via API do WHM/cPanel — reinicializa daemon para aplicar configuracoes ou resolver travamentos. Use no WHM quando precisar reiniciar httpd, mysql, named, postfix, dovecot, exim, nginx ou pure-ftpd. Requer confirmationToken e motivo. Diferente de whm_cpanel_restart_system_service que usa SSH.',
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
      name: 'whm_cpanel_list_account_domains',
      description: 'Dominios de conta cPanel, sites e subdominios no WHM — listagem completa incluindo dominio principal, addon domains e subdominios. Use no WHM quando precisar verificar todos os dominios de um cliente ou auditar configuracao. Retorna lista categorizada por tipo. Requer username da conta cPanel no WHM.',
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
      name: 'whm_cpanel_get_domain_data',
      description: 'Dados de dominio, site e hospedagem no WHM/cPanel — informacoes completas incluindo usuario, docroot, IP e versao PHP. Use no WHM quando souber o nome exato do dominio e precisar de detalhes. Mais eficiente que whm_cpanel_list_all_domains para consulta unitaria. Retorna configuracao completa do WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome exato do dominio (ex: servidor.one)' }
        },
        required: ['domain']
      }
    },
    {
      name: 'whm_cpanel_list_all_domains',
      description: 'Dominios, sites e hospedagens no WHM/cPanel — listagem paginada com filtros por tipo e nome. Use no WHM quando precisar buscar dominios por substring ou tipo (addon, alias, subdomain, main). Retorna array paginado com detalhes. Para dominio unico, prefira whm_cpanel_get_domain_data no cPanel.',
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
      name: 'whm_cpanel_get_domain_owner',
      description: 'Proprietario de dominio, conta e usuario cPanel no WHM — identifica qual conta hospeda determinado dominio ou site. Use no WHM quando precisar descobrir o dono de um dominio antes de realizar alteracoes. Retorna o username cPanel associado. Consulta somente leitura sem efeitos colaterais no servidor WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio' }
        },
        required: ['domain']
      }
    },
    {
      name: 'whm_cpanel_create_domain_alias',
      description: 'Alias de dominio, parked domain e redirecionamento no WHM/cPanel — cria dominio alternativo apontando para conteudo existente. Use no WHM quando cliente precisar de dominio adicional redirecionado ao principal. O target_domain assume o dominio principal se omitido. Retorna confirmacao de criacao no cPanel.',
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
      name: 'whm_cpanel_create_subdomain',
      description: 'Subdominio, endereco e aplicacao web no WHM/cPanel — cria subdominio vinculado a dominio existente da conta. Use no WHM quando precisar configurar enderecos como blog.exemplo.com ou api.exemplo.com. O document_root e auto-gerado se omitido. Retorna configuracao do subdominio criado e docroot no cPanel.',
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
      name: 'whm_cpanel_delete_domain',
      description: 'Remocao de dominio, addon ou subdominio no WHM/cPanel — deleta configuracao de dominio da conta. Use no WHM quando dominio nao for mais necessario. Arquivos no docroot nao sao deletados automaticamente. Requer tipo (addon, parked, subdomain), confirmationToken e motivo detalhado para auditoria no WHM.',
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
      name: 'whm_cpanel_resolve_domain_ip',
      description: 'Resolucao DNS, IP e endereco de dominio no WHM/cPanel — consulta para qual IP um dominio aponta no servidor. Use no WHM quando precisar verificar apontamento ou diagnosticar problemas de resolucao DNS. Retorna endereco IP correspondente ao dominio consultado. Consulta somente leitura no servidor WHM.',
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
      name: 'whm_cpanel_list_addon_domains',
      description: 'Addon domains, dominios adicionais e hospedagens extras no WHM/cPanel — listagem de addons de uma conta especifica. Use no WHM quando precisar ver apenas addon domains de um usuario. Diferente de whm_cpanel_list_account_domains que inclui todos os tipos, retorna apenas addons com detalhes do WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Usuario cPanel' }
        },
        required: ['username']
      }
    },
    {
      name: 'whm_cpanel_get_addon_domain_details',
      description: 'Detalhes de addon domain, configuracao e docroot no WHM/cPanel — informacoes completas de um addon especifico. Use no WHM quando precisar verificar document root, subdominio vinculado ou configuracao detalhada. Retorna docroot, subdominio associado e demais propriedades do addon domain no servidor WHM.',
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
      name: 'whm_cpanel_get_addon_conversion_status',
      description: 'Status de conversao de addon domain no WHM/cPanel — acompanhamento de migracao para conta independente. Use no WHM para verificar progresso de conversao em andamento. Retorna estado: pendente, concluido ou falha. O conversion_id e obtido via whm_cpanel_create_addon_conversion no servidor WHM/cPanel.',
      inputSchema: {
        type: 'object',
        properties: {
          conversion_id: { type: 'string', description: 'ID da conversao (retornado por whm_cpanel_create_addon_conversion)' }
        },
        required: ['conversion_id']
      }
    },
    {
      name: 'whm_cpanel_create_addon_conversion',
      description: 'Conversao de addon domain para conta independente no WHM/cPanel — migracao de dominio para hospedagem propria com recursos dedicados. Use no WHM quando cliente precisar de conta separada para addon domain. Requer confirmationToken e motivo. Retorna conversion_id para polling via whm_cpanel_get_addon_conversion_status.',
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
      name: 'whm_cpanel_get_addon_conversion_details',
      description: 'Detalhes de conversao de addon, logs e historico no WHM/cPanel — diagnostico completo de migracao em andamento ou finalizada. Use no WHM quando precisar investigar falhas ou verificar etapas da conversao. Diferente de whm_cpanel_get_addon_conversion_status, retorna logs completos e historico no WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          conversion_id: { type: 'string', description: 'ID da conversao' }
        },
        required: ['conversion_id']
      }
    },
    {
      name: 'whm_cpanel_list_addon_conversions',
      description: 'Historico de conversoes de addon domains no WHM/cPanel — registro completo de migracoes para contas independentes. Use no WHM quando precisar auditar conversoes passadas ou verificar se ha conversoes pendentes. Retorna lista com status, datas e dominios envolvidos em cada operacao no servidor WHM/cPanel.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },

    // Domain Authority and DNSSEC Tools
    {
      name: 'whm_cpanel_check_domain_authority',
      description: 'Autoridade DNS de dominio, zona e controle no WHM/cPanel — verifica se o servidor e autoritativo para o dominio. Use no WHM antes de editar registros DNS para confirmar autoridade sobre a zona. Retorna status booleano. Verificacao essencial antes de qualquer operacao de DNS no servidor WHM/cPanel.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio a verificar' }
        },
        required: ['domain']
      }
    },
    {
      name: 'whm_cpanel_get_dnssec_ds_records',
      description: 'Registros DS e DNSSEC, delegacao e seguranca de dominios no WHM/cPanel — obtem chaves para configuracao no registrar. Use no WHM quando precisar configurar DNSSEC ou verificar assinaturas existentes. Aceita lista de ate 100 dominios por chamada. Retorna registros DS necessarios para ativacao no cPanel.',
      inputSchema: {
        type: 'object',
        properties: {
          domains: { type: 'array', items: { type: 'string' }, description: 'Lista de dominios (maximo 100)' }
        },
        required: ['domains']
      }
    },
    {
      name: 'whm_cpanel_enable_dnssec_nsec3',
      description: 'NSEC3 e DNSSEC aprimorado, protecao contra zone walking no WHM/cPanel — habilita seguranca avancada de DNS. Use no WHM quando precisar fortalecer protecao DNS de dominios. Aceita ate 50 dominios. Operacao assincrona que retorna operation_id para polling via whm_cpanel_get_nsec3_operation_status.',
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
      name: 'whm_cpanel_disable_dnssec_nsec3',
      description: 'Desativacao de NSEC3, reversao para NSEC padrao no WHM/cPanel — remove protecao avancada de DNSSEC em dominios. Use no WHM quando precisar desabilitar NSEC3 em dominios especificos. Aceita ate 50 dominios. Requer confirmationToken. Retorna operation_id para polling via whm_cpanel_get_nsec3_operation_status.',
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
      name: 'whm_cpanel_get_nsec3_operation_status',
      description: 'Status de operacao NSEC3, progresso e resultado no WHM/cPanel — acompanhamento de enable/disable DNSSEC assincrono. Use no WHM para polling de operacoes NSEC3 em andamento. O operation_id e retornado por whm_cpanel_enable_dnssec_nsec3 ou whm_cpanel_disable_dnssec_nsec3. Retorna: pendente, concluido ou falha.',
      inputSchema: {
        type: 'object',
        properties: {
          operation_id: { type: 'string', description: 'ID da operacao NSEC3' }
        },
        required: ['operation_id']
      }
    },
    {
      name: 'whm_cpanel_update_userdomains_cache',
      description: 'Cache de dominios, mapeamento /etc/userdomains no WHM/cPanel — sincroniza associacao entre dominios e usuarios. Use no WHM apenas para corrigir inconsistencias apos migracoes ou quando dominios nao resolvem para suas contas. Requer confirmationToken. Operacao protegida contra concorrencia no servidor WHM.',
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
      name: 'whm_cpanel_list_dns_zones',
      description: 'Zonas DNS, dominios e registros gerenciados no WHM/cPanel — inventario completo de zonas ativas no servidor. Use no WHM quando precisar visualizar todos os dominios com DNS configurado ou localizar zona para edicao. Retorna array de zonas DNS com status. Consulta somente leitura sem parametros no cPanel.',
      inputSchema: dnsSchema.tools['whm_cpanel_list_dns_zones'].inputSchema
    },
    {
      name: 'whm_cpanel_get_dns_zone_records',
      description: 'Registros DNS, entradas e configuracao de zona no WHM/cPanel — visualizacao completa com filtros por tipo e nome. Use no WHM quando precisar ver todos os registros de um dominio. Retorna lista numerada por linha com tipo, nome e valor. Para registro especifico, prefira whm_cpanel_search_dns_record no cPanel.',
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
      name: 'whm_cpanel_check_dns_nested_subdomains',
      description: 'Subdominios aninhados, niveis e complexidade de zona DNS no WHM/cPanel — analise estrutural de hierarquia. Use no WHM para diagnosticar zonas complexas com muitos niveis antes de alteracoes. Retorna estatisticas de aninhamento e profundidade de subdominios que ajudam a mapear a zona DNS no WHM/cPanel.',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Dominio a verificar (ex: skillsit.com.br)' }
        },
        required: ['zone']
      }
    },
    {
      name: 'whm_cpanel_search_dns_record',
      description: 'Busca de registro DNS, consulta e localizacao na zona do WHM/cPanel — pesquisa com modos exact, contains ou startsWith. Use no WHM quando precisar localizar registro especifico de forma eficiente. Retorna registros com numero de linha necessario para edicao via whm_cpanel_update_dns_record no cPanel.',
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
          match_mode: {
            type: 'string',
            enum: ['exact', 'contains', 'startsWith'],
            description: 'Modo de correspondencia do nome. Valores aceitos: exact (correspondencia exata, padrao), contains (contem substring), startsWith (inicia com o texto informado)'
          }
        },
        required: ['zone', 'name']
      }
    },
    {
      name: 'whm_cpanel_create_dns_record',
      description: 'Registro DNS novo, entrada e apontamento em zona do WHM/cPanel — cria registros A, AAAA, CNAME, MX, TXT, NS ou PTR. Use no WHM para configurar apontamentos de dominio. Campos obrigatorios variam por tipo: address para A/AAAA, cname para CNAME, exchange para MX. Retorna confirmacao com linha criada no cPanel.',
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
      name: 'whm_cpanel_update_dns_record',
      description: 'Edicao de registro DNS, alteracao de IP ou conteudo em zona do WHM/cPanel — atualizacao com optimistic locking. Use no WHM quando precisar alterar IP, TTL ou dados de registro existente. Requer linha obtida via whm_cpanel_search_dns_record. Campo expected_content previne edicao concorrente no servidor WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona/dominio' },
          line: { type: 'integer', description: 'Numero da linha do registro (obter via whm_cpanel_search_dns_record)' },
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
      name: 'whm_cpanel_delete_dns_record',
      description: 'Remocao de registro DNS, exclusao de entrada em zona do WHM/cPanel — operacao destrutiva que afeta servicos dependentes. Use no WHM apenas com certeza que o registro nao e necessario. Execute whm_cpanel_search_dns_record antes para obter linha. Requer confirmationToken e motivo para auditoria no WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Nome da zona/dominio' },
          line: { type: 'integer', description: 'Numero da linha do registro (obter via whm_cpanel_search_dns_record)' },
          expected_content: { type: 'string', description: 'Conteudo esperado para verificacao (previne delecao de registro errado)' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da remocao (auditoria)' }
        },
        required: ['zone', 'line']
      }
    },
    {
      name: 'whm_cpanel_reset_dns_zone',
      description: 'Reset de zona DNS, restauracao e limpeza de registros no WHM/cPanel — reverte zona ao estado padrao removendo customizacoes. Use no WHM apenas em ultimo recurso quando zona estiver corrompida ou inconsistente. Operacao destrutiva. Requer confirmationToken e motivo detalhado para auditoria no servidor WHM.',
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
      name: 'whm_cpanel_list_dns_mx_records',
      description: 'Registros MX, servidores de email e entrega no WHM/cPanel — listagem de configuracao de recebimento de mensagens. Use no WHM quando precisar verificar roteamento de email ou diagnosticar problemas de recebimento de um dominio. Retorna lista de servidores MX com prioridades. Consulta somente leitura no cPanel.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio' }
        },
        required: ['domain']
      }
    },
    {
      name: 'whm_cpanel_create_dns_mx_record',
      description: 'Registro MX novo, servidor de email e prioridade no WHM/cPanel — adiciona entrada de roteamento de email de forma idempotente. Use no WHM quando precisar configurar servidor de email ou MX backup. Verifica duplicatas antes de criar. Retorna confirmacao. Prioridade padrao 10 (menor = maior prioridade) no cPanel.',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Nome do dominio' },
          exchange: { type: 'string', description: 'Servidor de email (ex: mail.exemplo.com)' },
          priority: { type: 'integer', default: 10, description: 'Prioridade MX (menor = maior prioridade). Default: 10' },
          always_accept: { type: 'boolean', default: false, description: 'Define se o servidor deve sempre aceitar email para este MX, mesmo sem conta local configurada' }
        },
        required: ['domain', 'exchange']
      }
    },
    {
      name: 'whm_cpanel_check_dns_alias_available',
      description: 'Disponibilidade de registro DNS, alias e nome na zona do WHM/cPanel — verifica se nome esta livre para uso. Use no WHM antes de criar novo registro para prevenir conflitos. Retorna status de disponibilidade. Consulta somente leitura essencial para validar nomes em zonas DNS no servidor WHM/cPanel.',
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
      name: 'whm_cpanel_restart_system_service',
      description: 'Reinicio de servico via SSH, daemon e processo no WHM/cPanel — reinicializacao por conexao direta ao servidor. Use no WHM quando precisar reiniciar httpd, mysql, named, postfix, dovecot, exim, nginx ou pure-ftpd. Diferente de whm_cpanel_restart_service que usa API, esta executa via SSH no servidor WHM.',
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
      name: 'whm_cpanel_get_system_load_metrics',
      description: 'Metricas de carga, CPU e memoria do servidor WHM/cPanel — monitoramento de recursos via SSH em tempo real. Use no WHM quando precisar diagnosticar lentidao ou monitorar performance do servidor. Retorna load average de 1, 5 e 15 minutos, memoria RAM livre e espaco em disco disponivel no WHM/cPanel.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'whm_cpanel_read_system_log_lines',
      description: 'Logs do sistema, registros de erro e diagnostico no WHM/cPanel — leitura das ultimas linhas via SSH. Use no WHM quando precisar verificar erros recentes ou analisar logs de servico. Retorna ultimas N linhas. Caminhos permitidos: /var/log/*, /usr/local/apache/logs/*, /usr/local/cpanel/logs/*. Padrao: 50 no WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          log_file: { type: 'string', description: 'Caminho absoluto do arquivo de log. Caminhos permitidos: /var/log/*, /usr/local/apache/logs/*, /usr/local/cpanel/logs/*' },
          lines: { type: 'integer', default: 50, description: 'Numero de linhas a retornar (default: 50)' }
        },
        required: ['log_file']
      }
    },

    // ==========================================
    // FILE TOOLS - Gerenciamento de Arquivos
    // ==========================================
    {
      name: 'whm_cpanel_list_user_files',
      description: 'Arquivos, diretorios e documentos de conta cPanel no WHM — navegacao na estrutura do home do usuario. Use no WHM quando precisar explorar arquivos de um cliente ou localizar configuracoes. Restrito a /home/{usuario} por seguranca do WHM. Retorna listagem com nomes, tamanhos e datas de modificacao.',
      inputSchema: {
        type: 'object',
        properties: {
          cpanel_user: { type: 'string', description: 'Usuario cPanel (dono dos arquivos)' },
          path: { type: 'string', description: 'Caminho relativo ao home do usuario (ex: public_html, public_html/images). Default: raiz do home' }
        },
        required: ['cpanel_user']
      }
    },
    {
      name: 'whm_cpanel_read_user_file',
      description: 'Conteudo de arquivo, codigo e configuracao de conta cPanel no WHM — leitura de documentos do home do usuario. Use no WHM quando precisar visualizar .htaccess, index.php ou diagnosticar problemas em arquivos do cliente. Restrito a /home/{usuario} por seguranca contra path traversal. Consulta somente leitura no WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          cpanel_user: { type: 'string', description: 'Usuario cPanel (dono do arquivo)' },
          path: { type: 'string', description: 'Caminho do arquivo relativo ao home (ex: public_html/index.php)' }
        },
        required: ['cpanel_user', 'path']
      }
    },
    {
      name: 'whm_cpanel_write_user_file',
      description: 'Escrita de arquivo, configuracao e documento em conta cPanel no WHM — cria ou atualiza conteudo no home do usuario. Use no WHM quando precisar editar .htaccess, wp-config ou configuracoes do cliente. Backup automatico antes de sobrescrever. Requer confirmationToken. Restrito a /home/{usuario} no WHM.',
      inputSchema: {
        type: 'object',
        properties: {
          cpanel_user: { type: 'string', description: 'Usuario cPanel' },
          path: { type: 'string', description: 'Caminho do arquivo' },
          content: { type: 'string', description: 'Conteudo a escrever' },
          encoding: { type: 'string', default: 'utf8', description: 'Encoding do arquivo (default: utf8)' },
          create_dirs: { type: 'boolean', default: false, description: 'Criar diretorios pais se nao existirem' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da escrita (auditoria)' }
        },
        required: ['cpanel_user', 'path', 'content']
      }
    },
    {
      name: 'whm_cpanel_delete_user_file',
      description: 'Remocao de arquivo, documento e conteudo de conta cPanel no WHM — delecao permanente no home do usuario. Use no WHM apenas quando tiver certeza que o arquivo nao e necessario. Operacao destrutiva e irreversivel. Restrito a /home/{usuario} por seguranca. Requer confirmationToken e motivo no WHM/cPanel.',
      inputSchema: {
        type: 'object',
        properties: {
          cpanel_user: { type: 'string', description: 'Usuario cPanel' },
          path: { type: 'string', description: 'Caminho do arquivo a deletar' },
          force: { type: 'boolean', default: false, description: 'Forcar delecao sem confirmacao adicional' },
          confirmationToken: { type: 'string', description: 'Token de confirmacao (MCP_SAFETY_TOKEN)' },
          reason: { type: 'string', description: 'Motivo da delecao (auditoria)' }
        },
        required: ['cpanel_user', 'path']
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
        suggestion: 'Use tools/list para ver todas as tools disponiveis. Nomes iniciam com whm_cpanel_'
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
      default:
        throw new Error(`Unknown tool category for: ${name}`);
    }
  }

  /**
   * Executa tools WHM
   */
  async executeWhmTool(name, args) {
    if (!this.whmService) {
      throw new Error('WHM service not configured');
    }

    switch (name) {
      case 'whm_cpanel_list_accounts':
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
        }, 'whm_cpanel_list_accounts');

      case 'whm_cpanel_create_account':
        SafetyGuard.requireConfirmation('whm_cpanel_create_account', args);
        return await withOperationTimeout(
          () => this.whmService.createAccount(args),
          'whm_cpanel_create_account'
        );

      case 'whm_cpanel_suspend_account':
        SafetyGuard.requireConfirmation('whm_cpanel_suspend_account', args);
        return await withOperationTimeout(
          () => this.whmService.suspendAccount(args.username, args.reason),
          'whm_cpanel_suspend_account'
        );

      case 'whm_cpanel_unsuspend_account':
        SafetyGuard.requireConfirmation('whm_cpanel_unsuspend_account', args);
        return await withOperationTimeout(
          () => this.whmService.unsuspendAccount(args.username),
          'whm_cpanel_unsuspend_account'
        );

      case 'whm_cpanel_delete_account':
        if (!args.confirm) {
          throw new Error('Confirmation required to terminate account');
        }
        SafetyGuard.requireConfirmation('whm_cpanel_delete_account', args);
        return await withOperationTimeout(
          () => this.whmService.terminateAccount(args.username),
          'whm_cpanel_delete_account'
        );

      case 'whm_cpanel_get_account_summary':
        return await withOperationTimeout(
          () => this.whmService.getAccountSummary(args.username),
          'whm_cpanel_get_account_summary'
        );

      case 'whm_cpanel_get_server_status':
        return await withOperationTimeout(
          () => this.whmService.getServerStatus(),
          'whm_cpanel_get_server_status'
        );

      case 'whm_cpanel_get_services_status':
        return await withOperationTimeout(
          () => this.whmService.getServiceStatus(),
          'whm_cpanel_get_services_status'
        );

      case 'whm_cpanel_restart_service':
        SafetyGuard.requireConfirmation('whm_cpanel_restart_service', args);
        return await withOperationTimeout(
          () => this.whmService.restartService(args.service),
          'whm_cpanel_restart_service'
        );

      case 'whm_cpanel_list_account_domains':
        return await withOperationTimeout(
          () => this.whmService.listDomains(args.username),
          'whm_cpanel_list_account_domains'
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
      case 'whm_cpanel_get_domain_data':
        return await withOperationTimeout(
          () => this.whmService.getDomainUserData(args.domain),
          'whm_cpanel_get_domain_data'
        );

      case 'whm_cpanel_list_all_domains':
        return await withOperationTimeout(
          () => this.whmService.getAllDomainInfo(args.limit, args.offset, args.filter, args.domain_filter),
          'whm_cpanel_list_all_domains'
        );

      case 'whm_cpanel_get_domain_owner':
        return await withOperationTimeout(
          () => this.whmService.getDomainOwner(args.domain),
          'whm_cpanel_get_domain_owner'
        );

      case 'whm_cpanel_create_domain_alias':
        return await withOperationTimeout(
          () => this.whmService.createParkedDomain(
            args.domain,
            args.username,
            args.target_domain
          ),
          'whm_cpanel_create_domain_alias'
        );

      case 'whm_cpanel_create_subdomain':
        return await withOperationTimeout(
          () => this.whmService.createSubdomain(
            args.subdomain,
            args.domain,
            args.username,
            args.document_root
          ),
          'whm_cpanel_create_subdomain'
        );

      case 'whm_cpanel_delete_domain':
        SafetyGuard.requireConfirmation('whm_cpanel_delete_domain', args);
        return await withOperationTimeout(
          () => this.whmService.deleteDomain(
            args.domain,
            args.username,
            args.type,
            true // confirmed=true because SafetyGuard already validated
          ),
          'whm_cpanel_delete_domain'
        );

      case 'whm_cpanel_resolve_domain_ip':
        return await withOperationTimeout(
          () => this.whmService.resolveDomainName(args.domain),
          'whm_cpanel_resolve_domain_ip'
        );

      // Addon Domain Tools (Phase 2)
      case 'whm_cpanel_list_addon_domains':
        return await withOperationTimeout(
          () => this.whmService.listAddonDomains(args.username),
          'whm_cpanel_list_addon_domains'
        );

      case 'whm_cpanel_get_addon_domain_details':
        return await withOperationTimeout(
          () => this.whmService.getAddonDomainDetails(args.domain, args.username),
          'whm_cpanel_get_addon_domain_details'
        );

      case 'whm_cpanel_get_addon_conversion_status':
        return await withOperationTimeout(
          () => this.whmService.getConversionStatus(args.conversion_id),
          'whm_cpanel_get_addon_conversion_status'
        );

      case 'whm_cpanel_create_addon_conversion':
        SafetyGuard.requireConfirmation('whm_cpanel_create_addon_conversion', args);
        return await withOperationTimeout(
          () => this.whmService.initiateAddonConversion(args),
          'whm_cpanel_create_addon_conversion'
        );

      case 'whm_cpanel_get_addon_conversion_details':
        return await withOperationTimeout(
          () => this.whmService.getConversionDetails(args.conversion_id),
          'whm_cpanel_get_addon_conversion_details'
        );

      case 'whm_cpanel_list_addon_conversions':
        return await withOperationTimeout(
          () => this.whmService.listConversions(),
          'whm_cpanel_list_addon_conversions'
        );

      // Domain Authority and DNSSEC Tools (Phase 2)
      case 'whm_cpanel_check_domain_authority':
        return await withOperationTimeout(
          () => this.whmService.hasLocalAuthority(args.domain),
          'whm_cpanel_check_domain_authority'
        );

      case 'whm_cpanel_get_dnssec_ds_records':
        return await withOperationTimeout(
          () => this.whmService.getDSRecords(args.domains),
          'whm_cpanel_get_dnssec_ds_records'
        );

      case 'whm_cpanel_enable_dnssec_nsec3':
        SafetyGuard.requireConfirmation('whm_cpanel_enable_dnssec_nsec3', args);
        // Dynamic timeout: 60s + (30s * num_domains), max 600s
        const enableTimeout = Math.min(60000 + (30000 * (args.domains?.length || 1)), 600000);
        return await withOperationTimeout(
          () => this.whmService.setNSEC3ForDomains(args.domains),
          'whm_cpanel_enable_dnssec_nsec3',
          enableTimeout
        );

      case 'whm_cpanel_disable_dnssec_nsec3':
        SafetyGuard.requireConfirmation('whm_cpanel_disable_dnssec_nsec3', args);
        // Dynamic timeout: 60s + (30s * num_domains), max 600s
        const disableTimeout = Math.min(60000 + (30000 * (args.domains?.length || 1)), 600000);
        return await withOperationTimeout(
          () => this.whmService.unsetNSEC3ForDomains(args.domains),
          'whm_cpanel_disable_dnssec_nsec3',
          disableTimeout
        );

      case 'whm_cpanel_get_nsec3_operation_status':
        return await withOperationTimeout(
          () => this.whmService.getNsec3Status(args.operation_id),
          'whm_cpanel_get_nsec3_operation_status'
        );

      case 'whm_cpanel_update_userdomains_cache':
        SafetyGuard.requireConfirmation('whm_cpanel_update_userdomains_cache', args);
        return await withOperationTimeout(
          () => this.whmService.updateUserdomains(),
          'whm_cpanel_update_userdomains_cache'
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
      case 'whm_cpanel_list_dns_zones':
        return await withOperationTimeout(
          () => this.dnsService.listZones(),
          'whm_cpanel_list_dns_zones'
        );

      case 'whm_cpanel_get_dns_zone_records':
        return await withOperationTimeout(
          () => this.dnsService.getZone(args.zone, {
            record_type: args.record_type,
            name_filter: args.name_filter,
            max_records: args.max_records,
            include_stats: args.include_stats
          }),
          'whm_cpanel_get_dns_zone_records'
        );

      case 'whm_cpanel_check_dns_nested_subdomains':
        return await withOperationTimeout(
          () => this.dnsService.checkNestedDomains(args.zone),
          'whm_cpanel_check_dns_nested_subdomains'
        );

      case 'whm_cpanel_search_dns_record':
        return await withOperationTimeout(
          () => this.dnsService.searchRecord(
            args.zone,
            args.name,
            args.type || ['A', 'AAAA'],
            args.match_mode || 'exact'
          ),
          'whm_cpanel_search_dns_record'
        );

      case 'whm_cpanel_create_dns_record':
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
          'whm_cpanel_create_dns_record'
        );

      case 'whm_cpanel_update_dns_record':
        SafetyGuard.requireConfirmation('whm_cpanel_update_dns_record', args);
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
          'whm_cpanel_update_dns_record'
        );

      case 'whm_cpanel_delete_dns_record':
        SafetyGuard.requireConfirmation('whm_cpanel_delete_dns_record', args);
        return await withOperationTimeout(
          () => this.dnsService.deleteRecord(args.zone, args.line, args.expected_content),
          'whm_cpanel_delete_dns_record'
        );

      case 'whm_cpanel_reset_dns_zone':
        SafetyGuard.requireConfirmation('whm_cpanel_reset_dns_zone', args);
        return await withOperationTimeout(
          () => this.dnsService.resetZone(args.zone),
          'whm_cpanel_reset_dns_zone'
        );

      case 'whm_cpanel_list_dns_mx_records':
        return await withOperationTimeout(
          () => this.whmService.listMXRecords(args.domain),
          'whm_cpanel_list_dns_mx_records'
        );

      case 'whm_cpanel_create_dns_mx_record':
        return await withOperationTimeout(
          () => this.whmService.saveMXRecord(
            args.domain,
            args.exchange,
            args.priority,
            args.always_accept
          ),
          'whm_cpanel_create_dns_mx_record'
        );

      case 'whm_cpanel_check_dns_alias_available':
        return await withOperationTimeout(
          () => this.whmService.isAliasAvailable(args.zone, args.name),
          'whm_cpanel_check_dns_alias_available'
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
      case 'whm_cpanel_restart_system_service':
        SafetyGuard.requireConfirmation('whm_cpanel_restart_system_service', args);
        return await withOperationTimeout(
          () => this.sshManager.restartService(args.service),
          'whm_cpanel_restart_system_service'
        );

      case 'whm_cpanel_get_system_load_metrics':
        return await withOperationTimeout(
          () => this.sshManager.getSystemLoad(),
          'whm_cpanel_get_system_load_metrics'
        );

      case 'whm_cpanel_read_system_log_lines':
        return await withOperationTimeout(
          () => this.sshManager.readLogLines(args.log_file, args.lines || 50),
          'whm_cpanel_read_system_log_lines'
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
      case 'whm_cpanel_list_user_files':
        return await withOperationTimeout(
          () => this.fileManager.listDirectory(args.cpanel_user, args.path),
          'whm_cpanel_list_user_files'
        );

      case 'whm_cpanel_read_user_file':
        return await withOperationTimeout(
          () => this.fileManager.readFile(args.cpanel_user, args.path),
          'whm_cpanel_read_user_file'
        );

      case 'whm_cpanel_write_user_file':
        SafetyGuard.requireConfirmation('whm_cpanel_write_user_file', args);
        return await withOperationTimeout(
          () => this.fileManager.writeFile(args.cpanel_user, args.path, args.content, {
            encoding: args.encoding,
            createDirs: args.create_dirs
          }),
          'whm_cpanel_write_user_file'
        );

      case 'whm_cpanel_delete_user_file':
        SafetyGuard.requireConfirmation('whm_cpanel_delete_user_file', args);
        return await withOperationTimeout(
          () => this.fileManager.deleteFile(args.cpanel_user, args.path, {
            force: args.force
          }),
          'whm_cpanel_delete_user_file'
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
