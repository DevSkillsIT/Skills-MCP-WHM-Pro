#!/usr/bin/env node
/**
 * WHM/cPanel MCP Server - Tool Audit Transformation Script
 * Aplica todas as correções de nomenclatura, descrições e parâmetros
 */

import { readFileSync, writeFileSync } from 'fs';

const FILE = '/opt/mcp-servers/whm-cpanel/src/mcp-handler.js';
let content = readFileSync(FILE, 'utf8');

// ============================================================
// STEP 1: Tool name replacements (sorted longest first)
// ============================================================
const nameMap = {
  'domain_addon_conversion_details': 'whm_cpanel_get_addon_conversion_details',
  'domain_addon_conversion_status': 'whm_cpanel_get_addon_conversion_status',
  'domain_addon_start_conversion': 'whm_cpanel_create_addon_conversion',
  'domain_addon_list_conversions': 'whm_cpanel_list_addon_conversions',
  'domain_update_userdomains': 'whm_cpanel_update_userdomains_cache',
  'dns_check_alias_available': 'whm_cpanel_check_dns_alias_available',
  'dns_check_nested_domains': 'whm_cpanel_check_dns_nested_subdomains',
  'domain_create_subdomain': 'whm_cpanel_create_subdomain',
  'whm_get_account_summary': 'whm_cpanel_get_account_summary',
  'whm_unsuspend_account': 'whm_cpanel_unsuspend_account',
  'system_restart_service': 'whm_cpanel_restart_system_service',
  'whm_terminate_account': 'whm_cpanel_delete_account',
  'domain_check_authority': 'whm_cpanel_check_domain_authority',
  'domain_get_nsec3_status': 'whm_cpanel_get_nsec3_operation_status',
  'domain_addon_details': 'whm_cpanel_get_addon_domain_details',
  'domain_get_ds_records': 'whm_cpanel_get_dnssec_ds_records',
  'whm_suspend_account': 'whm_cpanel_suspend_account',
  'domain_get_user_data': 'whm_cpanel_get_domain_data',
  'whm_restart_service': 'whm_cpanel_restart_service',
  'whm_create_account': 'whm_cpanel_create_account',
  'domain_disable_nsec3': 'whm_cpanel_disable_dnssec_nsec3',
  'domain_enable_nsec3': 'whm_cpanel_enable_dnssec_nsec3',
  'domain_create_alias': 'whm_cpanel_create_domain_alias',
  'domain_get_all_info': 'whm_cpanel_list_all_domains',
  'domain_addon_list': 'whm_cpanel_list_addon_domains',
  'log_read_last_lines': 'whm_cpanel_read_system_log_lines',
  'whm_service_status': 'whm_cpanel_get_services_status',
  'whm_list_accounts': 'whm_cpanel_list_accounts',
  'dns_delete_record': 'whm_cpanel_delete_dns_record',
  'dns_search_record': 'whm_cpanel_search_dns_record',
  'domain_get_owner': 'whm_cpanel_get_domain_owner',
  'whm_server_status': 'whm_cpanel_get_server_status',
  'whm_list_domains': 'whm_cpanel_list_account_domains',
  'domain_resolve': 'whm_cpanel_resolve_domain_ip',
  'dns_add_record': 'whm_cpanel_create_dns_record',
  'dns_edit_record': 'whm_cpanel_update_dns_record',
  'dns_reset_zone': 'whm_cpanel_reset_dns_zone',
  'dns_list_zones': 'whm_cpanel_list_dns_zones',
  'system_get_load': 'whm_cpanel_get_system_load_metrics',
  'domain_delete': 'whm_cpanel_delete_domain',
  'dns_get_zone': 'whm_cpanel_get_dns_zone_records',
  'dns_list_mx': 'whm_cpanel_list_dns_mx_records',
  'dns_add_mx': 'whm_cpanel_create_dns_mx_record',
  'file_delete': 'whm_cpanel_delete_user_file',
  'file_write': 'whm_cpanel_write_user_file',
  'file_list': 'whm_cpanel_list_user_files',
  'file_read': 'whm_cpanel_read_user_file',
};

