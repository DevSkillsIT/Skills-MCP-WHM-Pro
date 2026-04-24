/**
 * Response Formatter — Interceptor centralizado de formatacao Markdown
 * SPEC-WHM-ENHANCE-001 / F01, F06
 *
 * Pattern identico ao Hudu (src/formatters/response-formatter.ts) e
 * Veeam (lib/formatters/response-formatter.js).
 *
 * Recebe dados como OBJETOS JS, NAO como strings JSON.
 * NUNCA fazer JSON.stringify -> JSON.parse round-trip.
 *
 * REQ-F01-010: TOOL_FORMATTERS tem entrada para CADA tool (12 core + 4 utilitarias = 16).
 */

const {
  formatAccountsList, formatAccountDetail, formatAccountDomains,
  formatServerStatus, formatServicesStatus,
  formatDomainsList, formatDomainDetail,
  formatDnsZonesList, formatDnsRecordsList, formatDnsRecordDetail, formatMxRecordsList,
  formatDnssecInfo,
  formatSystemLoad, formatLogLines,
  formatFilesList, formatFileContent,
  formatOperationResult,
} = require('./whm-formatters');
const { checkResponseSize, paginate } = require('./markdown-helpers');

/**
 * Mapa de formatters para as 16 tools (12 core + 4 utilitarias).
 * Cada entrada converte dados da resposta em Markdown.
 *
 * Pattern (identico ao Hudu/Veeam):
 * - search_* tools: roteiam por searchType -> lista Markdown paginada
 * - manage_* tools: roteiam por action -> detalhe ou operacao Markdown
 * - utility tools: retornam strings direto (type check)
 */
