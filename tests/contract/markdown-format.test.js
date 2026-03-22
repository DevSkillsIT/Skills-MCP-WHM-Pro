/**
 * Contract tests — Markdown format para 16 tools consolidadas
 * SPEC-WHM-ENHANCE-001 / F01
 * AC-04: TODAS as tools retornam Markdown (nao JSON)
 * AC-10: Sem JSON bruto nas respostas
 */
const { formatToolResponse, TOOL_FORMATTERS } = require('../../src/lib/formatters/response-formatter');

const MOCK_DATA = {
  'whm_cpanel_search_hosting_accounts': { args: { searchType: 'list', limit: 25 }, data: { success: true, data: { accounts: [{ user: 'u1', domain: 'd1.com', email: 'a@b.com', plan: 'default', diskused: '1G', suspended: false }] } } },
  'whm_cpanel_manage_hosting_accounts': { args: { action: 'suspend' }, data: { success: true, data: { message: 'Account suspended' } } },
  'whm_cpanel_search_server_status': { args: { type: 'status' }, data: { success: true, data: { version: '110', hostname: 'srv1', loadavg: ['1.0', '2.0', '1.5'], uptime: '30d' } } },
  'whm_cpanel_manage_server_service': { args: { action: 'restart_service' }, data: { success: true, data: { message: 'Service restarted' } } },
  'whm_cpanel_search_hosted_domains': { args: { searchType: 'all', limit: 25 }, data: { success: true, data: { domains: [{ domain: 'd1.com', user: 'u1', type: 'main', documentroot: '/home/u1/public_html' }] } } },
  'whm_cpanel_manage_hosted_domains': { args: { action: 'create_alias' }, data: { success: true, data: { message: 'Alias created' } } },
  'whm_cpanel_manage_dnssec_settings': { args: { action: 'get_ds_records' }, data: { success: true, data: [{ domain: 'd.com', keyTag: '12345', algorithm: '13', digest: 'abc' }] } },
  'whm_cpanel_search_dns_zone_records': { args: { searchType: 'zones', limit: 25 }, data: { success: true, data: { zones: [{ domain: 'd1.com', type: 'forward' }] } } },
  'whm_cpanel_manage_dns_zone_records': { args: { action: 'create' }, data: { success: true, data: { name: 'www', type: 'A', address: '1.2.3.4', ttl: 14400 } } },
  'whm_cpanel_manage_system_services': { args: { action: 'get_load' }, data: { success: true, data: { load1: '1.5', load5: '2.0', load15: '1.8' } } },
  'whm_cpanel_search_account_files': { args: { searchType: 'list', cpanel_user: 'u1' }, data: { success: true, data: { files: [{ name: 'index.php', type: 'file', size: '1K', mtime: '2025-01-01' }] } } },
  'whm_cpanel_manage_account_files': { args: { action: 'write' }, data: { success: true, data: { message: 'File written' } } },
};

describe('AC-04: Todas as 12 tools core retornam Markdown', () => {
  Object.entries(MOCK_DATA).forEach(([toolName, { args, data }]) => {
    test(`${toolName} retorna Markdown, nao JSON`, () => {
      const result = formatToolResponse(toolName, data, args);
      expect(result.length).toBeGreaterThan(0);
      // NAO deve comecar com { (JSON bruto)
      expect(result).not.toMatch(/^\s*\{[\s\S]*"[a-z_]+":/);
    });
  });
});

describe('AC-10: List tools contem tabela Markdown', () => {
  const listTools = ['whm_cpanel_search_hosting_accounts', 'whm_cpanel_search_hosted_domains', 'whm_cpanel_search_dns_zone_records', 'whm_cpanel_search_account_files'];
  listTools.forEach(toolName => {
    test(`${toolName} contem tabela |---|`, () => {
      const { args, data } = MOCK_DATA[toolName];
      const result = formatToolResponse(toolName, data, args);
      expect(result).toContain('|');
      expect(result).toContain('---');
      expect(result).toContain('resultados');
    });
  });
});

describe('AC-04a: Cenario Gherkin — busca de contas', () => {
  test('search_accounts retorna tabela com headers corretos', () => {
    const { args, data } = MOCK_DATA['whm_cpanel_search_hosting_accounts'];
    const result = formatToolResponse('whm_cpanel_search_hosting_accounts', data, args);
    expect(result).toContain('| Username | Dominio | Email | Plano | Disco | Status |');
    expect(result).toContain('resultados');
    expect(result).not.toContain('"user":');
  });
});

describe('Bridge tools retornam strings', () => {
  test('tools utilitarias passam strings direto', () => {
    const result = formatToolResponse('whm_cpanel_list_server_resources', 'markdown content', {});
    expect(result).toBe('markdown content');
  });
});

describe('TOOL_FORMATTERS count = 16 (12 core + 4 utility)', () => {
  test('exatamente 16 formatters registrados', () => {
    expect(Object.keys(TOOL_FORMATTERS).length).toBe(16);
  });
});