// Apply name replacements (in quoted strings only)
for (const [oldName, newName] of Object.entries(nameMap)) {
  content = content.replaceAll(`'${oldName}'`, `'${newName}'`);
  content = content.replaceAll(`"${oldName}"`, `"${newName}"`);
}

// ============================================================
// STEP 2: Description replacements (match by new tool name)
// ============================================================
function replaceDesc(toolName, newDesc) {
  const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `(name: '${escaped}',\\s*description: ')[^']*(')`
  );
  const match = content.match(regex);
  if (!match) {
    console.warn(`WARNING: Could not find description for ${toolName}`);
    return;
  }
  content = content.replace(regex, `$1${newDesc}$2`);
}

// WHM Account Tools
replaceDesc('whm_cpanel_list_accounts',
  'Lista todas as contas de hospedagem ativas e suspensas no servidor WHM/cPanel. Use esta ferramenta do WHM quando precisar visualizar o inventario completo de contas, verificar status ou localizar uma conta especifica. Retorna array com username, dominio, email, pacote e status de suspensao de cada conta.');

replaceDesc('whm_cpanel_create_account',
  'Cria nova conta de hospedagem cPanel no servidor WHM com dominio, usuario e pacote configuraveis. Use no WHM quando precisar provisionar um novo cliente ou criar conta de teste. Requer confirmationToken para seguranca. Retorna dados da conta criada incluindo usuario, dominio principal e IP atribuido.');

replaceDesc('whm_cpanel_suspend_account',
  'Suspende uma conta de hospedagem no servidor WHM/cPanel, bloqueando acesso ao cPanel, FTP e email do usuario. Use no WHM quando houver inadimplencia, violacao de termos ou manutencao programada. Dados sao preservados. Operacao reversivel via whm_cpanel_unsuspend_account.');

replaceDesc('whm_cpanel_unsuspend_account',
  'Reativa conta de hospedagem previamente suspensa no servidor WHM/cPanel, restaurando acesso completo ao cPanel, FTP, email e website. Use no WHM quando o cliente regularizar pagamento ou quando o motivo da suspensao for resolvido. Retorna confirmacao da reativacao e status atualizado.');

replaceDesc('whm_cpanel_delete_account',
  'Remove permanentemente uma conta de hospedagem do servidor WHM/cPanel, deletando arquivos, emails, bancos de dados e configuracoes. Use no WHM apenas para cancelamento definitivo. Acao destrutiva e irreversivel. Requer confirmationToken, flag confirm=true e motivo detalhado para auditoria.');

replaceDesc('whm_cpanel_get_account_summary',
  'Obtem resumo detalhado de uma conta de hospedagem especifica no servidor WHM/cPanel, incluindo uso de recursos e configuracoes. Use no WHM quando precisar verificar dados de um cliente, diagnosticar problemas de quota ou revisar alocacao de recursos. Retorna dominio, email, pacote, disco e bandwidth.');

replaceDesc('whm_cpanel_get_server_status',
  'Obtem status geral do servidor WHM/cPanel incluindo load average, uptime e versao do sistema. Use esta ferramenta do WHM quando precisar monitorar saude do servidor, verificar carga de CPU ou confirmar versao instalada. Retorna metricas de carga para 1, 5 e 15 minutos e tempo de atividade.');

replaceDesc('whm_cpanel_get_services_status',
  'Consulta status de todos os servicos do servidor WHM/cPanel incluindo Apache, MySQL, DNS, FTP e servicos de email. Use no WHM quando precisar diagnosticar problemas de conectividade ou verificar se servicos estao operacionais. Retorna estado individual de cada servico: ativo, parado ou com falha.');

replaceDesc('whm_cpanel_restart_service',
  'Reinicia um servico especifico do sistema via API do WHM/cPanel. Use no WHM quando precisar aplicar configuracoes ou resolver travamentos. Valores aceitos: httpd, mysql, named, postfix, dovecot, exim, nginx, pure-ftpd. Requer confirmationToken e motivo para auditoria. Operacao via API WHM.');