const TOOL_FORMATTERS = {
  // === CONTAS (2) ===
  'whm_cpanel_search_hosting_accounts': (data, args) => {
    const st = args?.searchType || 'list';
    if (st === 'summary') return formatAccountDetail(data);
    if (st === 'domains') return formatAccountDomains(data);
    const items = Array.isArray(data) ? data : (data?.accounts || data?.acct || data?.data || []);
    const paged = paginate(items, args?.limit, args?.offset);
    return formatAccountsList(paged);
  },
  'whm_cpanel_manage_hosting_accounts': (data, args) => {
    const action = args?.action;
    if (action === 'create') return formatAccountDetail(data);
    return formatOperationResult(data, action);
  },

  // === SERVIDOR (2) ===
  'whm_cpanel_search_server_status': (data, args) => {
    const type = args?.type || 'status';
    if (type === 'services') return formatServicesStatus(data);
    return formatServerStatus(data);
  },
  'whm_cpanel_manage_server_service': (data, args) => {
    return formatOperationResult(data, args?.action || 'restart_service');
  },

  // === DOMINIOS (3) ===
  'whm_cpanel_search_hosted_domains': (data, args) => {
    const st = args?.searchType || 'all';
    if (st === 'data' || st === 'owner' || st === 'addon_details' || st === 'authority') return formatDomainDetail(data);
    const items = Array.isArray(data) ? data : (data?.domains || data?.data || []);
    const paged = paginate(items, args?.limit, args?.offset);
    return formatDomainsList(paged);
  },
  'whm_cpanel_manage_hosted_domains': (data, args) => {
    const action = args?.action;
    if (action === 'resolve_ip') return formatDomainDetail(data);
    if (action === 'get_conversion_details') return formatOperationResult(data, action);
    return formatOperationResult(data, action);
  },
  'whm_cpanel_manage_dnssec_settings': (data, args) => {
    const action = args?.action;
    if (action === 'get_ds_records' || action === 'get_status') return formatDnssecInfo(data);
    return formatOperationResult(data, action);
  },

  // === DNS (2) ===
  'whm_cpanel_search_dns_zone_records': (data, args) => {
    const st = args?.searchType || 'zones';
    if (st === 'records' || st === 'search') {
      const items = Array.isArray(data) ? data : (data?.records || data?.matches || data?.data || []);
      const paged = paginate(items, args?.limit || args?.max_records, args?.offset);
      return formatDnsRecordsList(paged);
    }
    if (st === 'mx_records') {
      const records = Array.isArray(data) ? data : (data?.records || data?.data || []);
      return formatMxRecordsList(records);
    }
    if (st === 'nested_subdomains') {
      if (!data) return 'Sem subdominios aninhados.';
      if (typeof data === 'string') return data;
      return formatOperationResult(data, 'nested_subdomains');
    }
    if (st === 'alias_check') {
      if (!data) return 'Verificacao de alias nao disponivel.';
      if (typeof data === 'string') return data;
      if (data.available !== undefined) return data.available ? 'Alias disponivel para uso.' : 'Alias ja esta em uso.';
      return formatOperationResult(data, 'alias_check');
    }
    // zones (default)
    const items = Array.isArray(data) ? data : (data?.zones || data?.data || []);
    const paged = paginate(items, args?.limit, args?.offset);
    return formatDnsZonesList(paged);
  },
  'whm_cpanel_manage_dns_zone_records': (data, args) => {
    const action = args?.action;
    if (action === 'create' || action === 'update' || action === 'create_mx') {
      // addRecord returns { message, record: { type, name, ... }, backup_created }
      const record = data?.record || data;
      const md = formatDnsRecordDetail(record);
      // Append success message if available
      return data?.message ? `${data.message}\n\n${md}` : md;
    }
    return formatOperationResult(data, action);
  },

  // === SISTEMA (1) ===
  'whm_cpanel_manage_system_services': (data, args) => {
    const action = args?.action;
    if (action === 'get_load') return formatSystemLoad(data);
    if (action === 'read_logs') return formatLogLines(data);
    return formatOperationResult(data, action);
  },

  // === ARQUIVOS (2) ===
  'whm_cpanel_search_account_files': (data, args) => {
    const st = args?.searchType || 'list';
    if (st === 'read') return formatFileContent(data);
    const items = Array.isArray(data) ? data : (data?.files || data?.data || []);
    const paged = paginate(items, args?.limit || 25, 0);
    return formatFilesList(paged);
  },
  'whm_cpanel_manage_account_files': (data, args) => {
    return formatOperationResult(data, args?.action);
  },

  // === UTILITARIOS (4) ===
  'whm_cpanel_list_server_resources': (data) => typeof data === 'string' ? data : JSON.stringify(data, null, 2),
  'whm_cpanel_read_server_resource': (data) => typeof data === 'string' ? data : JSON.stringify(data, null, 2),
  'whm_cpanel_list_server_prompts': (data) => typeof data === 'string' ? data : JSON.stringify(data, null, 2),
  'whm_cpanel_get_analysis_prompt': (data) => typeof data === 'string' ? data : JSON.stringify(data, null, 2),
};

/**
 * Interceptor central: converte resposta de tool para Markdown.
 * Chamado em mcp-handler.js no handleToolCall().
 *
 * FIX [A1]: Unwrap success wrapper dos executors.
 * FIX [G1]: search_* com null -> empty paged result.
 * FIX [G2]: Fallback chain aplicado no ponto de integracao (mcp-handler.js).
 */
function formatToolResponse(toolName, data, args) {
  // Caso 1: data ja e string (Markdown pronto ou mensagem de texto)
  if (typeof data === 'string') return data;

  // Caso 2: Unwrap success wrapper (executors retornam { success: true, data: {...} })
  if (data?.success !== undefined && data?.data !== undefined) {
    data = data.data;
  }

  // Caso 3: search_* tools com null/undefined -> tratar como lista vazia
  if ((data === null || data === undefined) && toolName.includes('search_')) {
    data = { items: [], count: 0, total: 0, limit: 25, offset: 0 };
  }

  // Caso 4: null/undefined para outras tools
  if (data === null || data === undefined) return '';

  // Caso 5: buscar formatter registrado
  const formatter = TOOL_FORMATTERS[toolName];
  if (formatter) {
    const markdown = formatter(data, args || {});
    const sizeCheck = checkResponseSize(markdown);
    if (sizeCheck.exceeded) return sizeCheck.message;
    return markdown;
  }

  // Fallback: JSON.stringify (NAO deve acontecer — todas as 20 tools devem ter formatter)
  return JSON.stringify(data, null, 2);
}

module.exports = { formatToolResponse, TOOL_FORMATTERS };