replaceDesc('whm_cpanel_list_account_domains',
  'Lista todos os dominios de uma conta cPanel especifica no servidor WHM, incluindo dominio principal, addon domains e subdominios. Use no WHM quando precisar verificar dominios de um cliente ou auditar configuracao. Retorna lista categorizada por tipo. Requer username da conta cPanel.');

// Domain Tools
replaceDesc('whm_cpanel_get_domain_data',
  'Obtem dados completos de um dominio especifico no servidor WHM/cPanel incluindo usuario, docroot, IP e versao PHP. Use no WHM quando souber o nome exato do dominio e precisar de informacoes detalhadas. Mais eficiente que whm_cpanel_list_all_domains para consulta unitaria. Retorna config completa.');

replaceDesc('whm_cpanel_list_all_domains',
  'Lista informacoes de todos os dominios do servidor WHM/cPanel com suporte a paginacao e filtros por tipo. Use no WHM quando precisar buscar dominios por nome ou tipo (addon, alias, subdomain, main). Suporta filtro por substring via domain_filter. Para dominio unico, prefira whm_cpanel_get_domain_data.');

replaceDesc('whm_cpanel_get_domain_owner',
  'Obtem o proprietario (username cPanel) de um dominio especifico no servidor WHM. Use no WHM quando precisar descobrir qual conta e dona de um dominio antes de realizar alteracoes. Retorna o username cPanel associado ao dominio consultado. Operacao somente leitura sem efeitos colaterais no WHM.');

replaceDesc('whm_cpanel_create_domain_alias',
  'Cria um dominio alias (parked domain) no servidor WHM/cPanel, apontando para o mesmo conteudo de outro dominio da conta. Use no WHM quando um cliente precisar de dominio alternativo redirecionado ao principal. O target_domain e opcional e assume o dominio principal. Retorna confirmacao de criacao.');

replaceDesc('whm_cpanel_create_subdomain',
  'Cria um subdominio no servidor WHM/cPanel vinculado a um dominio existente da conta. Use no WHM quando precisar criar subdominios como blog.exemplo.com ou api.exemplo.com para separar aplicacoes. O document_root e auto-gerado se omitido. Retorna configuracao do subdominio criado e docroot.');

replaceDesc('whm_cpanel_delete_domain',
  'Remove um dominio (addon, parked ou subdomain) do servidor WHM/cPanel. Use no WHM quando precisar deletar dominio que nao e mais necessario. Remove configuracao do dominio, porem arquivos no docroot nao sao deletados automaticamente. Requer tipo, confirmationToken e motivo detalhado.');

replaceDesc('whm_cpanel_resolve_domain_ip',
  'Resolve um nome de dominio para endereco IP via consulta DNS no servidor WHM/cPanel. Use no WHM quando precisar verificar para qual IP um dominio aponta ou diagnosticar problemas de resolucao DNS. Retorna endereco IP correspondente. Operacao somente leitura que nao altera configuracoes.');

replaceDesc('whm_cpanel_list_addon_domains',
  'Lista todos os addon domains de um usuario cPanel especifico no servidor WHM. Use no WHM quando precisar visualizar dominios adicionais de uma conta. Diferente de whm_cpanel_list_account_domains que inclui todos os tipos, esta retorna apenas addon domains com detalhes especificos do WHM.');

replaceDesc('whm_cpanel_get_addon_domain_details',
  'Obtem detalhes completos de um addon domain especifico no servidor WHM/cPanel, incluindo docroot e subdominio associado. Use no WHM quando precisar verificar configuracao detalhada de um addon. Retorna document root, subdominio vinculado e demais configuracoes do addon domain.');

replaceDesc('whm_cpanel_get_addon_conversion_status',
  'Consulta status de conversao de addon domain para conta independente no servidor WHM/cPanel. Use no WHM para acompanhar progresso de conversao em andamento. Retorna estado da operacao: pendente, concluido ou falha. O conversion_id e obtido via whm_cpanel_create_addon_conversion.');

replaceDesc('whm_cpanel_create_addon_conversion',
  'Inicia conversao de addon domain para conta cPanel independente no servidor WHM. Use no WHM quando cliente precisar migrar addon domain para conta propria com recursos dedicados. Requer confirmationToken e motivo. Retorna conversion_id para acompanhamento via whm_cpanel_get_addon_conversion_status.');

replaceDesc('whm_cpanel_get_addon_conversion_details',
  'Obtem detalhes completos de conversao de addon domain no servidor WHM/cPanel, incluindo logs e erros. Use no WHM quando precisar diagnosticar falhas ou verificar progresso detalhado. Diferente de whm_cpanel_get_addon_conversion_status, retorna logs completos e historico de todas as etapas.');

replaceDesc('whm_cpanel_list_addon_conversions',
  'Lista todas as conversoes de addon domains realizadas no servidor WHM/cPanel com historico completo. Use no WHM quando precisar auditar conversoes passadas ou verificar se ha conversoes pendentes. Retorna lista com status, datas e dominios envolvidos em cada operacao de conversao registrada.');

replaceDesc('whm_cpanel_check_domain_authority',
  'Verifica se o servidor WHM/cPanel e autoritativo para um dominio, ou seja, se controla sua zona DNS. Use no WHM antes de editar registros DNS para confirmar que o servidor possui autoridade sobre o dominio. Retorna status booleano. Verificacao essencial antes de operacoes DNS no servidor.');

replaceDesc('whm_cpanel_get_dnssec_ds_records',
  'Obtem registros DS (Delegation Signer) para configuracao DNSSEC de dominios no servidor WHM/cPanel. Use no WHM quando precisar configurar DNSSEC no registrar ou verificar configuracao existente. Aceita lista de ate 100 dominios por chamada. Retorna registros DS necessarios para o DNSSEC.');

replaceDesc('whm_cpanel_enable_dnssec_nsec3',
  'Habilita NSEC3 (DNSSEC aprimorado) para dominios no servidor WHM/cPanel, prevenindo ataques de zone walking. Use no WHM quando precisar fortalecer seguranca DNS. Aceita ate 50 dominios. Operacao assincrona que retorna operation_id para polling via whm_cpanel_get_nsec3_operation_status.');

replaceDesc('whm_cpanel_disable_dnssec_nsec3',
  'Desabilita NSEC3 para dominios no servidor WHM/cPanel, revertendo para NSEC padrao. Use no WHM quando precisar desativar protecao avancada de DNSSEC em dominios especificos. Aceita ate 50 dominios. Requer confirmationToken. Retorna operation_id para polling via whm_cpanel_get_nsec3_operation_status.');

replaceDesc('whm_cpanel_get_nsec3_operation_status',
  'Consulta status de operacao NSEC3 assincrona no servidor WHM/cPanel. Use no WHM para acompanhar operacoes de enable/disable NSEC3 via polling. O operation_id e retornado por whm_cpanel_enable_dnssec_nsec3 ou whm_cpanel_disable_dnssec_nsec3. Retorna estado: pendente, concluido ou falha.');

replaceDesc('whm_cpanel_update_userdomains_cache',
  'Atualiza o arquivo /etc/userdomains no servidor WHM/cPanel, sincronizando mapeamento entre dominios e usuarios. Use no WHM apenas para corrigir inconsistencias apos migracoes ou quando dominios nao resolvem para suas contas. Requer confirmationToken. Operacao protegida contra concorrencia no WHM.');

// DNS Tools
replaceDesc('whm_cpanel_list_dns_zones',
  'Lista todas as zonas DNS gerenciadas pelo servidor WHM/cPanel com informacoes de status. Use no WHM quando precisar visualizar todos os dominios com DNS configurado ou encontrar zona para edicao. Retorna array de zonas DNS ativas no servidor. Operacao somente leitura sem parametros obrigatorios.');

replaceDesc('whm_cpanel_get_dns_zone_records',
  'Obtem todos os registros de uma zona DNS no servidor WHM/cPanel com filtros por tipo e nome. Use no WHM quando precisar visualizar configuracao completa de DNS. Suporta filtros record_type e name_filter. Para registro especifico, prefira whm_cpanel_search_dns_record que e mais eficiente.');

replaceDesc('whm_cpanel_check_dns_nested_subdomains',
  'Verifica quantidade e estrutura de subdominios aninhados em uma zona DNS no servidor WHM/cPanel. Use no WHM para diagnosticar zonas complexas com muitos niveis de subdominios antes de alteracoes. Retorna estatisticas de aninhamento que ajudam a identificar complexidade da zona DNS.');

replaceDesc('whm_cpanel_search_dns_record',
  'Busca registros DNS especificos em uma zona do servidor WHM/cPanel com modos exact, contains ou startsWith. Use no WHM quando precisar localizar registro especifico de forma eficiente. Retorna registros com numero de linha necessario para edicao via whm_cpanel_update_dns_record.');

replaceDesc('whm_cpanel_create_dns_record',
  'Adiciona novo registro DNS em uma zona do servidor WHM/cPanel. Use no WHM para criar registros A, AAAA, CNAME, MX, TXT, NS ou PTR. Campos obrigatorios variam por tipo: address para A/AAAA, cname para CNAME, exchange para MX, txtdata para TXT. TTL padrao de 14400 segundos (4 horas).');

replaceDesc('whm_cpanel_update_dns_record',
  'Edita registro DNS existente em uma zona do servidor WHM/cPanel com suporte a optimistic locking. Use no WHM quando precisar alterar IP, TTL ou conteudo. Execute whm_cpanel_search_dns_record primeiro para obter numero da linha. O campo expected_content previne edicao concorrente.');

replaceDesc('whm_cpanel_delete_dns_record',
  'Remove registro DNS de uma zona no servidor WHM/cPanel. Operacao destrutiva que pode afetar servicos dependentes. Use no WHM apenas quando tiver certeza que o registro nao e necessario. Execute whm_cpanel_search_dns_record primeiro para obter a linha. Requer confirmationToken e motivo.');

replaceDesc('whm_cpanel_reset_dns_zone',
  'Reseta zona DNS para configuracao padrao no servidor WHM/cPanel, removendo todos os registros customizados. Operacao destrutiva que restaura zona ao estado inicial do WHM. Use apenas em ultimo recurso quando zona estiver corrompida. Requer confirmationToken e motivo detalhado para auditoria.');

replaceDesc('whm_cpanel_list_dns_mx_records',
  'Lista todos os registros MX (servidores de email) de um dominio no servidor WHM/cPanel. Use no WHM quando precisar verificar configuracao de entrega de email ou diagnosticar problemas de recebimento. Retorna lista de servidores MX com respectivas prioridades. Operacao somente leitura.');

replaceDesc('whm_cpanel_create_dns_mx_record',
  'Adiciona novo registro MX para um dominio no servidor WHM/cPanel de forma idempotente, verificando duplicatas. Use no WHM quando precisar configurar servidor de email ou adicionar MX backup. Prioridade padrao 10 (menor valor = maior prioridade). Valores aceitos de 0 a 65535 para prioridade.');

replaceDesc('whm_cpanel_check_dns_alias_available',
  'Verifica se nome de registro ALIAS esta disponivel em uma zona DNS do servidor WHM/cPanel. Use no WHM antes de criar novo registro para garantir que o nome nao esta em uso. Retorna status de disponibilidade. Operacao somente leitura essencial para prevenir conflitos em zonas DNS do WHM.');

// System/SSH Tools
replaceDesc('whm_cpanel_restart_system_service',
  'Reinicia servico do sistema via conexao SSH no servidor WHM/cPanel. Use no WHM quando precisar reiniciar servico por via alternativa a API. Valores aceitos: httpd, mysql, named, postfix, dovecot, exim, nginx, pure-ftpd. Similar a whm_cpanel_restart_service porem executa via SSH diretamente.');

replaceDesc('whm_cpanel_get_system_load_metrics',
  'Obtem metricas detalhadas de carga do servidor WHM/cPanel incluindo CPU (load average), memoria RAM e uso de disco via SSH. Use no WHM quando precisar diagnosticar lentidao ou monitorar recursos em tempo real. Retorna load average de 1, 5 e 15 minutos, memoria livre e espaco em disco.');

replaceDesc('whm_cpanel_read_system_log_lines',
  'Le ultimas linhas de arquivo de log do sistema no servidor WHM/cPanel via SSH. Use no WHM quando precisar diagnosticar erros recentes ou verificar logs de servico. Caminhos permitidos: /var/log/*, /usr/local/apache/logs/*, /usr/local/cpanel/logs/*. Padrao: 50 linhas retornadas.');

// File Tools
replaceDesc('whm_cpanel_list_user_files',
  'Lista arquivos e diretorios do home de um usuario cPanel no servidor WHM. Use no WHM quando precisar navegar na estrutura de arquivos de um cliente ou encontrar arquivos especificos. Restrito ao diretorio /home/{usuario} por seguranca do WHM. Retorna listagem com nomes, tamanhos e datas.');

replaceDesc('whm_cpanel_read_user_file',
  'Le conteudo de arquivo no home de um usuario cPanel no servidor WHM. Use no WHM quando precisar visualizar configuracoes, codigo-fonte ou diagnosticar problemas em arquivos do cliente. Restrito a /home/{usuario} por seguranca contra travessia de diretorio. Retorna conteudo completo do WHM.');

replaceDesc('whm_cpanel_write_user_file',
  'Escreve ou sobrescreve conteudo em arquivo no home de um usuario cPanel no servidor WHM. Use no WHM quando precisar criar ou atualizar arquivos de configuracao. Cria backup automatico antes de sobrescrever. Requer confirmationToken e motivo. Restrito a /home/{usuario} por seguranca do WHM.');

replaceDesc('whm_cpanel_delete_user_file',
  'Deleta permanentemente arquivo do home de um usuario cPanel no servidor WHM. Operacao destrutiva e irreversivel. Use no WHM apenas quando tiver certeza que o arquivo nao e mais necessario. Restrito a /home/{usuario} por seguranca do WHM. Requer confirmationToken e motivo para auditoria.');

// ============================================================
// STEP 3: Parameter renames in schemas and args references
// ============================================================
content = content.replaceAll("cpanelUser: { type: 'string'", "cpanel_user: { type: 'string'");
content = content.replaceAll("'cpanelUser'", "'cpanel_user'");
content = content.replaceAll("args.cpanelUser", "args.cpanel_user");

content = content.replace(
  /matchMode: \{\s*type: 'string',\s*enum: \['exact', 'contains', 'startsWith'\],\s*description: '[^']*'/,
  "match_mode: {\n            type: 'string',\n            enum: ['exact', 'contains', 'startsWith'],\n            description: 'Modo de correspondencia do nome. Valores aceitos: exact (correspondencia exata, padrao), contains (contem substring), startsWith (inicia com o texto informado)'"
);
content = content.replaceAll("args.matchMode", "args.match_mode");

content = content.replace(
  /alwaysaccept: \{ type: 'boolean', default: false, description: '[^']*' \}/,
  "always_accept: { type: 'boolean', default: false, description: 'Define se o servidor deve sempre aceitar email para este MX, mesmo sem conta local configurada' }"
);
content = content.replaceAll("args.alwaysaccept", "args.always_accept");

content = content.replace(
  /logfile: \{ type: 'string', description: '[^']*' \}/,
  "log_file: { type: 'string', description: 'Caminho absoluto do arquivo de log. Caminhos permitidos: /var/log/*, /usr/local/apache/logs/*, /usr/local/cpanel/logs/*' }"
);
content = content.replaceAll("'logfile'", "'log_file'");
content = content.replaceAll("args.logfile", "args.log_file");

// ============================================================
// STEP 4: Add TOOL_CATEGORIES map
// ============================================================
const CATEGORIES_MAP = `
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
`;

content = content.replace(
  "const toolDefinitions = buildToolDefinitions();",
  `const toolDefinitions = buildToolDefinitions();\n${CATEGORIES_MAP}`
);

// ============================================================
// STEP 5: Replace executeTool routing logic
// ============================================================
const NEW_ROUTING = `    // Routing por categoria via TOOL_CATEGORIES map
    const category = TOOL_CATEGORIES[name];
    if (!category) {
      throw new Error(\`Unknown tool: \${name}. Use tools/list to see available tools.\`);
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
        throw new Error(\`Unknown tool category for: \${name}\`);
    }`;

content = content.replace(
  /    \/\/ WHM Tools\s*\n\s*if \(name\.startsWith\('whm_'\)\) \{\s*\n\s*return await this\.executeWhmTool\(name, enrichedArgs\);\s*\n\s*\}\s*\n\s*\/\/ Domain Tools.*?\n\s*if \(name\.startsWith\('domain_'\)\) \{\s*\n\s*return await this\.executeDomainTool\(name, enrichedArgs\);\s*\n\s*\}\s*\n\s*\/\/ DNS Tools\s*\n\s*if \(name\.startsWith\('dns_'\)\) \{\s*\n\s*return await this\.executeDnsTool\(name, enrichedArgs\);\s*\n\s*\}\s*\n\s*\/\/ SSH\/System Tools\s*\n\s*if \(name\.startsWith\('system_'\) \|\| name\.startsWith\('log_'\)\) \{\s*\n\s*return await this\.executeSshTool\(name, enrichedArgs\);\s*\n\s*\}\s*\n\s*\/\/ File Tools\s*\n\s*if \(name\.startsWith\('file_'\)\) \{\s*\n\s*return await this\.executeFileTool\(name, enrichedArgs\);\s*\n\s*\}\s*\n\s*throw new Error\(`Unknown tool category: \$\{name\}`\);/s,
  NEW_ROUTING
);

// ============================================================
// STEP 6: Fix dns_list_zones schema reference
// ============================================================
content = content.replace(
  "inputSchema: dnsSchema.tools['whm_cpanel_list_dns_zones'].inputSchema",
  "inputSchema: dnsSchema.tools['dns_list_zones'].inputSchema"
);

// ============================================================
// STEP 7: Update suggestion in tool-not-found error
// ============================================================
content = content.replace(
  /suggestion: 'Use .*?'/,
  "suggestion: 'Use tools/list para ver todas as tools disponiveis. Nomes iniciam com whm_cpanel_'"
);

// ============================================================
// WRITE OUTPUT
// ============================================================
writeFileSync(FILE, content, 'utf8');

// ============================================================
// VERIFICATION
// ============================================================
const finalContent = readFileSync(FILE, 'utf8');
const oldNames = Object.keys(nameMap);
const issues = [];

for (const oldName of oldNames) {
  if (finalContent.includes(`'${oldName}'`) || finalContent.includes(`"${oldName}"`)) {
    issues.push(`OLD NAME STILL PRESENT: ${oldName}`);
  }
}

if (finalContent.includes('args.cpanelUser')) issues.push('OLD PARAM: args.cpanelUser');
if (finalContent.includes('args.matchMode')) issues.push('OLD PARAM: args.matchMode');
if (finalContent.includes('args.alwaysaccept') && !finalContent.includes('args.always_accept')) issues.push('OLD PARAM: args.alwaysaccept');
if (finalContent.includes('args.logfile')) issues.push('OLD PARAM: args.logfile');
if (!finalContent.includes('TOOL_CATEGORIES')) issues.push('MISSING: TOOL_CATEGORIES map');
if (finalContent.includes("name.startsWith('domain_')")) issues.push('OLD ROUTING: domain_ prefix check');
if (finalContent.includes("name.startsWith('dns_')")) issues.push('OLD ROUTING: dns_ prefix check');
if (finalContent.includes("name.startsWith('file_')")) issues.push('OLD ROUTING: file_ prefix check');

// Count new tool names
let newNameCount = 0;
for (const newName of Object.values(nameMap)) {
  if (finalContent.includes(`'${newName}'`)) newNameCount++;
}

console.log('=== WHM MCP TRANSFORMATION REPORT ===');
console.log(`Tools renamed: ${oldNames.length}`);
console.log(`New names found in file: ${newNameCount}/${oldNames.length}`);
console.log(`TOOL_CATEGORIES present: ${finalContent.includes('TOOL_CATEGORIES') ? 'YES' : 'NO'}`);
console.log(`Issues found: ${issues.length}`);
if (issues.length > 0) {
  console.log('ISSUES:');
  issues.forEach(i => console.log(`  - ${i}`));
} else {
  console.log('ALL CHECKS PASSED');
}
console.log(`File written: ${FILE}`);
console.log(`File size: ${finalContent.length} bytes`);
